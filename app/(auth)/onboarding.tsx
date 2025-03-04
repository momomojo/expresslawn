import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Image } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { User, Phone, MapPin, ArrowRight } from 'lucide-react-native';

type Step = 'personal' | 'contact' | 'preferences';

export default function Onboarding() {
  const [currentStep, setCurrentStep] = useState<Step>('personal');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    address: '',
    notificationPreferences: {
      email: true,
      sms: true,
      push: true
    }
  });

  useEffect(() => {
    checkProfile();
  }, []);

  const checkProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/login');
        return;
      }

      // Check if profile is already complete
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profile?.first_name && profile?.last_name && profile?.phone && profile?.address) {
        router.replace('/(app)/(tabs)');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleContinue = async () => {
    try {
      setLoading(true);
      setError('');

      if (currentStep === 'personal') {
        if (!form.firstName || !form.lastName) {
          throw new Error('Please enter your name');
        }
        setCurrentStep('contact');
      } else if (currentStep === 'contact') {
        if (!form.phone || !form.address) {
          throw new Error('Please enter your contact information');
        }
        setCurrentStep('preferences');
      } else {
        // Save profile
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const { error: updateError } = await supabase
          .from('profiles')
          .update({
            first_name: form.firstName,
            last_name: form.lastName,
            phone: form.phone,
            address: form.address,
            notification_preferences: form.notificationPreferences
          })
          .eq('id', user.id);

        if (updateError) throw updateError;

        router.replace('/(app)/(tabs)');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 'personal':
        return (
          <>
            <Text style={styles.stepTitle}>Welcome! Let's get to know you</Text>
            <Text style={styles.stepDescription}>
              Please enter your name as it will appear on your profile
            </Text>

            <View style={styles.inputGroup}>
              <View style={styles.inputContainer}>
                <User size={20} color="#666" />
                <TextInput
                  style={styles.input}
                  placeholder="First Name"
                  value={form.firstName}
                  onChangeText={(text) => setForm(prev => ({ ...prev, firstName: text }))}
                />
              </View>

              <View style={styles.inputContainer}>
                <User size={20} color="#666" />
                <TextInput
                  style={styles.input}
                  placeholder="Last Name"
                  value={form.lastName}
                  onChangeText={(text) => setForm(prev => ({ ...prev, lastName: text }))}
                />
              </View>
            </View>
          </>
        );

      case 'contact':
        return (
          <>
            <Text style={styles.stepTitle}>Contact Information</Text>
            <Text style={styles.stepDescription}>
              Add your contact details for service providers
            </Text>

            <View style={styles.inputGroup}>
              <View style={styles.inputContainer}>
                <Phone size={20} color="#666" />
                <TextInput
                  style={styles.input}
                  placeholder="Phone Number"
                  keyboardType="phone-pad"
                  value={form.phone}
                  onChangeText={(text) => setForm(prev => ({ ...prev, phone: text }))}
                />
              </View>

              <View style={styles.inputContainer}>
                <MapPin size={20} color="#666" />
                <TextInput
                  style={styles.input}
                  placeholder="Service Address"
                  value={form.address}
                  onChangeText={(text) => setForm(prev => ({ ...prev, address: text }))}
                  multiline
                />
              </View>
            </View>
          </>
        );

      case 'preferences':
        return (
          <>
            <Text style={styles.stepTitle}>Almost Done!</Text>
            <Text style={styles.stepDescription}>
              Choose how you'd like to receive updates about your services
            </Text>

            <View style={styles.preferencesGroup}>
              <TouchableOpacity
                style={styles.preferenceItem}
                onPress={() => setForm(prev => ({
                  ...prev,
                  notificationPreferences: {
                    ...prev.notificationPreferences,
                    email: !prev.notificationPreferences.email
                  }
                }))}
              >
                <View style={styles.preferenceCheckbox}>
                  {form.notificationPreferences.email && (
                    <View style={styles.checkboxSelected} />
                  )}
                </View>
                <View style={styles.preferenceContent}>
                  <Text style={styles.preferenceName}>Email Notifications</Text>
                  <Text style={styles.preferenceDescription}>
                    Receive booking confirmations and updates via email
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.preferenceItem}
                onPress={() => setForm(prev => ({
                  ...prev,
                  notificationPreferences: {
                    ...prev.notificationPreferences,
                    sms: !prev.notificationPreferences.sms
                  }
                }))}
              >
                <View style={styles.preferenceCheckbox}>
                  {form.notificationPreferences.sms && (
                    <View style={styles.checkboxSelected} />
                  )}
                </View>
                <View style={styles.preferenceContent}>
                  <Text style={styles.preferenceName}>SMS Updates</Text>
                  <Text style={styles.preferenceDescription}>
                    Get text messages about your upcoming services
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.preferenceItem}
                onPress={() => setForm(prev => ({
                  ...prev,
                  notificationPreferences: {
                    ...prev.notificationPreferences,
                    push: !prev.notificationPreferences.push
                  }
                }))}
              >
                <View style={styles.preferenceCheckbox}>
                  {form.notificationPreferences.push && (
                    <View style={styles.checkboxSelected} />
                  )}
                </View>
                <View style={styles.preferenceContent}>
                  <Text style={styles.preferenceName}>Push Notifications</Text>
                  <Text style={styles.preferenceDescription}>
                    Receive instant updates on your mobile device
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </>
        );
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.content}>
        <View style={styles.logoContainer}>
          <Image 
            source={{ uri: 'https://images.unsplash.com/photo-1592417817098-8fd3d9eb14a5?q=80&w=180&auto=format&fit=crop' }}
            style={styles.logoBackground}
          />
          <View style={styles.logo}>
            <Text style={styles.logoText}>L</Text>
            <View style={styles.heart} />
          </View>
        </View>

        <View style={styles.stepIndicator}>
          <View style={[styles.stepDot, currentStep === 'personal' && styles.stepActive]} />
          <View style={styles.stepLine} />
          <View style={[styles.stepDot, currentStep === 'contact' && styles.stepActive]} />
          <View style={styles.stepLine} />
          <View style={[styles.stepDot, currentStep === 'preferences' && styles.stepActive]} />
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <View style={styles.stepContent}>
          {renderStep()}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.continueButton, loading && styles.continueButtonDisabled]}
          onPress={handleContinue}
          disabled={loading}
        >
          <Text style={styles.continueButtonText}>
            {loading ? 'Saving...' : currentStep === 'preferences' ? 'Complete Setup' : 'Continue'}
          </Text>
          <ArrowRight size={20} color="#fff" />
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
  content: {
    flex: 1,
    padding: 20,
  },
  logoContainer: {
    alignItems: 'center',
    marginTop: 60,
    marginBottom: 40,
  },
  logoBackground: {
    width: 180,
    height: 180,
    position: 'absolute',
    top: -90,
    borderRadius: 90,
    opacity: 0.1,
  },
  logo: {
    width: 80,
    height: 80,
    backgroundColor: '#2B5F21',
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: {
    color: '#fff',
    fontSize: 40,
    fontFamily: 'InterBold',
  },
  heart: {
    position: 'absolute',
    right: -4,
    top: -4,
    width: 24,
    height: 24,
    backgroundColor: '#2B5F21',
    borderRadius: 12,
    transform: [{ rotate: '45deg' }],
  },
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
  },
  stepDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#E5E5E5',
  },
  stepActive: {
    backgroundColor: '#2B5F21',
    transform: [{ scale: 1.2 }],
  },
  stepLine: {
    width: 40,
    height: 2,
    backgroundColor: '#E5E5E5',
    marginHorizontal: 8,
  },
  errorText: {
    color: '#FF4B4B',
    fontSize: 14,
    fontFamily: 'Inter',
    textAlign: 'center',
    marginBottom: 16,
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 24,
    fontFamily: 'InterBold',
    color: '#1B1B1B',
    marginBottom: 8,
    textAlign: 'center',
  },
  stepDescription: {
    fontSize: 16,
    fontFamily: 'Inter',
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
  },
  inputGroup: {
    gap: 16,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    backgroundColor: '#F9F9F9',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Inter',
    color: '#1B1B1B',
  },
  preferencesGroup: {
    gap: 16,
  },
  preferenceItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
    padding: 16,
    backgroundColor: '#F9F9F9',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 12,
  },
  preferenceCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#2B5F21',
    padding: 2,
  },
  checkboxSelected: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: '#2B5F21',
  },
  preferenceContent: {
    flex: 1,
  },
  preferenceName: {
    fontSize: 16,
    fontFamily: 'InterSemiBold',
    color: '#1B1B1B',
    marginBottom: 4,
  },
  preferenceDescription: {
    fontSize: 14,
    fontFamily: 'Inter',
    color: '#666',
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
  },
  continueButton: {
    backgroundColor: '#2B5F21',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    borderRadius: 12,
  },
  continueButtonDisabled: {
    opacity: 0.7,
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'InterSemiBold',
  },
});