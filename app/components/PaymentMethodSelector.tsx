import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { getPaymentMethods, setDefaultPaymentMethod, deletePaymentMethod } from '../../lib/stripe';
import { Ionicons } from '@expo/vector-icons';

interface PaymentMethod {
  id: string;
  card_brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
  is_default: boolean;
}

interface PaymentMethodSelectorProps {
  onSelect: (paymentMethodId: string | null) => void;
  selectedId?: string | null;
}

export default function PaymentMethodSelector({ onSelect, selectedId }: PaymentMethodSelectorProps) {
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPaymentMethods();
  }, []);

  const loadPaymentMethods = async () => {
    try {
      setLoading(true);
      setError(null);
      const methods = await getPaymentMethods();
      setPaymentMethods(methods);
      
      // If there's a default method and no selection, select it
      if (!selectedId && methods.length > 0) {
        const defaultMethod = methods.find(m => m.is_default);
        if (defaultMethod) {
          onSelect(defaultMethod.id);
        } else {
          onSelect(methods[0].id);
        }
      }
    } catch (err) {
      setError('Failed to load payment methods');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await setDefaultPaymentMethod(id);
      await loadPaymentMethods();
    } catch (err) {
      setError('Failed to set default payment method');
      console.error(err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deletePaymentMethod(id);
      await loadPaymentMethods();
      if (selectedId === id) {
        onSelect(null);
      }
    } catch (err) {
      setError('Failed to delete payment method');
      console.error(err);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color="#0000ff" />
        <Text style={styles.loadingText}>Loading payment methods...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity onPress={loadPaymentMethods} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (paymentMethods.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No payment methods saved</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {paymentMethods.map((method) => (
        <TouchableOpacity
          key={method.id}
          style={[
            styles.methodItem,
            selectedId === method.id && styles.selectedMethod
          ]}
          onPress={() => onSelect(method.id)}
        >
          <View style={styles.methodInfo}>
            <View style={styles.cardBrandContainer}>
              {getCardBrandIcon(method.card_brand)}
              <Text style={styles.cardBrand}>{method.card_brand}</Text>
            </View>
            <Text style={styles.cardNumber}>•••• {method.last4}</Text>
            <Text style={styles.expiry}>Expires {method.exp_month}/{method.exp_year}</Text>
            {method.is_default && <Text style={styles.defaultBadge}>Default</Text>}
          </View>
          <View style={styles.actions}>
            {!method.is_default && (
              <TouchableOpacity
                onPress={() => handleSetDefault(method.id)}
                style={styles.actionButton}
              >
                <Ionicons name="star-outline" size={18} color="#555" />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => handleDelete(method.id)}
              style={styles.actionButton}
            >
              <Ionicons name="trash-outline" size={18} color="#ff4d4d" />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function getCardBrandIcon(brand: string) {
  switch (brand.toLowerCase()) {
    case 'visa':
      return <Ionicons name="card" size={24} color="#1A1F71" />;
    case 'mastercard':
      return <Ionicons name="card" size={24} color="#EB001B" />;
    case 'amex':
      return <Ionicons name="card" size={24} color="#006FCF" />;
    case 'discover':
      return <Ionicons name="card" size={24} color="#FF6600" />;
    default:
      return <Ionicons name="card-outline" size={24} color="#555" />;
  }
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 10,
  },
  loadingContainer: {
    padding: 20,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    color: '#555',
  },
  errorContainer: {
    padding: 20,
    alignItems: 'center',
  },
  errorText: {
    color: '#ff4d4d',
    marginBottom: 10,
  },
  retryButton: {
    padding: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 4,
  },
  retryButtonText: {
    color: '#0066cc',
  },
  emptyContainer: {
    padding: 20,
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
  },
  emptyText: {
    color: '#888',
  },
  methodItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#eee',
  },
  selectedMethod: {
    borderColor: '#0066cc',
    backgroundColor: '#f0f7ff',
  },
  methodInfo: {
    flex: 1,
  },
  cardBrandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  cardBrand: {
    fontWeight: '600',
    marginLeft: 8,
    textTransform: 'capitalize',
  },
  cardNumber: {
    fontSize: 16,
    marginBottom: 4,
  },
  expiry: {
    fontSize: 14,
    color: '#666',
  },
  defaultBadge: {
    marginTop: 5,
    fontSize: 12,
    color: '#0066cc',
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
  },
  actionButton: {
    padding: 8,
    marginLeft: 8,
  },
}); 