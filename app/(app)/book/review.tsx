import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { ArrowLeft, Calendar, Clock, DollarSign, MapPin, Shield, CircleCheck as CheckCircle2 } from 'lucide-react-native';

type Service = {
  id: string;
  name: string;
  description: string;
  price: number;
  duration_minutes: number;
  provider_id: string;
  provider_profile: {
    business_name: string;
    business_address: string;
  };
};

export default function ReviewScreen() {
  const { serviceId, date, startTime, endTime, address } = useLocalSearchParams();
  const [service, setService] = useState<Service | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<{ id: string } | null>(null);

  useEffect(() => {
    loadService();
    loadUserProfile();
  }, [serviceId]);

  const loadUserProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/login');
        return;
      }

      // Get profile safely
      const { data, error: profileError } = await supabase
        .rpc('get_profile_safely', { user_id: user.id });

      if (profileError) throw profileError;
      if (!data) {
        throw new Error('Failed to load profile');
      }

      setProfile(data);
    } catch (err: any) {
      setError('Error loading profile: ' + err.message);
    }
  };

  const loadService = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: serviceError } = await supabase
        .from('provider_services')
        .select(`
          *,
          provider_profile:provider_profiles(
            business_name,
            business_address
          )
        `)
        .eq('id', serviceId)
        .single();

      if (serviceError) throw serviceError;
      if (!data) throw new Error('Service not found');

      setService(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const handleConfirm = async () => {
    if (!termsAccepted) {
      setError('Please accept the terms and conditions');
      return;
    }

    try {
      setConfirming(true);
      setError(null);

      if (!profile) throw new Error('Not authenticated');
      if (!service) throw new Error('Service not found');

      const booking = {
        customer_id: profile.id,
        provider_id: service.provider_id,
        service_id: serviceId,
        scheduled_date: date,
        start_time: startTime,
        end_time: endTime,
        service_address: address,
        total_price: service.price,
        status: 'pending'
      };

      const { error: bookingError } = await supabase
        .from('bookings')
        .insert(booking);

      if (bookingError) throw bookingError;

      router.push({
        pathname: '/(app)/(tabs)',
        params: { screen: 'schedule' }
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setConfirming(false);
    }
  };

  if (loading || !service) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <ArrowLeft size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.title}>Review Booking</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2B5F21" />
          <Text style={styles.loadingText}>Loading booking details...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <ArrowLeft size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Review Booking</Text>
      </View>

      <ScrollView style={styles.content}>
        {error && (
          <Text style={styles.errorText}>{error}</Text>
        )}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Service Details</Text>
          <View style={styles.serviceInfo}>
            <Text style={styles.serviceName}>{service.name}</Text>
            <Text style={styles.providerName}>
              by {service.provider_profile.business_name}
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Schedule</Text>
          <View style={styles.detailRow}>
            <Calendar size={20} color="#666" />
            <Text style={styles.detailText}>{formatDate(date as string)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Clock size={20} color="#666" />
            <Text style={styles.detailText}>
              {formatTime(startTime as string)} - {formatTime(endTime as string)}
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Location</Text>
          <View style={styles.detailRow}>
            <MapPin size={20} color="#666" />
            <Text style={styles.detailText}>{address}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Price Breakdown</Text>
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Service Fee</Text>
            <Text style={styles.priceValue}>${service.price.toFixed(2)}</Text>
          </View>
          <View style={[styles.priceRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>${service.price.toFixed(2)}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.termsContainer}
          onPress={() => setTermsAccepted(!termsAccepted)}
        >
          <View style={[
            styles.checkbox,
            termsAccepted && styles.checkboxChecked
          ]}>
            {termsAccepted && (
              <CheckCircle2 size={20} color="#2B5F21" />
            )}
          </View>
          <Text style={styles.termsText}>
            I agree to the terms and conditions of service
          </Text>
        </TouchableOpacity>

        <View style={styles.guaranteeContainer}>
          <Shield size={20} color="#2B5F21" />
          <Text style={styles.guaranteeText}>
            Your booking is protected by our satisfaction guarantee
          </Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.confirmButton, confirming && styles.confirmButtonDisabled]}
          onPress={handleConfirm}
          disabled={confirming || !termsAccepted}
        >
          <Text style={styles.confirmButtonText}>
            {confirming ? 'Confirming...' : 'Confirm Booking'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    padding: 24,
    paddingTop: 60,
    backgroundColor: '#2B5F21',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontFamily: 'InterBold',
    color: '#fff',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#EAEAEA',
  },
  cardTitle: {
    fontSize: 18,
    fontFamily: 'InterSemiBold',
    color: '#1B1B1B',
    marginBottom: 12,
  },
  serviceInfo: {
    gap: 4,
  },
  serviceName: {
    fontSize: 16,
    fontFamily: 'InterSemiBold',
    color: '#1B1B1B',
  },
  providerName: {
    fontSize: 14,
    fontFamily: 'Inter',
    color: '#666',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  detailText: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Inter',
    color: '#1B1B1B',
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  priceLabel: {
    fontSize: 16,
    fontFamily: 'Inter',
    color: '#666',
  },
  priceValue: {
    fontSize: 16,
    fontFamily: 'InterSemiBold',
    color: '#1B1B1B',
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: '#EAEAEA',
    marginTop: 8,
    paddingTop: 8,
  },
  totalLabel: {
    fontSize: 18,
    fontFamily: 'InterSemiBold',
    color: '#1B1B1B',
  },
  totalValue: {
    fontSize: 20,
    fontFamily: 'InterBold',
    color: '#2B5F21',
  },
  termsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
    padding: 16,
    backgroundColor: '#F9F9F9',
    borderRadius: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#2B5F21',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#E5FFE9',
  },
  termsText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter',
    color: '#1B1B1B',
  },
  guaranteeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 16,
    backgroundColor: '#E5FFE9',
    borderRadius: 12,
    marginBottom: 24,
  },
  guaranteeText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'InterMedium',
    color: '#2B5F21',
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
    backgroundColor: '#fff',
  },
  confirmButton: {
    backgroundColor: '#2B5F21',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  confirmButtonDisabled: {
    opacity: 0.7,
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'InterSemiBold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    fontFamily: 'Inter',
    color: '#666',
  },
  errorText: {
    color: '#FF4B4B',
    fontSize: 14,
    fontFamily: 'Inter',
    textAlign: 'center',
    marginBottom: 16,
  },
});