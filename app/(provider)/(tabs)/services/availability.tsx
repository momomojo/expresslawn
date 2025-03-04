import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Platform } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../../../lib/supabase';
import { ArrowLeft, Plus, Trash2, X, Clock, Calendar, ArrowRight, CalendarDays } from 'lucide-react-native';

type Tab = 'weekly' | 'overrides';

type TimeSlot = {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
};

type DateOverride = {
  override_date: string;
  override_type: 'blackout' | 'custom' | 'vacation';
  start_time?: string;
  end_time?: string;
  reason?: string;
};

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const formatTime = (time: string) => {
  const [hours, minutes] = time.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minutes} ${ampm}`;
};

export default function AvailabilityScreen() {
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [dateOverrides, setDateOverrides] = useState<DateOverride[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<Tab>('weekly');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [calendar, setCalendar] = useState<Date[][]>([]);
  const [newSlot, setNewSlot] = useState({
    startTime: '',
    endTime: '',
  });
  const [newOverride, setNewOverride] = useState<Partial<DateOverride>>({
    override_type: 'blackout',
    reason: '',
    timeSlots: [{ start_time: '', end_time: '' }],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAvailability();
    loadDateOverrides();
  }, []);

  useEffect(() => {
    generateCalendar();
  }, [currentMonth]);

  const generateCalendar = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    const calendar: Date[][] = [];
    let week: Date[] = [];
    
    // Add empty days from previous month
    for (let i = 0; i < firstDay.getDay(); i++) {
      week.push(new Date(year, month, -firstDay.getDay() + i + 1));
    }
    
    // Add days of current month
    for (let day = 1; day <= lastDay.getDate(); day++) {
      if (week.length === 7) {
        calendar.push(week);
        week = [];
      }
      week.push(new Date(year, month, day));
    }
    
    // Add empty days from next month
    while (week.length < 7) {
      week.push(new Date(year, month + 1, week.length - lastDay.getDay()));
    }
    calendar.push(week);
    
    setCalendar(calendar);
  };

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

  const loadDateOverrides = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('service_availability_overrides')
        .select('*')
        .eq('provider_id', user.id)
        .gte('override_date', new Date().toISOString().split('T')[0])
        .order('override_date');

      if (error) throw error;
      setDateOverrides(data || []);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleAddOverride = async () => {
    if (!selectedDate) return;

    try {
      setError(null);
      setLoading(true);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      let timeSlots = null;
      if (newOverride.override_type === 'custom') {
        if (!newOverride.timeSlots?.length) {
          throw new Error('Please add at least one time slot');
        }

        // Validate and sort time slots
        timeSlots = newOverride.timeSlots
          .filter(slot => slot.start_time && slot.end_time)
          .sort((a, b) => a.start_time.localeCompare(b.start_time));

        // Validate minimum duration and overlaps
        for (const slot of timeSlots) {
          const startDate = new Date(`1970-01-01T${slot.start_time}`);
          const endDate = new Date(`1970-01-01T${slot.end_time}`);
          const durationMinutes = (endDate.getTime() - startDate.getTime()) / 60000;

          if (durationMinutes < 30) {
            throw new Error('Each time slot must be at least 30 minutes');
          }
        }

        // Check for overlaps
        for (let i = 0; i < timeSlots.length - 1; i++) {
          if (timeSlots[i].end_time > timeSlots[i + 1].start_time) {
            throw new Error('Time slots cannot overlap');
          }
        }
      }

      const override = {
        override_type: newOverride.override_type,
        override_date: selectedDate.toISOString().split('T')[0],
        time_slots: timeSlots,
        reason: newOverride.reason,
        provider_id: user.id
      };

      const { error } = await supabase
        .from('service_availability_overrides')
        .upsert(override);

      if (error) {
        if (error.code === '23505') {
          throw new Error('An override already exists for this date');
        }
        throw error;
      }

      loadDateOverrides();
      setShowOverrideModal(false);
      setNewOverride({
        override_type: 'blackout',
        reason: '',
        timeSlots: [{ start_time: '', end_time: '' }]
      });
      setSelectedDate(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddTimeSlot = async () => {
    try {
      setError(null);
      
      if (!newSlot.startTime || !newSlot.endTime) {
        throw new Error('Please select both start and end times');
      }

      const start = newSlot.startTime;
      const end = newSlot.endTime;

      // Validate end time is after start time
      if (end <= start) {
        throw new Error('End time must be after start time');
      }

      // Validate minimum duration (30 minutes)
      const startDate = new Date(`1970-01-01T${start}`);
      const endDate = new Date(`1970-01-01T${end}`);
      const durationMinutes = (endDate.getTime() - startDate.getTime()) / 60000;
      
      if (durationMinutes < 30) {
        throw new Error('Time slot must be at least 30 minutes');
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error: insertError } = await supabase
        .from('service_availability')
        .insert({
          provider_id: user.id,
          day_of_week: selectedDay,
          start_time: start,
          end_time: end,
        });

      if (insertError) {
        if (insertError.message.includes('overlaps')) {
          throw new Error('This time slot overlaps with an existing slot');
        }
        throw insertError;
      }

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

      <View style={styles.tabs}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'weekly' && styles.activeTab]}
          onPress={() => setActiveTab('weekly')}
        >
          <CalendarDays size={20} color={activeTab === 'weekly' ? '#2B5F21' : '#666'} />
          <Text style={[styles.tabText, activeTab === 'weekly' && styles.activeTabText]}>
            Weekly Schedule
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'overrides' && styles.activeTab]}
          onPress={() => setActiveTab('overrides')}
        >
          <Calendar size={20} color={activeTab === 'overrides' ? '#2B5F21' : '#666'} />
          <Text style={[styles.tabText, activeTab === 'overrides' && styles.activeTabText]}>
            Date Overrides
          </Text>
        </TouchableOpacity>
      </View>
      <ScrollView style={styles.content}>
        {error && <Text style={styles.errorText}>{error}</Text>}

        {activeTab === 'overrides' ? (
          <View style={styles.section}>
          <Text style={styles.sectionTitle}>Date Overrides</Text>
          <Text style={styles.sectionDescription}>
            Set specific dates as unavailable or with custom hours
          </Text>

          <View style={styles.calendar}>
            <View style={styles.calendarHeader}>
              <TouchableOpacity
                onPress={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() - 1)))}
              >
                <ArrowLeft size={24} color="#1B1B1B" />
              </TouchableOpacity>
              <Text style={styles.monthYear}>
                {MONTHS[currentMonth.getMonth()]} {currentMonth.getFullYear()}
              </Text>
              <TouchableOpacity
                onPress={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() + 1)))}
              >
                <ArrowRight size={24} color="#1B1B1B" />
              </TouchableOpacity>
            </View>

            <View style={styles.daysHeader}>
              {DAYS.map(day => (
                <Text key={day} style={styles.dayLabel}>{day.slice(0, 3)}</Text>
              ))}
            </View>

            <View style={styles.weeks}>
              {calendar.map((week, weekIndex) => (
                <View key={weekIndex} style={styles.week}>
                  {week.map((date, dateIndex) => {
                    const dateStr = date.toISOString().split('T')[0];
                    const override = dateOverrides.find(o => o.override_date === dateStr);
                    const isSelected = selectedDate?.toDateString() === date.toDateString();
                    const isToday = new Date().toDateString() === date.toDateString();
                    const isCurrentMonth = date.getMonth() === currentMonth.getMonth();
                    const isPast = date < new Date(new Date().setHours(0, 0, 0, 0));

                    return (
                      <TouchableOpacity
                        key={dateIndex}
                        style={[
                          styles.day,
                          !isCurrentMonth && styles.otherMonth,
                          isSelected && styles.selectedDay,
                          isToday && styles.today,
                          override?.override_type === 'blackout' && styles.blackoutDay,
                          override?.override_type === 'vacation' && styles.vacationDay,
                          override?.override_type === 'custom' && styles.customDay,
                          isPast && styles.pastDay,
                        ]}
                        onPress={() => {
                          if (!isPast && isCurrentMonth) {
                            setSelectedDate(date);
                            setShowOverrideModal(true);
                          }
                        }}
                        disabled={isPast || !isCurrentMonth}
                      >
                        <Text
                          style={[
                            styles.dayNumber,
                            !isCurrentMonth && styles.otherMonthText,
                            isSelected && styles.selectedDayText,
                            isToday && styles.todayText,
                            override && styles.overrideText,
                            isPast && styles.pastDayText,
                          ]}
                        >
                          {date.getDate()}
                        </Text>
                        {override && (
                          <View
                            style={[
                              styles.overrideIndicator,
                              override.override_type === 'blackout' && styles.blackoutIndicator,
                              override.override_type === 'vacation' && styles.vacationIndicator,
                              override.override_type === 'custom' && styles.customIndicator,
                            ]}
                          />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </View>
          </View>
        </View>
        ) : (
          <View style={styles.section}>
          <Text style={styles.sectionTitle}>Weekly Schedule</Text>
          <Text style={styles.sectionDescription}>
            Set your regular working hours for each day
          </Text>

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
        </View>
        )}
      </ScrollView>

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
                <input 
                  style={styles.timeInput}
                  type="time"
                  value={newSlot.startTime}
                  onChange={(e) => setNewSlot(prev => ({ ...prev, startTime: e.target.value }))}
                  step="1800"
                />
              </View>

              <View style={styles.timeInputGroup}>
                <Text style={styles.timeLabel}>End Time</Text>
                <input
                  style={styles.timeInput}
                  type="time"
                  value={newSlot.endTime}
                  onChange={(e) => setNewSlot(prev => ({ ...prev, endTime: e.target.value }))}
                  step="1800"
                />
              </View>

              <Text style={styles.timeHelp}>
                Time slots must be at least 30 minutes long
              </Text>

              <TouchableOpacity
                style={[styles.addSlotButton, loading && styles.buttonDisabled]}
                onPress={handleAddTimeSlot}
                disabled={loading}
              >
                <Plus size={20} color="#fff" />
                <Text style={styles.addSlotButtonText}>
                  {loading ? 'Adding...' : 'Add Time Slot'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {showOverrideModal && selectedDate && (
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Set Override for {selectedDate.toLocaleDateString()}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setShowOverrideModal(false);
                  setSelectedDate(null);
                  setNewOverride({
                    override_type: 'blackout',
                    reason: '',
                  });
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
              <View style={styles.formGroup}>
                <Text style={styles.label}>Override Type</Text>
                <View style={styles.pickerContainer}>
                  <select
                    value={newOverride.override_type}
                    onChange={(e) => setNewOverride(prev => ({
                      ...prev,
                      override_type: e.target.value as DateOverride['override_type'],
                    }))}
                    style={styles.picker}
                  >
                    <option value="blackout">Unavailable</option>
                    <option value="vacation">Vacation</option>
                    <option value="custom">Custom Hours</option>
                  </select>
                </View>
              </View>

              {newOverride.override_type === 'custom' && (
                <>
                  {newOverride.timeSlots?.map((slot, index) => (
                    <View key={index} style={styles.timeSlotGroup}>
                      <View style={styles.timeInputGroup}>
                        <Text style={styles.timeLabel}>Start Time</Text>
                        <input
                          style={styles.timeInput}
                          type="time"
                          value={slot.start_time}
                         step="1800"
                          onChange={(e) => {
                            const updatedSlots = [...(newOverride.timeSlots || [])];
                            updatedSlots[index] = { ...slot, start_time: e.target.value };
                            setNewOverride(prev => ({
                              ...prev,
                              timeSlots: updatedSlots,
                            }));
                          }}
                        />
                      </View>

                      <View style={styles.timeInputGroup}>
                        <Text style={styles.timeLabel}>End Time</Text>
                        <input
                          style={styles.timeInput}
                          type="time"
                          value={slot.end_time}
                         step="1800"
                          onChange={(e) => {
                            const updatedSlots = [...(newOverride.timeSlots || [])];
                            updatedSlots[index] = { ...slot, end_time: e.target.value };
                            setNewOverride(prev => ({
                              ...prev,
                              timeSlots: updatedSlots,
                            }));
                          }}
                        />
                      </View>

                      {index > 0 && (
                        <TouchableOpacity
                          style={styles.removeSlotButton}
                          onPress={() => {
                            const updatedSlots = newOverride.timeSlots?.filter((_, i) => i !== index);
                            setNewOverride(prev => ({
                              ...prev,
                              timeSlots: updatedSlots,
                            }));
                          }}
                        >
                          <Trash2 size={20} color="#FF4B4B" />
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}

                  <TouchableOpacity
                    style={styles.addSlotButton}
                    onPress={() => {
                      setNewOverride(prev => ({
                        ...prev,
                        timeSlots: [...(prev.timeSlots || []), { start_time: '', end_time: '' }],
                      }));
                    }}
                  >
                    <Plus size={20} color="#fff" />
                    <Text style={styles.addSlotButtonText}>Add Time Slot</Text>
                  </TouchableOpacity>
                </>
              )}

              <View style={styles.formGroup}>
                <Text style={styles.label}>Reason (Optional)</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={newOverride.reason}
                  onChangeText={(text) => setNewOverride(prev => ({
                    ...prev,
                    reason: text,
                  }))}
                  placeholder="Enter reason for override"
                  multiline
                  numberOfLines={3}
                />
              </View>

              <TouchableOpacity
                style={[styles.addSlotButton, loading && styles.buttonDisabled]}
                onPress={handleAddOverride}
                disabled={loading}
              >
                <Plus size={20} color="#fff" />
                <Text style={styles.addSlotButtonText}>
                  {loading ? 'Setting Override...' : 'Set Override'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
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
  tabs: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
    backgroundColor: '#fff',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#F9F9F9',
  },
  activeTab: {
    backgroundColor: '#E5FFE9',
  },
  tabText: {
    fontSize: 14,
    fontFamily: 'InterSemiBold',
    color: '#666',
  },
  activeTabText: {
    color: '#2B5F21',
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
    borderWidth: 0.5,
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
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 1000,
    overflowY: 'auto',
    paddingVertical: 20,
    paddingHorizontal: 20,
  },
  modal: {
    backgroundColor: '#fff',
    borderRadius: 12,
    width: '90%',
    maxWidth: 500,
    marginVertical: 'auto',
    marginHorizontal: 'auto'
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
    gap: 16,
  },
  timeInputGroup: {
    gap: 8,
    flex: 1,
  },
  timeLabel: {
    fontSize: 16,
    fontFamily: 'InterSemiBold',
    color: '#1B1B1B',
  },
  timeInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Inter',
    color: '#1B1B1B',
    backgroundColor: '#F9F9F9',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 8,
    padding: 8,
    width: '100%',
    outlineStyle: 'none',
    appearance: 'none',
    WebkitAppearance: 'none',
    MozAppearance: 'none',
  },
  timeHelp: {
    fontSize: 14,
    fontFamily: 'Inter',
    color: '#2B5F21',
    textAlign: 'center',
    marginTop: -8,
  },
  modalError: {
    color: '#FF4B4B',
    fontSize: 14,
    fontFamily: 'Inter',
    textAlign: 'center',
    padding: 16,
    backgroundColor: '#FFF1F1',
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: 'InterSemiBold',
    color: '#1B1B1B',
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    fontFamily: 'Inter',
    color: '#666',
    marginBottom: 16,
  },
  calendar: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  monthYear: {
    fontSize: 18,
    fontFamily: 'InterSemiBold',
    color: '#1B1B1B',
  },
  daysHeader: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  dayLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 14,
    fontFamily: 'InterMedium',
    color: '#666',
  },
  weeks: {
    gap: 8,
  },
  week: {
    flexDirection: 'row',
    gap: 8,
  },
  day: {
    flex: 1,
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    position: 'relative',
  },
  dayNumber: {
    fontSize: 16,
    fontFamily: 'Inter',
    color: '#1B1B1B',
  },
  selectedDay: {
    backgroundColor: '#2B5F21',
  },
  selectedDayText: {
    color: '#fff',
    fontFamily: 'InterSemiBold',
  },
  today: {
    backgroundColor: '#E5FFE9',
  },
  todayText: {
    color: '#2B5F21',
    fontFamily: 'InterSemiBold',
  },
  otherMonth: {
    opacity: 0.3,
  },
  otherMonthText: {
    color: '#666',
  },
  blackoutDay: {
    backgroundColor: '#FFE5E5',
  },
  vacationDay: {
    backgroundColor: '#FFF4E5',
  },
  customDay: {
    backgroundColor: '#E5FFE9',
  },
  pastDay: {
    opacity: 0.3,
  },
  pastDayText: {
    color: '#666',
  },
  overrideText: {
    fontFamily: 'InterSemiBold',
  },
  overrideIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    position: 'absolute',
    bottom: 6,
  },
  blackoutIndicator: {
    backgroundColor: '#FF4B4B',
  },
  vacationIndicator: {
    backgroundColor: '#FF9800',
  },
  customIndicator: {
    backgroundColor: '#4CAF50',
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 8,
    backgroundColor: '#F9F9F9',
    overflow: 'hidden',
  },
  picker: {
    width: '100%',
    height: 50,
    padding: 12,
    fontSize: 16,
    fontFamily: 'Inter',
    color: '#1B1B1B',
    backgroundColor: '#F9F9F9',
    borderWidth: 0,
    outlineStyle: 'none',
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
    fontFamily: 'InterSemiBold',
    color: '#1B1B1B',
    marginBottom: 8,
  },
  input: {
    fontSize: 16,
    fontFamily: 'Inter',
    color: '#1B1B1B',
  },
  textArea: {
    height: 80,
    padding: 12,
    textAlignVertical: 'top',
    backgroundColor: '#F9F9F9',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 8,
  },
  addSlotButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2B5F21',
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  addSlotButtonText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'InterSemiBold',
  },
  timeSlotGroup: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-end',
    marginBottom: 16,
  },
  removeSlotButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFF1F1',
    borderRadius: 8,
    marginBottom: 8,
  },
});