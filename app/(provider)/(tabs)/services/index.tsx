import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../../../lib/supabase';
import { Clock, DollarSign, Plus, Settings, Trash2 } from 'lucide-react-native';

type ProviderService = {
  id: string;
  provider_id: string;
  name: string;
  description: string;
  price: number;
  duration_minutes: number;
  category: string;
  image_id: string;
  is_active: boolean;
  image_url?: string;
};

export default function ServicesScreen() {
  const [services, setServices] = useState<ProviderService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadServices();
  }, []);

  const loadServices = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Get provider services with image URLs
      const { data: servicesData, error: servicesError } = await supabase
        .from('provider_services')
        .select('*, image:service_images(url)')
        .eq('provider_id', user.id)
        .order('category');

      if (servicesError) throw servicesError;

      // Map the data to include image_url
      const servicesWithImages = servicesData?.map(service => ({
        ...service,
        image_url: service.image?.url
      })) || [];

      setServices(servicesWithImages);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getServicePrice = (service: Service) => {
    return service.provider_service?.price_override || service.base_price;
  };

  const getDescription = (service: Service) => {
    return service.provider_service?.custom_description || service.description;
  };

  const getServiceDuration = (service: Service) => {
    return service.provider_service?.duration_override || service.duration_minutes;
  };

  const isServiceActive = (service: Service) => {
    return service.provider_service?.is_active ?? false;
  };

  const handleDeleteService = async (serviceId: string) => {
    try {
      const { error } = await supabase
        .from('provider_services')
        .delete()
        .eq('id', serviceId);

      if (error) throw error;

      // Refresh services list
      loadServices();
    } catch (err: any) {
      setError(err.message);
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

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Services</Text>
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading services...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Services</Text>
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity 
            style={styles.retryButton}
            onPress={loadServices}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Services</Text>
          <TouchableOpacity 
            style={styles.availabilityButton}
            onPress={() => router.push('/services/availability')}
          >
            <Clock size={20} color="#2B5F21" />
            <Text style={styles.availabilityButtonText}>Set Availability</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => router.push('/services/add')}
        >
          <Plus size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {Object.entries(groupedServices).map(([category, categoryServices]) => (
          <View key={category} style={styles.categorySection}>
            <Text style={styles.categoryTitle}>{category}</Text>
            <View style={styles.servicesList}>
              {categoryServices.map((service) => (
                <TouchableOpacity
                  key={service.id}
                  style={[
                    styles.serviceCard,
                    !service.is_active && styles.inactiveCard
                  ]}
                  onPress={() => router.push({
                    pathname: '/services/edit',
                    params: { id: service.id }
                  })}
                >
                  <Image
                    source={{ uri: service.image_url || 'https://images.unsplash.com/photo-1592417817098-8fd3d9eb14a5?q=80&w=800&auto=format&fit=crop' }}
                    style={styles.serviceImage}
                  />
                  <View style={styles.serviceContent}>
                    <View style={styles.serviceHeader}>
                      <Text style={styles.serviceName}>{service.name}</Text>
                      <Settings size={20} color="#666" />
                    </View>
                    <Text style={styles.serviceDescription}>
                      {getDescription(service)}
                    </Text>
                    <View style={styles.serviceFooter}>
                      <View style={styles.serviceDetail}>
                        <DollarSign size={16} color="#2B5F21" />
                        <Text style={styles.servicePrice}>
                          ${service.price.toFixed(2)}
                        </Text>
                      </View>
                      <View style={styles.serviceDetail}>
                        <Clock size={16} color="#666" />
                        <Text style={styles.serviceDuration}>
                          {service.duration_minutes} min
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.deleteButton}
                        onPress={() => handleDeleteService(service.id)}
                      >
                        <Trash2 size={20} color="#FF4B4B" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}
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
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 32,
    fontFamily: 'InterBold',
    color: '#fff',
    marginBottom: 16,
  },
  availabilityButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  availabilityButtonText: {
    fontSize: 14,
    fontFamily: 'InterSemiBold',
    color: '#2B5F21',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  categorySection: {
    marginBottom: 24,
  },
  categoryTitle: {
    fontSize: 20,
    fontFamily: 'InterSemiBold',
    color: '#1B1B1B',
    marginBottom: 16,
  },
  servicesList: {
    gap: 16,
  },
  serviceCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#EAEAEA',
  },
  inactiveCard: {
    opacity: 0.6,
  },
  serviceImage: {
    width: '100%',
    height: 160,
    backgroundColor: '#F9F9F9',
  },
  serviceContent: {
    padding: 16,
    gap: 12,
  },
  serviceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  serviceName: {
    fontSize: 18,
    fontFamily: 'InterSemiBold',
    color: '#1B1B1B',
  },
  serviceDescription: {
    fontSize: 14,
    fontFamily: 'Inter',
    color: '#666',
    lineHeight: 20,
  },
  serviceFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  serviceDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  deleteButton: {
    padding: 8,
    marginLeft: 8,
  },
});