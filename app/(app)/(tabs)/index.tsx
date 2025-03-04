import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, ActivityIndicator } from 'react-native';
import { MapPin } from 'lucide-react-native';
import { supabase } from '../../../lib/supabase';

type Service = {
  id: string;
  name: string;
  description: string;
  price: number;
  duration_minutes: number;
  category: string;
  provider_id: string;
  provider_profile: {
    business_name: string;
  };
  image: {
    url: string;
  };
};

export default function Browse() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadServices();
  }, []);

  const loadServices = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: servicesError } = await supabase
        .from('provider_services')
        .select(`
          *,
          provider_profile:provider_profiles(business_name),
          image:service_images(url)
        `)
        .eq('is_active', true)
        .order('category');

      if (servicesError) throw servicesError;
      setServices(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const groupedServices = services.reduce((acc, service) => {
    const category = service.category.split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(service);
    return acc;
  }, {} as Record<string, Service[]>);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Services</Text>
        <TouchableOpacity style={styles.addressButton}>
          <MapPin size={20} color="#2B5F21" />
          <Text style={styles.address}>529 Stone Hill Road</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#2B5F21" />
            <Text style={styles.loadingText}>Loading services...</Text>
          </View>
        ) : error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={loadServices}
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          Object.entries(groupedServices).map(([category, categoryServices]) => (
            <View key={category} style={styles.categorySection}>
              <Text style={styles.sectionTitle}>{category}</Text>
              <View style={styles.servicesList}>
                {categoryServices.map((service) => (
                  <View key={service.id} style={styles.serviceCard}>
                    <Image
                      source={{ uri: service.image?.url }}
                      style={styles.serviceImage}
                    />
                    <View style={styles.serviceContent}>
                      <View>
                        <Text style={styles.serviceTitle}>{service.name}</Text>
                        <Text style={styles.providerName}>
                          by {service.provider_profile.business_name}
                        </Text>
                        <Text style={styles.serviceDescription}>
                          {service.description}
                        </Text>
                        <View style={styles.serviceDetails}>
                          <Text style={styles.servicePrice}>
                            ${service.price.toFixed(2)}
                          </Text>
                          <Text style={styles.serviceDuration}>
                            {service.duration_minutes} min
                          </Text>
                        </View>
                      </View>
                      <TouchableOpacity style={styles.orderButton}>
                        <Text style={styles.orderButtonText}>ORDER NOW</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ))
        )}
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
    paddingHorizontal: 20,
    paddingTop: 48,
    paddingBottom: 16,
    paddingTop: 60,
    backgroundColor: '#2B5F21',
  },
  title: {
    fontSize: 32,
    fontFamily: 'InterBold',
    color: '#fff',
    marginBottom: 16,
  },
  addressButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  address: {
    fontSize: 16,
    fontFamily: 'InterMedium',
    color: '#fff',
  },
  content: {
    flex: 1,
    padding: 16,
    paddingBottom: 32,
  },
  categorySection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: 'InterSemiBold',
    color: '#1B1B1B',
    marginBottom: 16,
  },
  servicesList: {
    gap: 12,
  },
  serviceCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#EAEAEA',
  },
  serviceImage: {
    width: '100%',
    height: 180,
    backgroundColor: '#F9F9F9',
  },
  serviceContent: {
    padding: 12,
    gap: 16,
  },
  providerName: {
    fontSize: 14,
    fontFamily: 'Inter',
    color: '#2B5F21',
    marginBottom: 4,
  },
  serviceTitle: {
    fontSize: 18,
    fontFamily: 'InterSemiBold',
    color: '#1B1B1B',
    marginBottom: 4,
  },
  serviceDescription: {
    fontSize: 14,
    fontFamily: 'Inter',
    color: '#666',
    color: '#555',
    lineHeight: 20,
  },
  serviceDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 8,
  },
  servicePrice: {
    fontSize: 16,
    fontFamily: 'InterSemiBold',
    color: '#2B5F21',
  },
  serviceDuration: {
    fontSize: 14,
    fontFamily: 'Inter',
    color: '#666',
  },
  orderButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#2B5F21',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignSelf: 'flex-end',
  },
  orderButtonText: {
    color: '#2B5F21',
    fontSize: 14,
    fontFamily: 'InterSemiBold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 32,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    fontFamily: 'Inter',
    color: '#666',
  },
  errorContainer: {
    padding: 24,
    alignItems: 'center',
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
    padding: 12,
    borderRadius: 8,
  },
});