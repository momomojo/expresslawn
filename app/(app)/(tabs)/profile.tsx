import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { User, Mail, Phone, MapPin, Bell, ChevronRight, LogOut } from 'lucide-react-native';

type Profile = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  address: string;
  notification_preferences?: {
    email: boolean;
    sms: boolean;
    push: boolean;
  };
};

export default function Profile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<Profile>>({});

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileError) throw profileError;
      if (!data) throw new Error('Profile not found');

      setProfile(data);
      setForm(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!form.first_name || !form.last_name) {
        throw new Error('Name is required');
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          first_name: form.first_name,
          last_name: form.last_name,
          phone: form.phone,
          address: form.address,
        })
        .eq('id', profile?.id);

      if (updateError) throw updateError;

      await loadProfile();
      setEditing(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  if (loading && !profile) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Profile</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2B5F21" />
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
      </View>

      <ScrollView style={styles.content}>
        {error && (
          <Text style={styles.errorText}>{error}</Text>
        )}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Personal Information</Text>
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => setEditing(!editing)}
            >
              <Text style={styles.editButtonText}>
                {editing ? 'Cancel' : 'Edit'}
              </Text>
            </TouchableOpacity>
          </View>

          {editing ? (
            <View style={styles.form}>
              <View style={styles.formGroup}>
                <Text style={styles.label}>First Name</Text>
                <View style={styles.inputContainer}>
                  <User size={20} color="#666" />
                  <TextInput
                    style={styles.input}
                    value={form.first_name}
                    onChangeText={(text) => setForm(prev => ({ ...prev, first_name: text }))}
                    placeholder="Enter first name"
                  />
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Last Name</Text>
                <View style={styles.inputContainer}>
                  <User size={20} color="#666" />
                  <TextInput
                    style={styles.input}
                    value={form.last_name}
                    onChangeText={(text) => setForm(prev => ({ ...prev, last_name: text }))}
                    placeholder="Enter last name"
                  />
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Phone</Text>
                <View style={styles.inputContainer}>
                  <Phone size={20} color="#666" />
                  <TextInput
                    style={styles.input}
                    value={form.phone}
                    onChangeText={(text) => setForm(prev => ({ ...prev, phone: text }))}
                    placeholder="Enter phone number"
                    keyboardType="phone-pad"
                  />
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Service Address</Text>
                <View style={styles.inputContainer}>
                  <MapPin size={20} color="#666" />
                  <TextInput
                    style={styles.input}
                    value={form.address}
                    onChangeText={(text) => setForm(prev => ({ ...prev, address: text }))}
                    placeholder="Enter service address"
                    multiline
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[styles.saveButton, loading && styles.saveButtonDisabled]}
                onPress={handleSave}
                disabled={loading}
              >
                <Text style={styles.saveButtonText}>
                  {loading ? 'Saving...' : 'Save Changes'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.profileInfo}>
              <View style={styles.infoItem}>
                <View style={styles.infoIcon}>
                  <User size={20} color="#2B5F21" />
                </View>
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Name</Text>
                  <Text style={styles.infoValue}>
                    {profile?.first_name} {profile?.last_name}
                  </Text>
                </View>
              </View>

              <View style={styles.infoItem}>
                <View style={styles.infoIcon}>
                  <Mail size={20} color="#2B5F21" />
                </View>
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Email</Text>
                  <Text style={styles.infoValue}>{profile?.email}</Text>
                </View>
              </View>

              <View style={styles.infoItem}>
                <View style={styles.infoIcon}>
                  <Phone size={20} color="#2B5F21" />
                </View>
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Phone</Text>
                  <Text style={styles.infoValue}>
                    {profile?.phone || 'Not set'}
                  </Text>
                </View>
              </View>

              <View style={styles.infoItem}>
                <View style={styles.infoIcon}>
                  <MapPin size={20} color="#2B5F21" />
                </View>
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Service Address</Text>
                  <Text style={styles.infoValue}>
                    {profile?.address || 'Not set'}
                  </Text>
                </View>
              </View>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferences</Text>
          <TouchableOpacity style={styles.menuItem}>
            <View style={styles.menuIcon}>
              <Bell size={24} color="#2B5F21" />
            </View>
            <View style={styles.menuContent}>
              <Text style={styles.menuTitle}>Notifications</Text>
              <Text style={styles.menuDescription}>
                Manage how you receive updates
              </Text>
            </View>
            <ChevronRight size={20} color="#666" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.signOutButton}
          onPress={handleSignOut}
        >
          <LogOut size={20} color="#FF4B4B" />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
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
    marginBottom: 16,
  },
  title: {
    fontSize: 32,
    fontFamily: 'InterBold',
    color: '#fff',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EAEAEA',
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#EAEAEA',
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'InterSemiBold',
    color: '#1B1B1B',
  },
  editButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#E5FFE9',
  },
  editButtonText: {
    fontSize: 14,
    fontFamily: 'InterSemiBold',
    color: '#2B5F21',
  },
  profileInfo: {
    padding: 16,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  infoIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E5FFE9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 14,
    fontFamily: 'Inter',
    color: '#666',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    fontFamily: 'InterMedium',
    color: '#1B1B1B',
  },
  form: {
    padding: 16,
    gap: 16,
  },
  formGroup: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontFamily: 'InterMedium',
    color: '#1B1B1B',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: '#F9F9F9',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 8,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Inter',
    color: '#1B1B1B',
  },
  saveButton: {
    backgroundColor: '#2B5F21',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'InterSemiBold',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
  },
  menuIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E5FFE9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  menuContent: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 16,
    fontFamily: 'InterSemiBold',
    color: '#1B1B1B',
    marginBottom: 4,
  },
  menuDescription: {
    fontSize: 14,
    fontFamily: 'Inter',
    color: '#666',
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
    marginBottom: 24,
    padding: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#FF4B4B',
    borderRadius: 12,
  },
  signOutText: {
    color: '#FF4B4B',
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
  errorText: {
    color: '#FF4B4B',
    fontSize: 14,
    fontFamily: 'Inter',
    textAlign: 'center',
    marginBottom: 16,
  },
});