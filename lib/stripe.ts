import { loadStripe } from '@stripe/stripe-js';
import { Platform } from 'react-native';

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
export type PaymentStatus = 'pending' | 'processing' | 'succeeded' | 'failed';

// Error handler for Stripe operations
export const handleStripeError = (error: any) => {
  let message = 'An error occurred with the payment';
  
  if (error.type === 'card_error' || error.type === 'validation_error') {
    message = error.message;
  }
  
  return message;
};