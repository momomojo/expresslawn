import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Clock, MapPin } from 'lucide-react-native';

const schedule = [
  {
    time: '9:00 AM',
    jobs: [
      {
        id: 1,
        service: 'Lawn Mowing',
        address: '123 Pine St',
        duration: '1h 30m',
      }
    ]
  },
  {
    time: '11:00 AM',
    jobs: [
      {
        id: 2,
        service: 'Tree Trimming',
        address: '456 Oak Ave',
        duration: '2h',
      }
    ]
  },
  {
    time: '2:00 PM',
    jobs: [
      {
        id: 3,
        service: 'Lawn Treatment',
        address: '789 Maple Rd',
        duration: '1h',
      }
    ]
  },
];

export default function Schedule() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Schedule</Text>
        <Text style={styles.date}>Wednesday, March 5</Text>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.timeline}>
          {schedule.map((timeSlot, index) => (
            <View key={timeSlot.time} style={styles.timeSlot}>
              <View style={styles.timeColumn}>
                <Text style={styles.timeText}>{timeSlot.time}</Text>
                <View style={styles.timeLine} />
              </View>
              
              <View style={styles.jobsColumn}>
                {timeSlot.jobs.map(job => (
                  <View key={job.id} style={styles.jobCard}>
                    <Text style={styles.jobService}>{job.service}</Text>
                    
                    <View style={styles.jobDetails}>
                      <View style={styles.jobDetail}>
                        <MapPin size={16} color="#666" />
                        <Text style={styles.jobDetailText}>{job.address}</Text>
                      </View>
                      <View style={styles.jobDetail}>
                        <Clock size={16} color="#666" />
                        <Text style={styles.jobDetailText}>{job.duration}</Text>
                      </View>
                    </View>
                  </View>
                ))}
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
    padding: 24,
    paddingTop: 60,
    backgroundColor: '#2B5F21',
  },
  title: {
    fontSize: 32,
    fontFamily: 'InterBold',
    color: '#fff',
    marginBottom: 8,
  },
  date: {
    fontSize: 16,
    fontFamily: 'InterMedium',
    color: 'rgba(255, 255, 255, 0.8)',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  timeline: {
    paddingTop: 8,
  },
  timeSlot: {
    flexDirection: 'row',
    marginBottom: 24,
  },
  timeColumn: {
    width: 80,
    alignItems: 'center',
  },
  timeText: {
    fontSize: 14,
    fontFamily: 'InterMedium',
    color: '#666',
    marginBottom: 8,
  },
  timeLine: {
    width: 2,
    flex: 1,
    backgroundColor: '#E5E5E5',
    marginHorizontal: 16,
  },
  jobsColumn: {
    flex: 1,
  },
  jobCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#EAEAEA',
    marginBottom: 16,
  },
  jobService: {
    fontSize: 16,
    fontFamily: 'InterSemiBold',
    color: '#1B1B1B',
    marginBottom: 12,
  },
  jobDetails: {
    gap: 8,
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
});