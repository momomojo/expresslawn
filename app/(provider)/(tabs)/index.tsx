import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { Clock, MapPin, DollarSign, CircleAlert as AlertCircle } from 'lucide-react-native';

type Job = {
  id: string;
  status: string;
  scheduled_date: string;
  start_time: string;
  service_address: string;
  total_price: number;
  service: {
    name: string;
  };
  customer: {
    first_name: string;
    last_name: string;
  };
};

type Stats = {
  today_jobs: number;
  today_earnings: number;
};

export default function ProviderDashboard() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [stats, setStats] = useState<Stats>({ today_jobs: 0, today_earnings: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    loadJobs();
  }, []);

  const loadJobs = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/provider-auth/login');
        return;
      }

      // Get today's jobs and earnings
      const today = new Date().toISOString().split('T')[0];
      const { data: todayStats } = await supabase
        .from('bookings')
        .select('id, total_price, status')
        .eq('provider_id', user.id)
        .eq('scheduled_date', today);

      if (todayStats) {
        setStats({
          today_jobs: todayStats.length,
          today_earnings: todayStats
            .filter(booking => booking.status === 'completed')
            .reduce((sum, booking) => sum + booking.total_price, 0)
        });
      }

      // Get upcoming jobs
      const { data: upcomingJobs, error: jobsError } = await supabase
        .from('bookings')
        .select(`
          id,
          status,
          scheduled_date,
          start_time,
          service_address,
          total_price,
          service:provider_services(name),
          customer:profiles(first_name, last_name)
        `)
        .eq('provider_id', user.id)
        .gte('scheduled_date', today)
        .in('status', ['pending', 'confirmed'])
        .order('scheduled_date', { ascending: true })
        .order('start_time', { ascending: true });

      if (jobsError) throw jobsError;
      setJobs(upcomingJobs || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptJob = async (jobId: string) => {
    try {
      setUpdating(jobId);
      setError(null);

      const { error: updateError } = await supabase
        .from('bookings')
        .update({ status: 'confirmed' })
        .eq('id', jobId);

      if (updateError) throw updateError;
      await loadJobs();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUpdating(null);
    }
  };

  const handleStartJob = async (jobId: string) => {
    try {
      setUpdating(jobId);
      setError(null);

      const { error: updateError } = await supabase
        .from('bookings')
        .update({ status: 'in_progress' })
        .eq('id', jobId);

      if (updateError) throw updateError;
      await loadJobs();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUpdating(null);
    }
  };

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Jobs</Text>
        <View style={styles.stats}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.today_jobs}</Text>
            <Text style={styles.statLabel}>Today's Jobs</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>${stats.today_earnings.toFixed(2)}</Text>
            <Text style={styles.statLabel}>Today's Earnings</Text>
          </View>
        </View>
      </View>

      <ScrollView style={styles.content}>
        {error && (
          <View style={styles.errorContainer}>
            <AlertCircle size={24} color="#FF4B4B" />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={loadJobs}
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#2B5F21" />
            <Text style={styles.loadingText}>Loading jobs...</Text>
          </View>
        ) : jobs.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No upcoming jobs</Text>
          </View>
        ) : (
          <>
            <Text style={styles.sectionTitle}>Upcoming Jobs</Text>
            
            <View style={styles.jobsList}>
              {jobs.map((job) => (
                <View key={job.id} style={styles.jobCard}>
                  <View style={styles.jobHeader}>
                    <Text style={styles.jobService}>{job.service.name}</Text>
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
                      <Text style={styles.jobDetailText}>{job.service_address}</Text>
                    </View>
                    <View style={styles.jobDetail}>
                      <Clock size={16} color="#666" />
                      <Text style={styles.jobDetailText}>
                        {formatDate(job.scheduled_date)} at {formatTime(job.start_time)}
                      </Text>
                    </View>
                    <View style={styles.jobDetail}>
                      <DollarSign size={16} color="#666" />
                      <Text style={styles.jobDetailText}>${job.total_price.toFixed(2)}</Text>
                    </View>
                  </View>

                  <TouchableOpacity 
                    style={[
                      styles.jobButton,
                      job.status === 'confirmed' ? styles.startButton : styles.acceptButton,
                      updating === job.id && styles.jobButtonDisabled
                    ]}
                    onPress={() => job.status === 'confirmed' 
                      ? handleStartJob(job.id)
                      : handleAcceptJob(job.id)
                    }
                    disabled={updating === job.id}
                  >
                    <Text style={styles.jobButtonText}>
                      {updating === job.id
                        ? 'UPDATING...'
                        : job.status === 'confirmed'
                        ? 'START JOB'
                        : 'ACCEPT JOB'
                      }
                    </Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
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
  jobButtonDisabled: {
    opacity: 0.7,
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
    gap: 12,
  },
  errorText: {
    fontSize: 16,
    fontFamily: 'Inter',
    color: '#FF4B4B',
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#2B5F21',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 14,
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
  },
});