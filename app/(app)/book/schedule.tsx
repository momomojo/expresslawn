import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { ArrowLeft, ArrowRight, Calendar as CalendarIcon, Clock } from 'lucide-react-native';

type TimeSlot = {
  start_time: string;
  end_time: string;
};

type AvailableSlot = {
  date: string;
  start_time: string;
  end_time: string;
};

type Service = {
  id: string;
  name: string;
  provider_id: string;
  duration_minutes: number;
  provider_profile: {
    business_name: string;
  };
};

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function ScheduleScreen() {
  const { serviceId } = useLocalSearchParams();
  const [service, setService] = useState<Service | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [availableSlots, setAvailableSlots] = useState<AvailableSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Calendar state
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [calendar, setCalendar] = useState<Date[][]>([]);

  useEffect(() => {
    loadService();
  }, [serviceId]);

  useEffect(() => {
    if (service) {
      loadAvailableSlots();
    }
  }, [service, selectedDate]);

  useEffect(() => {
    generateCalendar();
  }, [currentMonth]);

  const loadService = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: serviceError } = await supabase
        .from('provider_services')
        .select(`
          *,
          provider_profile:provider_profiles!inner(business_name)
        `)
        .eq('id', serviceId.toString())
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

  const loadAvailableSlots = async () => {
    if (!service) return;

    try {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .rpc('get_available_slots', {
          p_provider_id: service.provider_id,
          p_date: selectedDate.toISOString().slice(0, 10),
          p_duration_minutes: service.duration_minutes
        });

      if (error) throw error;

      if (!data || data.length === 0) {
        setAvailableSlots([]);
        return;
      }

      setAvailableSlots(
        (data || []).map(slot => ({
          date: selectedDate.toISOString().slice(0, 10),
          start_time: slot.start_time,
          end_time: slot.end_time
        }))
      );
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

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

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  const isDateSelectable = (date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    return date >= today;
  };

  const handleContinue = () => {
    if (!selectedSlot) return;
    
    if (service?.id) {
      router.push({
        pathname: '/book/address',
        params: {
          serviceId: service.id,
          date: selectedSlot.date,
          startTime: selectedSlot.start_time,
          endTime: selectedSlot.end_time,
        },
      });
    }
  };

  if (loading && !service) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2B5F21" />
          <Text style={styles.loadingText}>Loading schedule...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
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
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <ArrowLeft size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Schedule Service</Text>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.serviceInfo}>
          <CalendarIcon size={24} color="#2B5F21" />
          <View style={styles.serviceDetails}>
            <Text style={styles.serviceName}>{service?.name}</Text>
            <Text style={styles.providerName}>
              by {service?.provider_profile.business_name}
            </Text>
          </View>
        </View>

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
              <Text key={day} style={styles.dayLabel}>{day}</Text>
            ))}
          </View>

          <View style={styles.weeks}>
            {calendar.map((week, weekIndex) => (
              <View key={weekIndex} style={styles.week}>
                {week.map((date, dateIndex) => {
                  const isSelected = selectedDate.toDateString() === date.toDateString();
                  const isToday = new Date().toDateString() === date.toDateString();
                  const isCurrentMonth = date.getMonth() === currentMonth.getMonth();
                  const selectable = isDateSelectable(new Date(date));

                  return (
                    <TouchableOpacity
                      key={dateIndex}
                      style={[
                        styles.day,
                        !isCurrentMonth && styles.otherMonth,
                        isSelected && styles.selectedDay,
                        isToday && styles.today,
                        !selectable && styles.disabledDay,
                      ]}
                      onPress={() => {
                        if (selectable && isCurrentMonth) {
                          setSelectedDate(new Date(date));
                          setSelectedSlot(null);
                        }
                      }}
                      disabled={!selectable || !isCurrentMonth}
                    >
                      <Text
                        style={[
                          styles.dayNumber,
                          !isCurrentMonth && styles.otherMonthText,
                          isSelected && styles.selectedDayText,
                          isToday && styles.todayText,
                          !selectable && styles.disabledDayText,
                        ]}
                      >
                        {date.getDate()}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>
        </View>

        <View style={styles.timeSlots}>
          <Text style={styles.timeSlotsTitle}>Available Time Slots</Text>
          {loading ? (
            <ActivityIndicator size="small" color="#2B5F21" />
          ) : availableSlots.length > 0 ? (
            <View style={styles.slots}>
              {availableSlots.map((slot, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.timeSlot,
                    selectedSlot?.start_time === slot.start_time && styles.selectedTimeSlot,
                  ]}
                  onPress={() => setSelectedSlot(slot)}
                >
                  <Clock size={16} color={selectedSlot?.start_time === slot.start_time ? '#fff' : '#666'} />
                  <Text
                    style={[
                      styles.timeText,
                      selectedSlot?.start_time === slot.start_time && styles.selectedTimeText,
                    ]}
                  >
                    {formatTime(slot.start_time)} - {formatTime(slot.end_time)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <Text style={styles.noSlotsText}>
              No available time slots for the selected date
            </Text>
          )}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.continueButton, !selectedSlot && styles.continueButtonDisabled]}
          onPress={handleContinue}
          disabled={!selectedSlot}
        >
          <Text style={styles.continueButtonText}>
            {selectedSlot ? 'Continue to Address' : 'Select a Time Slot'}
          </Text>
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
  serviceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    backgroundColor: '#F9F9F9',
    borderRadius: 12,
    marginBottom: 24,
  },
  serviceDetails: {
    flex: 1,
  },
  serviceName: {
    fontSize: 18,
    fontFamily: 'InterSemiBold',
    color: '#1B1B1B',
    marginBottom: 4,
  },
  providerName: {
    fontSize: 14,
    fontFamily: 'Inter',
    color: '#666',
  },
  calendar: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
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
  disabledDay: {
    opacity: 0.3,
  },
  disabledDayText: {
    color: '#666',
  },
  timeSlots: {
    gap: 16,
  },
  timeSlotsTitle: {
    fontSize: 18,
    fontFamily: 'InterSemiBold',
    color: '#1B1B1B',
    marginBottom: 12,
  },
  slots: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  timeSlot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#F9F9F9',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  selectedTimeSlot: {
    backgroundColor: '#2B5F21',
    borderColor: '#2B5F21',
  },
  timeText: {
    fontSize: 14,
    fontFamily: 'InterMedium',
    color: '#1B1B1B',
  },
  selectedTimeText: {
    color: '#fff',
  },
  noSlotsText: {
    fontSize: 14,
    fontFamily: 'Inter',
    color: '#666',
    textAlign: 'center',
    padding: 16,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
    backgroundColor: '#fff',
  },
  continueButton: {
    backgroundColor: '#2B5F21',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  continueButtonDisabled: {
    opacity: 0.5,
  },
  continueButtonText: {
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