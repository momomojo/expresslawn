import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Clock, MapPin, DollarSign } from 'lucide-react-native';

const jobs = [
  {
    id: 1,
    service: 'Lawn Mowing',
    address: '123 Main St, Anytown, USA',
    time: '2:00 PM',
    price: 45,
    status: 'pending',
  },
  {
    id: 2,
    service: 'Tree Trimming',
    address: '456 Oak Ave, Anytown, USA',
    time: '4:30 PM',
    price: 120,
    status: 'confirmed',
  },
];

export default function ProviderDashboard() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Jobs</Text>
        <View style={styles.stats}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>5</Text>
            <Text style={styles.statLabel}>Today's Jobs</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>$345</Text>
            <Text style={styles.statLabel}>Today's Earnings</Text>
          </View>
        </View>
      </View>

      <ScrollView style={styles.content}>
        <Text style={styles.sectionTitle}>Upcoming Jobs</Text>
        
        <View style={styles.jobsList}>
          {jobs.map((job) => (
            <View key={job.id} style={styles.jobCard}>
              <View style={styles.jobHeader}>
                <Text style={styles.jobService}>{job.service}</Text>
                <View style={[
                  styles.statusBadge,
                  job.status === 'confirmed' ? styles.statusConfirmed : styles.statusPending
                ]}>
                  <Text style={[
                    styles.statusText,
                    job.status === 'confirmed' ? styles.statusConfirmedText : styles.statusPendingText
                  ]}>
                    {job.status.toUpperCase()}
                  </Text>
                </View>
              </View>

              <View style={styles.jobDetails}>
                <View style={styles.jobDetail}>
                  <MapPin size={16} color="#666" />
                  <Text style={styles.jobDetailText}>{job.address}</Text>
                </View>
                <View style={styles.jobDetail}>
                  <Clock size={16} color="#666" />
                  <Text style={styles.jobDetailText}>{job.time}</Text>
                </View>
                <View style={styles.jobDetail}>
                  <DollarSign size={16} color="#666" />
                  <Text style={styles.jobDetailText}>${job.price}</Text>
                </View>
              </View>

              <TouchableOpacity 
                style={[
                  styles.jobButton,
                  job.status === 'confirmed' ? styles.startButton : styles.acceptButton
                ]}
              >
                <Text style={styles.jobButtonText}>
                  {job.status === 'confirmed' ? 'START JOB' : 'ACCEPT JOB'}
                </Text>
              </TouchableOpacity>
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
    padding: 24,
    paddingTop: 60,
    backgroundColor: '#2B5F21',
  },
  title: {
    fontSize: 32,
    fontFamily: 'InterBold',
    color: '#fff',
    marginBottom: 24,
  },
  stats: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontFamily: 'InterBold',
    color: '#fff',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 14,
    fontFamily: 'Inter',
    color: 'rgba(255, 255, 255, 0.8)',
  },
  statDivider: {
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginHorizontal: 16,
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
  jobsList: {
    gap: 16,
  },
  jobCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#EAEAEA',
  },
  jobHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  jobService: {
    fontSize: 18,
    fontFamily: 'InterSemiBold',
    color: '#1B1B1B',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusPending: {
    backgroundColor: '#FFF4E5',
  },
  statusConfirmed: {
    backgroundColor: '#E5FFE9',
  },
  statusText: {
    fontSize: 12,
    fontFamily: 'InterSemiBold',
  },
  statusPendingText: {
    color: '#FF9800',
  },
  statusConfirmedText: {
    color: '#2B5F21',
  },
  jobDetails: {
    gap: 8,
    marginBottom: 16,
  },
  jobDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  jobDetailText: {
    fontSize: 14,
    fontFamily: 'Inter',
    color: '#666',
  },
  jobButton: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  acceptButton: {
    backgroundColor: '#2B5F21',
  },
  startButton: {
    backgroundColor: '#FF9800',
  },
  jobButtonText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: 'InterSemiBold',
  },
});