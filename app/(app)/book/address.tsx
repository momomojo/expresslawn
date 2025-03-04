import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { ArrowLeft, MapPin } from 'lucide-react-native';

type Service = {
  id: string;
  name: string;
  provider_id: string;
  provider_profile: {
    business_name: string;
    business_address: string;
    service_radius: number;
  };
};

export default function AddressScreen() {
  const { serviceId, date, startTime, endTime } = useLocalSearchParams();
  const [service, setService] = useState<Service | null>(null);
  const [address, setAddress] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      const { data: profile, error: profileError } = await supabase
        .rpc('get_profile_safely', { user_id: user.id });

      if (profileError) throw profileError;
      if (!data) throw new Error('Failed to load profile');

      setAddress(profile.address || '');
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
          id,
          name,
          provider_id,
          provider_profile:provider_profiles(
            business_name,
            business_address,
            service_radius
          )
        `)
        .eq('id', serviceId.toString())
        .single();

      if (serviceError) throw serviceError;
      if (!data) throw new Error('Service not found');

      setService(data);

      // Get user's default address
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, address')
          .eq('id', user.id)
          .single();

        if (profile && profile.address) {
          setAddress(profile.address);
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = () => {
    if (!address.trim()) {
      setError('Please enter a service address');
      return;
    }
    
    // Save address to profile if logged in
    const saveAddress = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: existingProfile } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', user.id);

        const { error: updateError } = await supabase
          .from('profiles')
          .update({ address: address.trim() })
          .eq('id', user.id);
        
        if (updateError) {
          console.error('Error saving address:', updateError);
        }
      }
    }

    router.push({
      pathname: '/book/review',
      params: {
        serviceId,
        date,
        startTime,
        endTime,
        address: address.trim()
      }
    });
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
          <Text style={styles.title}>Service Address</Text>
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading...</Text>
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
        <Text style={styles.title}>Service Address</Text>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.serviceInfo}>
          <MapPin size={24} color="#2B5F21" />
          <View style={styles.serviceDetails}>
            <Text style={styles.serviceName}>{service.name}</Text>
            <Text style={styles.providerName}>
              by {service.provider_profile.business_name}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Service Area</Text>
          <Text style={styles.sectionDescription}>
            Provider is based in {service.provider_profile.business_address} and serves
            customers within {service.provider_profile.service_radius} miles.
          </Text>
        </View>

        {error && (
          <Text style={styles.errorText}>{error}</Text>
        )}

        <View style={styles.formGroup}>
          <Text style={styles.label}>Service Address</Text>
          <View style={styles.inputContainer}>
            <MapPin size={20} color="#666" />
            <TextInput
              style={styles.input}
              value={address}
              onChangeText={setAddress}
              placeholder="Enter service address"
              multiline
            />
          </View>
          <Text style={styles.inputHelp}>
            Please enter the complete address where the service will be performed
          </Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.continueButton, !address.trim() && styles.continueButtonDisabled]}
          onPress={handleContinue}
          disabled={!address.trim()}
        >
          <Text style={styles.continueButtonText}>
            Continue to Review
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
  serviceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    backgroundColor: '#F9F9F9',
    borderRadius: 12,
    marginBottom: 24,
  },
  serviceDetails: {
    flex: 1,
  },
  serviceName: {
    fontSize: 18,
    fontFamily: 'InterSemiBold',
    color: '#1B1B1B',
    marginBottom: 4,
  },
  providerName: {
    fontSize: 14,
    fontFamily: 'Inter',
    color: '#666',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'InterSemiBold',
    color: '#1B1B1B',
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    fontFamily: 'Inter',
    color: '#666',
    lineHeight: 20,
  },
  formGroup: {
    gap: 8,
  },
  label: {
    fontSize: 16,
    fontFamily: 'InterSemiBold',
    color: '#1B1B1B',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 12,
    backgroundColor: '#F9F9F9',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 8,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Inter',
    color: '#1B1B1B',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  inputHelp: {
    fontSize: 14,
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
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
    backgroundColor: '#fff',
  },
  continueButton: {
    backgroundColor: '#2B5F21',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  continueButtonDisabled: {
    opacity: 0.5,
  },
  continueButtonText: {
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
    fontSize: 16,
    fontFamily: 'Inter',
    color: '#666',
  },
});