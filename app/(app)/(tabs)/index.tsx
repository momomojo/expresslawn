import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity } from 'react-native';
import { MapPin } from 'lucide-react-native';

const services = [
  {
    id: 1,
    title: 'Lawn Treatment',
    description: 'Strengthen grass and kill weeds for a greener lawn.',
    image: 'https://images.unsplash.com/photo-1558904541-efa843a96f01?q=80&w=800&auto=format&fit=crop',
  },
  {
    id: 2,
    title: 'Lawn Mowing',
    description: 'Cut and maintain grass for a neat, healthy lawn.',
    image: 'https://images.unsplash.com/photo-1624943113472-a3821381e040?q=80&w=800&auto=format&fit=crop',
  },
  {
    id: 3,
    title: 'Tree Care',
    description: 'Trim trees to keep them healthy, safe, and neat.',
    image: 'https://images.unsplash.com/photo-1598902468171-0f50e32a7bf8?q=80&w=800&auto=format&fit=crop',
  },
  {
    id: 4,
    title: 'Mulching',
    description: 'Retain water and prevent weeds with mulching and sheeting.',
    image: 'https://images.unsplash.com/photo-1647531452166-3493b4c6d6b9?q=80&w=800&auto=format&fit=crop',
  },
  {
    id: 5,
    title: 'Landscaping',
    description: 'Transform your outdoor space with professional landscaping.',
    image: 'https://images.unsplash.com/photo-1595429035839-c99c298ffdde?q=80&w=800&auto=format&fit=crop',
  },
];

export default function Browse() {
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
        <Text style={styles.sectionTitle}>Services to explore</Text>
        
        <View style={styles.servicesList}>
          {services.map((service) => (
            <View key={service.id} style={styles.serviceCard}>
              <Image
                source={{ uri: service.image }}
                style={styles.serviceImage}
              />
              <View style={styles.serviceContent}>
                <View>
                  <Text style={styles.serviceTitle}>{service.title}</Text>
                  <Text style={styles.serviceDescription}>{service.description}</Text>
                </View>
                <TouchableOpacity style={styles.orderButton}>
                  <Text style={styles.orderButtonText}>ORDER NOW</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
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
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: 'InterSemiBold',
    color: '#1B1B1B',
    marginBottom: 16,
  },
  servicesList: {
    gap: 16,
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
});