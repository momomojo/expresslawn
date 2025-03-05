// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

// Import Stripe and Supabase client
import Stripe from 'npm:stripe@12.18.0';
import { createClient } from 'npm:@supabase/supabase-js@2.38.4';

// Initialize Stripe with secret key from environment
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2022-11-15',
});

// Initialize Supabase client
const supabaseClient = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

console.log("Hello from Functions!")

Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
      status: 204,
    });
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 405,
    });
  }

  try {
    // Get request body
    const { bookingId, customerId, paymentMethodId, savePaymentMethod } = await req.json();

    // Validate required parameters
    if (!bookingId) {
      return new Response(JSON.stringify({ error: 'Booking ID is required' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    // Get booking details
    const { data: booking, error: bookingError } = await supabaseClient
      .from('bookings')
      .select('*, provider:provider_id(*)')
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      return new Response(JSON.stringify({ error: 'Booking not found' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 404,
      });
    }

    // Ensure booking belongs to the customer
    if (booking.customer_id !== customerId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 403,
      });
    }

    // Get or create Stripe customer
    let stripeCustomerId;
    const { data: customer } = await supabaseClient
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', customerId)
      .single();

    if (customer?.stripe_customer_id) {
      stripeCustomerId = customer.stripe_customer_id;
    } else {
      // Get customer details
      const { data: customerData, error: customerError } = await supabaseClient
        .from('profiles')
        .select('email, full_name')
        .eq('id', customerId)
        .single();

      if (customerError || !customerData) {
        return new Response(JSON.stringify({ error: 'Customer not found' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 404,
        });
      }

      // Create Stripe customer
      const stripeCustomer = await stripe.customers.create({
        email: customerData.email || '',
        name: customerData.full_name || '',
        metadata: {
          supabase_id: customerId,
        },
      });

      stripeCustomerId = stripeCustomer.id;

      // Save Stripe customer ID
      await supabaseClient
        .from('profiles')
        .update({ stripe_customer_id: stripeCustomerId })
        .eq('id', customerId);
    }

    // Calculate amount in cents
    const amount = Math.round(booking.total_price * 100);

    // Create payment intent
    const paymentIntentParams = {
      amount,
      currency: 'usd',
      customer: stripeCustomerId,
      metadata: {
        booking_id: bookingId,
        provider_id: booking.provider_id,
      },
      description: `Payment for booking #${bookingId}`,
    };

    // If payment method is provided, attach it
    if (paymentMethodId) {
      Object.assign(paymentIntentParams, {
        payment_method: paymentMethodId,
        confirm: true,
        setup_future_usage: savePaymentMethod ? 'off_session' : undefined,
      });
    }

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);

    // Record payment attempt
    await supabaseClient.from('payment_attempts').insert({
      booking_id: bookingId,
      stripe_payment_intent_id: paymentIntent.id,
      amount: booking.total_price,
      status: paymentIntent.status,
    });

    // Update booking with payment intent ID
    await supabaseClient
      .from('bookings')
      .update({
        payment_status: paymentIntent.status,
        stripe_payment_intent_id: paymentIntent.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', bookingId);

    // Return payment intent client secret
    return new Response(
      JSON.stringify({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status,
      }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: unknown) {
    console.error('Error creating payment intent:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to create payment intent';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/create-payment-intent' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
