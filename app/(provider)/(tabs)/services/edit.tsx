import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Switch, Image } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../../../lib/supabase';
import { ArrowLeft, Clock, DollarSign } from 'lucide-react-native';

type Service = {
  id: string;
  name: string;
  description: string;
  base_price: number;
  duration_minutes: number;
  category: string;
  image_url: string;
  provider_service?: {
    id: string;
    price_override: number | null;
    custom_description: string | null;
    is_active: boolean;
  };
};

export default function EditServiceScreen() {
  const { id } = useLocalSearchParams();
  const [service, setService] = useState<Service | null>(null);
  const [customPrice, setCustomPrice] = useState<string>('');
  const [customDescription, setCustomDescription] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [customDuration, setCustomDuration] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadService();
  }, [id]);

  const loadService = async () => {
    try {
      const { data, error } = await supabase
        .from('services')
        .select(`
          *,
          provider_service:provider_services(
            id,
            price_override,
            custom_description,
            is_active
          )
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      if (!data) throw new Error('Service not found');

      setService(data);
      setCustomPrice(data.provider_service?.price_override?.toString() || data.base_price.toString());
      setCustomDescription(data.provider_service?.custom_description || data.description);
      setCustomDuration(data.provider_service?.duration_override?.toString() || data.duration_minutes.toString());
      setIsActive(data.provider_service?.is_active ?? false);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const priceOverride = parseFloat(customPrice);
      if (isNaN(priceOverride) || priceOverride < 0) {
        throw new Error('Invalid price');
      }

      const durationOverride = parseInt(customDuration);
      if (isNaN(durationOverride) || durationOverride <= 0) {
        throw new Error('Invalid duration');
      }

      const { data: existingService, error: queryError } = await supabase
        .from('provider_services')
        .select('id')
        .eq('service_id', id)
        .eq('provider_id', user.id)
        .single();

      if (queryError && queryError.code !== 'PGRST116') throw queryError;

      if (existingService) {
        const { error: updateError } = await supabase
          .from('provider_services')
          .update({
            price_override: priceOverride,
            custom_description: customDescription,
            is_active: isActive,
            duration_override: durationOverride,
          })
          .eq('id', existingService.id);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('provider_services')
          .insert({
            provider_id: user.id,
            service_id: id,
            price_override: priceOverride,
            custom_description: customDescription,
            duration_override: durationOverride,
            is_active: isActive,
          });

        if (insertError) throw insertError;
      }

      router.back();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!service) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity 
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <ArrowLeft size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.title}>Edit Service</Text>
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading service...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <ArrowLeft size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Edit Service</Text>
      </View>

      <ScrollView style={styles.content}>
        <Image
          source={{ uri: service.image_url }}
          style={styles.serviceImage}
        />

        <View style={styles.form}>
          {error && (
            <Text style={styles.errorText}>{error}</Text>
          )}

          <View style={styles.formGroup}>
            <Text style={styles.label}>Service Name</Text>
            <Text style={styles.value}>{service.name}</Text>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Base Price</Text>
            <View style={styles.basePrice}>
              <DollarSign size={16} color="#666" />
              <Text style={styles.basePriceText}>
                ${service.base_price.toFixed(2)}
              </Text>
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Your Price</Text>
            <View style={styles.inputContainer}>
              <DollarSign size={20} color="#666" />
              <TextInput
                style={styles.input}
                value={customPrice}
                onChangeText={setCustomPrice}
                keyboardType="decimal-pad"
                placeholder="Enter your price"
              />
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Duration</Text>
            <View style={styles.inputContainer}>
              <Clock size={20} color="#666" />
              <TextInput
                style={styles.input}
                value={customDuration}
                onChangeText={setCustomDuration}
                keyboardType="numeric"
                placeholder="Enter duration in minutes"
              />
            </View>
            <Text style={styles.durationHelp}>
              Base duration: {service.duration_minutes} minutes
            </Text>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={customDescription}
              onChangeText={setCustomDescription}
              placeholder="Enter custom description"
              multiline
              numberOfLines={4}
            />
          </View>

          <View style={styles.formGroup}>
            <View style={styles.switchContainer}>
              <Text style={styles.label}>Active</Text>
              <Switch
                value={isActive}
                onValueChange={setIsActive}
                trackColor={{ false: '#E5E5E5', true: '#4CAF50' }}
                thumbColor={isActive ? '#fff' : '#fff'}
              />
            </View>
            <Text style={styles.switchHelp}>
              When active, this service will be available for booking
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.saveButton, loading && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={loading}
          >
            <Text style={styles.saveButtonText}>
              {loading ? 'Saving...' : 'Save Changes'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
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
  },
  serviceImage: {
    width: '100%',
    height: 200,
    backgroundColor: '#F9F9F9',
  },
  form: {
    padding: 16,
    gap: 20,
  },
  formGroup: {
    gap: 8,
  },
  label: {
    fontSize: 16,
    fontFamily: 'InterSemiBold',
    color: '#1B1B1B',
  },
  value: {
    fontSize: 16,
    fontFamily: 'Inter',
    color: '#666',
  },
  basePrice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  basePriceText: {
    fontSize: 16,
    fontFamily: 'Inter',
    color: '#666',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#F9F9F9',
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Inter',
    color: '#1B1B1B',
    marginLeft: 8,
  },
  textArea: {
    height: 100,
    padding: 12,
    textAlignVertical: 'top',
    backgroundColor: '#F9F9F9',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 8,
  },
  duration: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  durationText: {
    fontSize: 16,
    fontFamily: 'Inter',
    color: '#666',
  },
  durationHelp: {
    fontSize: 14,
    fontFamily: 'Inter',
    color: '#666',
    marginTop: 4,
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  switchHelp: {
    fontSize: 14,
    fontFamily: 'Inter',
    color: '#666',
  },
  saveButton: {
    backgroundColor: '#2B5F21',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
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
  errorText: {
    color: '#FF4B4B',
    fontSize: 14,
    fontFamily: 'Inter',
    textAlign: 'center',
    marginBottom: 8,
  },
});