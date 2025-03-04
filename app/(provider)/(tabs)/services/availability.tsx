import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Platform } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../../../lib/supabase';
import { ArrowLeft, Plus, Trash2, X, Clock } from 'lucide-react-native';

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
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number>(0);
  const [newSlot, setNewSlot] = useState({
    startTime: '',
    endTime: '',
  });
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

  const handleAddTimeSlot = async () => {
    try {
      setError(null);

      // Validate time format
      const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(newSlot.startTime) || !timeRegex.test(newSlot.endTime)) {
        throw new Error('Please enter valid times in HH:MM format');
      }

      // Convert to 24-hour format if needed
      const startParts = newSlot.startTime.split(':');
      const endParts = newSlot.endTime.split(':');
      const start = `${startParts[0].padStart(2, '0')}:${startParts[1]}`;
      const end = `${endParts[0].padStart(2, '0')}:${endParts[1]}`;

      // Validate end time is after start time
      if (end <= start) {
        throw new Error('End time must be after start time');
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error: insertError } = await supabase
        .from('service_availability')
        .insert({
          provider_id: user.id,
          day_of_week: selectedDay,
          start_time: start,
          end_time: end,
        });

      if (insertError) throw insertError;

      // Reload time slots
      loadAvailability();
      setShowAddModal(false);
      setNewSlot({ startTime: '', endTime: '' });
    } catch (err: any) {
      setError(err.message);
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
                      setSelectedDay(DAYS.indexOf(day));
                      setShowAddModal(true);
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

        {showAddModal && (
          <View style={styles.modalOverlay}>
            <View style={styles.modal}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  Add Time Slot for {DAYS[selectedDay]}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setShowAddModal(false);
                    setNewSlot({ startTime: '', endTime: '' });
                    setError(null);
                  }}
                  style={styles.closeButton}
                >
                  <X size={24} color="#666" />
                </TouchableOpacity>
              </View>

              {error && (
                <Text style={styles.modalError}>{error}</Text>
              )}

              <View style={styles.modalContent}>
                <View style={styles.timeInputGroup}>
                  <Text style={styles.timeLabel}>Start Time</Text>
                  <View style={styles.timeInputContainer}>
                    <Clock size={20} color="#666" />
                    <TextInput
                      style={styles.timeInput}
                      value={newSlot.startTime}
                      onChangeText={(text) => setNewSlot(prev => ({ ...prev, startTime: text }))}
                      placeholder="HH:MM"
                      keyboardType={Platform.OS === 'web' ? 'default' : 'numeric'}
                    />
                  </View>
                </View>

                <View style={styles.timeInputGroup}>
                  <Text style={styles.timeLabel}>End Time</Text>
                  <View style={styles.timeInputContainer}>
                    <Clock size={20} color="#666" />
                    <TextInput
                      style={styles.timeInput}
                      value={newSlot.endTime}
                      onChangeText={(text) => setNewSlot(prev => ({ ...prev, endTime: text }))}
                      placeholder="HH:MM"
                      keyboardType={Platform.OS === 'web' ? 'default' : 'numeric'}
                    />
                  </View>
                </View>

                <Text style={styles.timeHelp}>
                  Enter times in 24-hour format (e.g., 09:00, 17:30)
                </Text>

                <TouchableOpacity
                  style={styles.addSlotButton}
                  onPress={handleAddTimeSlot}
                >
                  <Text style={styles.addSlotButtonText}>
                    Add Time Slot
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
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
  retryButton: {
    backgroundColor: '#2B5F21',
    padding: 12,
    borderRadius: 8,
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  modal: {
    backgroundColor: '#fff',
    borderRadius: 12,
    width: '90%',
    maxWidth: 500,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: 'InterSemiBold',
    color: '#1B1B1B',
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: '#F9F9F9',
  },
  modalContent: {
    padding: 20,
    gap: 20,
  },
  timeInputGroup: {
    gap: 8,
  },
  timeLabel: {
    fontSize: 16,
    fontFamily: 'InterSemiBold',
    color: '#1B1B1B',
  },
  timeInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#F9F9F9',
    gap: 8,
  },
  timeInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Inter',
    color: '#1B1B1B',
  },
  timeHelp: {
    fontSize: 14,
    fontFamily: 'Inter',
    color: '#666',
    textAlign: 'center',
  },
  modalError: {
    color: '#FF4B4B',
    fontSize: 14,
    fontFamily: 'Inter',
    textAlign: 'center',
    padding: 16,
    backgroundColor: '#FFF1F1',
  },
  addSlotButton: {
    backgroundColor: '#2B5F21',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  addSlotButtonText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'InterSemiBold',
  },
});