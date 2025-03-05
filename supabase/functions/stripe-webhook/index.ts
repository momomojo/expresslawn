import { serve } from 'https://deno.fresh.dev/std@v1/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import Stripe from 'https://esm.sh/stripe@14.14.0';

// Initialize Stripe with secret key from environment
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

// Initialize Supabase client
const supabaseClient = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

serve(async (req) => {
  try {
    // Get the signature from headers
    const signature = req.headers.get('stripe-signature');
    if (!signature) {
      return new Response('No signature provided', { status: 400 });
    }

    // Get the raw body
    const body = await req.text();

    // Verify webhook signature
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        body,
        signature,
        Deno.env.get('STRIPE_WEBHOOK_SIGNING_SECRET')!
      );
    } catch (err) {
      console.error(`Webhook signature verification failed: ${err.message}`);
      return new Response(`Webhook Error: ${err.message}`, { status: 400 });
    }

    // Record the webhook event
    const { data: webhookEvent, error: recordError } = await supabaseClient.rpc(
      'record_webhook_event',
      {
        p_stripe_event_id: event.id,
        p_event_type: event.type,
        p_event_data: event.data,
        p_idempotency_key: crypto.randomUUID()
      }
    );

    if (recordError) {
      console.error('Error recording webhook:', recordError);
      return new Response('Error recording webhook event', { status: 500 });
    }

    // Handle different event types
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentSuccess(event.data.object);
        break;

      case 'payment_intent.payment_failed':
        await handlePaymentFailure(event.data.object);
        break;

      case 'charge.dispute.created':
        await handleDisputeCreated(event.data.object);
        break;

      case 'invoice.paid':
        await handleInvoicePaid(event.data.object);
        break;

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object);
        break;
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (err) {
    console.error('Webhook error:', err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }
});

async function handlePaymentSuccess(paymentIntent: Stripe.PaymentIntent) {
  try {
    // Update booking payment status
    const { error: updateError } = await supabaseClient
      .from('bookings')
      .update({
        payment_status: 'paid',
        stripe_payment_intent_id: paymentIntent.id,
        updated_at: new Date().toISOString()
      })
      .eq('stripe_payment_intent_id', paymentIntent.id);

    if (updateError) throw updateError;

    // Create invoice if needed
    if (paymentIntent.metadata.create_invoice === 'true') {
      const { error: invoiceError } = await supabaseClient
        .from('invoices')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('stripe_payment_intent_id', paymentIntent.id);

      if (invoiceError) throw invoiceError;
    }
  } catch (err) {
    console.error('Error handling payment success:', err);
    throw err;
  }
}

async function handlePaymentFailure(paymentIntent: Stripe.PaymentIntent) {
  try {
    const { error: updateError } = await supabaseClient
      .from('bookings')
      .update({
        payment_status: 'failed',
        updated_at: new Date().toISOString()
      })
      .eq('stripe_payment_intent_id', paymentIntent.id);

    if (updateError) throw updateError;
  } catch (err) {
    console.error('Error handling payment failure:', err);
    throw err;
  }
}

async function handleDisputeCreated(dispute: Stripe.Dispute) {
  try {
    // Create dispute record
    const { error: disputeError } = await supabaseClient
      .from('payment_disputes')
      .insert({
        stripe_dispute_id: dispute.id,
        payment_attempt_id: dispute.payment_intent,
        amount: dispute.amount,
        status: dispute.status,
        reason: dispute.reason,
        evidence_due_by: dispute.evidence_details?.due_by
          ? new Date(dispute.evidence_details.due_by * 1000).toISOString()
          : null
      });

    if (disputeError) throw disputeError;
  } catch (err) {
    console.error('Error handling dispute created:', err);
    throw err;
  }
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  try {
    const { error: updateError } = await supabaseClient
      .from('invoices')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('stripe_invoice_id', invoice.id);

    if (updateError) throw updateError;
  } catch (err) {
    console.error('Error handling invoice paid:', err);
    throw err;
  }
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  try {
    const { error: updateError } = await supabaseClient
      .from('invoices')
      .update({
        status: 'pending',
        updated_at: new Date().toISOString()
      })
      .eq('stripe_invoice_id', invoice.id);

    if (updateError) throw updateError;
  } catch (err) {
    console.error('Error handling invoice payment failed:', err);
    throw err;
  }
}