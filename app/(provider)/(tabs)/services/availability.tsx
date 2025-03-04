import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../../../lib/supabase';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react-native';

type TimeSlot = {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
};

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const formatTime = (time: string) => {
  const [hours, minutes] = time.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minutes} ${ampm}`;
};

export default function AvailabilityScreen() {
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAvailability();
  }, []);

  const loadAvailability = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('service_availability')
        .select('*')
        .eq('provider_id', user.id)
        .order('day_of_week')
        .order('start_time');

      if (error) throw error;

      setTimeSlots(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteTimeSlot = async (id: string) => {
    try {
      const { error } = await supabase
        .from('service_availability')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setTimeSlots(timeSlots.filter(slot => slot.id !== id));
    } catch (err: any) {
      setError(err.message);
    }
  };

  const groupedSlots = timeSlots.reduce((acc, slot) => {
    const day = DAYS[slot.day_of_week];
    if (!acc[day]) {
      acc[day] = [];
    }
    acc[day].push(slot);
    return acc;
  }, {} as Record<string, TimeSlot[]>);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <ArrowLeft size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Availability</Text>
      </View>

      <ScrollView style={styles.content}>
        {error && (
          <Text style={styles.errorText}>{error}</Text>
        )}

        {loading ? (
          <Text style={styles.loadingText}>Loading availability...</Text>
        ) : (
          <>
            {DAYS.map((day) => (
              <View key={day} style={styles.daySection}>
                <Text style={styles.dayTitle}>{day}</Text>
                <View style={styles.timeSlotsList}>
                  {groupedSlots[day]?.map((slot) => (
                    <View key={slot.id} style={styles.timeSlot}>
                      <Text style={styles.timeText}>
                        {formatTime(slot.start_time)} - {formatTime(slot.end_time)}
                      </Text>
                      <TouchableOpacity
                        onPress={() => deleteTimeSlot(slot.id)}
                        style={styles.deleteButton}
                      >
                        <Trash2 size={20} color="#FF4B4B" />
                      </TouchableOpacity>
                    </View>
                  ))}
                  <TouchableOpacity 
                    style={styles.addButton}
                    onPress={() => {
                      // TODO: Implement add time slot
                      console.log('Add time slot for', day);
                    }}
                  >
                    <Plus size={20} color="#2B5F21" />
                    <Text style={styles.addButtonText}>Add Time Slot</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </>
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
  daySection: {
    marginBottom: 24,
  },
  dayTitle: {
    fontSize: 18,
    fontFamily: 'InterSemiBold',
    color: '#1B1B1B',
    marginBottom: 12,
  },
  timeSlotsList: {
    gap: 8,
  },
  timeSlot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F9F9F9',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  timeText: {
    fontSize: 16,
    fontFamily: 'Inter',
    color: '#1B1B1B',
  },
  deleteButton: {
    padding: 8,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#2B5F21',
    borderRadius: 8,
    marginTop: 8,
  },
  addButtonText: {
    fontSize: 14,
    fontFamily: 'InterSemiBold',
    color: '#2B5F21',
  },
  loadingText: {
    fontSize: 16,
    fontFamily: 'Inter',
    color: '#666',
    textAlign: 'center',
    marginTop: 24,
  },
  errorText: {
    color: '#FF4B4B',
    fontSize: 14,
    fontFamily: 'Inter',
    textAlign: 'center',
    marginBottom: 16,
  },
});