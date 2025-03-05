import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch, Alert, ActivityIndicator } from 'react-native';
import { CardField, useStripe, CardFieldInput } from '@stripe/stripe-react-native';
import { createPaymentIntent, savePaymentMethod } from '../../lib/stripe';
import PaymentMethodSelector from './PaymentMethodSelector';

interface PaymentScreenProps {
  bookingId: string;
  amount: number;
  onPaymentSuccess: () => void;
  onPaymentFailure: (error: string) => void;
}

export default function PaymentScreen({ bookingId, amount, onPaymentSuccess, onPaymentFailure }: PaymentScreenProps) {
  const { confirmPayment, createPaymentMethod } = useStripe();
  const [loading, setLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null);
  const [useNewCard, setUseNewCard] = useState(false);
  const [saveCard, setSaveCard] = useState(false);
  const [cardDetails, setCardDetails] = useState<CardFieldInput.Details | null>(null);

  const handlePayment = async () => {
    try {
      setLoading(true);

      if (useNewCard) {
        if (!cardDetails?.complete) {
          Alert.alert('Error', 'Please enter complete card information');
          setLoading(false);
          return;
        }

        // Create payment method for the new card
        const { paymentMethod: stripePaymentMethod, error: pmError } = await createPaymentMethod({
          paymentMethodType: 'Card',
          paymentMethodData: {
            billingDetails: {
              // You can add billing details here if needed
            },
          },
        });

        if (pmError) {
          throw new Error(pmError.message);
        }

        // Save the payment method if requested
        if (saveCard && stripePaymentMethod) {
          await savePaymentMethod(stripePaymentMethod.id);
        }

        // Create and confirm payment intent
        const { clientSecret } = await createPaymentIntent(
          bookingId,
          stripePaymentMethod?.id,
          saveCard
        );

        const { error: paymentError } = await confirmPayment(clientSecret, {
          paymentMethodType: 'Card',
        });

        if (paymentError) {
          throw new Error(paymentError.message);
        }
      } else {
        // Use existing payment method
        if (!paymentMethod) {
          Alert.alert('Error', 'Please select a payment method');
          setLoading(false);
          return;
        }

        // Create and confirm payment intent with existing payment method
        const { clientSecret } = await createPaymentIntent(bookingId, paymentMethod);

        const { error: paymentError } = await confirmPayment(clientSecret, {
          paymentMethodType: 'Card',
        });

        if (paymentError) {
          throw new Error(paymentError.message);
        }
      }

      // Payment successful
      onPaymentSuccess();
    } catch (error) {
      console.error('Payment error:', error);
      onPaymentFailure(error instanceof Error ? error.message : 'An error occurred during payment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Payment</Text>
      <Text style={styles.amount}>${amount.toFixed(2)}</Text>

      <View style={styles.paymentMethodToggle}>
        <TouchableOpacity
          style={[styles.toggleButton, !useNewCard && styles.toggleButtonActive]}
          onPress={() => setUseNewCard(false)}
        >
          <Text style={[styles.toggleButtonText, !useNewCard && styles.toggleButtonTextActive]}>
            Saved Cards
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleButton, useNewCard && styles.toggleButtonActive]}
          onPress={() => setUseNewCard(true)}
        >
          <Text style={[styles.toggleButtonText, useNewCard && styles.toggleButtonTextActive]}>
            New Card
          </Text>
        </TouchableOpacity>
      </View>

      {useNewCard ? (
        <View style={styles.newCardSection}>
          <CardField
            postalCodeEnabled={true}
            placeholders={{
              number: '4242 4242 4242 4242',
            }}
            style={styles.cardField}
            onCardChange={(cardDetails) => setCardDetails(cardDetails)}
          />
          <View style={styles.saveCardOption}>
            <Text style={styles.saveCardText}>Save card for future payments</Text>
            <Switch value={saveCard} onValueChange={setSaveCard} />
          </View>
        </View>
      ) : (
        <View style={styles.savedCardsSection}>
          <PaymentMethodSelector
            onSelect={setPaymentMethod}
            selectedId={paymentMethod}
          />
        </View>
      )}

      <TouchableOpacity
        style={[styles.payButton, loading && styles.payButtonDisabled]}
        onPress={handlePayment}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={styles.payButtonText}>Pay ${amount.toFixed(2)}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: '#fff',
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  amount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0066cc',
    marginBottom: 20,
    textAlign: 'center',
  },
  paymentMethodToggle: {
    flexDirection: 'row',
    marginBottom: 20,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  toggleButtonActive: {
    backgroundColor: '#0066cc',
  },
  toggleButtonText: {
    fontWeight: '600',
    color: '#666',
  },
  toggleButtonTextActive: {
    color: '#fff',
  },
  newCardSection: {
    marginBottom: 20,
  },
  cardField: {
    width: '100%',
    height: 50,
    marginBottom: 15,
  },
  saveCardOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  saveCardText: {
    color: '#666',
  },
  savedCardsSection: {
    marginBottom: 20,
  },
  payButton: {
    backgroundColor: '#0066cc',
    paddingVertical: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  payButtonDisabled: {
    backgroundColor: '#99c2ff',
  },
  payButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
}); 