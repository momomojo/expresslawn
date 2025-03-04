import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { ArrowLeft, ArrowRight, Clock, MapPin } from 'lucide-react-native';

type ScheduleItem = {
  start_time: string;
  end_time: string;
  type: 'availability' | 'custom_availability' | 'booking';
  title: string;
  subtitle: string;
  status?: string;
  color: string;
  booking_id?: string;
};

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function Schedule() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSchedule();
  }, [selectedDate]);

  const loadSchedule = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase.rpc(
        'get_provider_schedule',
        {
          p_provider_id: user.id,
          p_date: selectedDate.toISOString().split('T')[0]
        }
      );

      if (error) throw error;
      setSchedule(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const changeDate = (days: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + days);
    setSelectedDate(newDate);
  };

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Schedule</Text>
        <View style={styles.dateSelector}>
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => changeDate(-1)}
          >
            <ArrowLeft size={20} color="#fff" />
          </TouchableOpacity>
          
          <View style={styles.dateInfo}>
            <Text style={styles.dateText}>
              {DAYS[selectedDate.getDay()]}, {MONTHS[selectedDate.getMonth()]} {selectedDate.getDate()}
            </Text>
            <Text style={styles.yearText}>{selectedDate.getFullYear()}</Text>
          </View>

          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => changeDate(1)}
          >
            <ArrowRight size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.content}>
        {error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={loadSchedule}
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : loading ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading schedule...</Text>
          </View>
        ) : schedule.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No availability or bookings for this day</Text>
            <TouchableOpacity
              style={styles.setAvailabilityButton}
              onPress={() => router.push('/services/availability')}
            >
              <Text style={styles.setAvailabilityButtonText}>Set Availability</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.timeline}>
            {schedule.map((item, index) => (
              <View key={index} style={styles.timeSlot}>
                <View style={styles.timeColumn}>
                  <Text style={styles.timeText}>{formatTime(item.start_time)}</Text>
                  <View style={styles.timeLine} />
                </View>
                
                <View style={styles.itemColumn}>
                  <View 
                    style={[
                      styles.itemCard,
                      { backgroundColor: item.type === 'booking' ? '#fff' : item.color }
                    ]}
                  >
                    <View style={styles.itemHeader}>
                      <Text style={styles.itemTitle}>{item.title}</Text>
                      {item.status && (
                        <View style={[styles.statusBadge, { backgroundColor: item.color + '20' }]}>
                          <Text style={[styles.statusText, { color: item.color }]}>
                            {item.status.toUpperCase()}
                          </Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.itemDetails}>
                      <View style={styles.itemDetail}>
                        <Clock size={16} color="#666" />
                        <Text style={styles.itemDetailText}>{item.subtitle}</Text>
                      </View>

                      {item.type === 'booking' && (
                        <View style={styles.itemDetail}>
                          <MapPin size={16} color="#666" />
                          <Text style={styles.itemDetailText}>123 Main St</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              </View>
            ))}
          </View>
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
    padding: 24,
    paddingTop: 60,
    backgroundColor: '#2B5F21',
  },
  title: {
    fontSize: 32,
    fontFamily: 'InterBold',
    color: '#fff',
    marginBottom: 16,
  },
  dateSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 12,
  },
  dateButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  dateInfo: {
    alignItems: 'center',
  },
  dateText: {
    fontSize: 18,
    fontFamily: 'InterSemiBold',
    color: '#fff',
  },
  yearText: {
    fontSize: 14,
    fontFamily: 'Inter',
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 4,
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
  itemColumn: {
    flex: 1,
  },
  itemCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#EAEAEA',
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  itemTitle: {
    fontSize: 16,
    fontFamily: 'InterSemiBold',
    color: '#1B1B1B',
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 12,
    fontFamily: 'InterSemiBold',
  },
  itemDetails: {
    gap: 8,
  },
  itemDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemDetailText: {
    fontSize: 14,
    fontFamily: 'Inter',
    color: '#666',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 32,
  },
  loadingText: {
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
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'InterSemiBold',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: 'Inter',
    color: '#666',
    marginBottom: 16,
  },
  setAvailabilityButton: {
    backgroundColor: '#2B5F21',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  setAvailabilityButtonText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'InterSemiBold',
  },
});