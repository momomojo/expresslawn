import { loadStripe } from '@stripe/stripe-js';
import { Platform } from 'react-native';
import { supabase } from './supabase';

// Initialize Stripe
export const stripe = Platform.OS === 'web' 
  ? loadStripe(process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY!)
  : null;

// Helper to format amounts for Stripe (converts to cents)
export const formatAmountForStripe = (amount: number) => {
  return Math.round(amount * 100);
};

// Helper to format amounts for display (converts from cents)
export const formatAmountFromStripe = (amount: number) => {
  return (amount / 100).toFixed(2);
};

// Payment status types
export type PaymentStatus = 'pending' | 'processing' | 'succeeded' | 'failed' | 'cancelled' | 'refunded';

// Error handler for Stripe operations
export const handleStripeError = (error: any) => {
  let message = 'An error occurred with the payment';
  
  if (error.type === 'card_error' || error.type === 'validation_error') {
    message = error.message;
  }
  
  return message;
};

// Create a payment intent
export const createPaymentIntent = async (bookingId: string, paymentMethodId?: string, savePaymentMethod = false) => {
  try {
    const { data } = await supabase.auth.getSession();
    
    if (!data.session) {
      throw new Error('User not authenticated');
    }
    
    // Using non-null assertion since we've checked above
    const session = data.session!;
    
    const response = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/create-payment-intent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        bookingId,
        customerId: session.user.id,
        paymentMethodId,
        savePaymentMethod,
      }),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to create payment intent');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error creating payment intent:', error);
    throw error;
  }
};

// Save a payment method
export const savePaymentMethod = async (paymentMethodId: string) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }
    
    // First check if this payment method already exists
    const { data: existingMethods } = await supabase
      .from('payment_methods')
      .select('*')
      .eq('customer_id', user.id)
      .eq('stripe_payment_method_id', paymentMethodId);
    
    if (existingMethods && existingMethods.length > 0) {
      return existingMethods[0];
    }
    
    // Get payment method details from Stripe
    const { data: { session } } = await supabase.auth.getSession();
    
    const response = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/get-payment-method`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        paymentMethodId,
      }),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to get payment method');
    }
    
    const paymentMethod = await response.json();
    
    // Save payment method to database
    const { data, error } = await supabase.from('payment_methods').insert({
      customer_id: user.id,
      stripe_payment_method_id: paymentMethodId,
      type: paymentMethod.type,
      last4: paymentMethod.card?.last4,
      exp_month: paymentMethod.card?.exp_month,
      exp_year: paymentMethod.card?.exp_year,
      card_brand: paymentMethod.card?.brand,
      is_default: false,
    }).select();
    
    if (error) {
      throw error;
    }
    
    return data[0];
  } catch (error) {
    console.error('Error saving payment method:', error);
    throw error;
  }
};

// Get saved payment methods
export const getPaymentMethods = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }
    
    const { data, error } = await supabase
      .from('payment_methods')
      .select('*')
      .eq('customer_id', user.id)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });
    
    if (error) {
      throw error;
    }
    
    return data;
  } catch (error) {
    console.error('Error getting payment methods:', error);
    throw error;
  }
};

// Set default payment method
export const setDefaultPaymentMethod = async (paymentMethodId: string) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }
    
    // First, set all payment methods to non-default
    await supabase
      .from('payment_methods')
      .update({ is_default: false })
      .eq('customer_id', user.id);
    
    // Then set the selected one as default
    const { data, error } = await supabase
      .from('payment_methods')
      .update({ is_default: true })
      .eq('customer_id', user.id)
      .eq('id', paymentMethodId)
      .select();
    
    if (error) {
      throw error;
    }
    
    return data[0];
  } catch (error) {
    console.error('Error setting default payment method:', error);
    throw error;
  }
};

// Delete payment method
export const deletePaymentMethod = async (paymentMethodId: string) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }
    
    const { error } = await supabase
      .from('payment_methods')
      .delete()
      .eq('customer_id', user.id)
      .eq('id', paymentMethodId);
    
    if (error) {
      throw error;
    }
    
    return true;
  } catch (error) {
    console.error('Error deleting payment method:', error);
    throw error;
  }
};