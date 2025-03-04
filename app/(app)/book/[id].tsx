import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { ArrowLeft, Clock, DollarSign, MapPin, Star } from 'lucide-react-native';

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
    service_radius: number;
  };
  image: {
    url: string;
  };
};

export default function ServiceDetails() {
  const { id } = useLocalSearchParams();
  const [service, setService] = useState<Service | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadService();
  }, [id]);

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
            business_address,
            service_radius
          ),
          image:service_images(url)
        `)
        .eq('id', id)
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

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2B5F21" />
          <Text style={styles.loadingText}>Loading service details...</Text>
        </View>
      </View>
    );
  }

  if (error || !service) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error || 'Service not found'}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => router.back()}
          >
            <Text style={styles.retryButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView>
        <Image
          source={{ uri: service.image?.url }}
          style={styles.coverImage}
        />

        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <ArrowLeft size={24} color="#fff" />
        </TouchableOpacity>

        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>{service.name}</Text>
            <Text style={styles.providerName}>
              by {service.provider_profile.business_name}
            </Text>

            <View style={styles.ratingContainer}>
              <Star size={16} color="#FFB800" fill="#FFB800" />
              <Text style={styles.rating}>4.8</Text>
              <Text style={styles.reviews}>(124 reviews)</Text>
            </View>

            <View style={styles.detailsContainer}>
              <View style={styles.detail}>
                <DollarSign size={20} color="#2B5F21" />
                <Text style={styles.detailText}>
                  ${service.price.toFixed(2)}
                </Text>
              </View>

              <View style={styles.detail}>
                <Clock size={20} color="#666" />
                <Text style={styles.detailText}>
                  {service.duration_minutes} min
                </Text>
              </View>

              <View style={styles.detail}>
                <MapPin size={20} color="#666" />
                <Text style={styles.detailText}>
                  {service.provider_profile.service_radius} mile radius
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Description</Text>
            <Text style={styles.description}>
              {service.description}
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Service Area</Text>
            <Text style={styles.address}>
              Based in {service.provider_profile.business_address}
            </Text>
            <Text style={styles.serviceRadius}>
              Serving customers within {service.provider_profile.service_radius} miles
            </Text>
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.priceContainer}>
          <Text style={styles.priceLabel}>Total Price</Text>
          <Text style={styles.price}>${service.price.toFixed(2)}</Text>
        </View>

        <TouchableOpacity
          style={styles.bookButton}
          onPress={() => router.push({
            pathname: '/book/schedule',
            params: { serviceId: service.id }
          })}
        >
          <Text style={styles.bookButtonText}>Continue to Schedule</Text>
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
  coverImage: {
    width: '100%',
    height: 300,
    backgroundColor: '#F9F9F9',
  },
  backButton: {
    position: 'absolute',
    top: 60,
    left: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontFamily: 'InterBold',
    color: '#1B1B1B',
    marginBottom: 8,
  },
  providerName: {
    fontSize: 18,
    fontFamily: 'InterMedium',
    color: '#2B5F21',
    marginBottom: 12,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 16,
  },
  rating: {
    fontSize: 16,
    fontFamily: 'InterSemiBold',
    color: '#1B1B1B',
  },
  reviews: {
    fontSize: 14,
    fontFamily: 'Inter',
    color: '#666',
  },
  detailsContainer: {
    flexDirection: 'row',
    gap: 24,
  },
  detail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    fontSize: 16,
    fontFamily: 'InterMedium',
    color: '#1B1B1B',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: 'InterSemiBold',
    color: '#1B1B1B',
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    fontFamily: 'Inter',
    color: '#555',
    lineHeight: 24,
  },
  address: {
    fontSize: 16,
    fontFamily: 'Inter',
    color: '#1B1B1B',
    marginBottom: 8,
  },
  serviceRadius: {
    fontSize: 14,
    fontFamily: 'Inter',
    color: '#666',
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
    backgroundColor: '#fff',
  },
  priceContainer: {
    marginBottom: 16,
  },
  priceLabel: {
    fontSize: 14,
    fontFamily: 'Inter',
    color: '#666',
    marginBottom: 4,
  },
  price: {
    fontSize: 24,
    fontFamily: 'InterBold',
    color: '#1B1B1B',
  },
  bookButton: {
    backgroundColor: '#2B5F21',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  bookButtonText: {
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    fontFamily: 'Inter',
    color: '#FF4B4B',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#2B5F21',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  retryButtonText: {
    fontSize: 16,
    fontFamily: 'InterSemiBold',
    color: '#fff',
  },
});