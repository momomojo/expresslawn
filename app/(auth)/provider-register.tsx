import { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, Image } from 'react-native';
import { Link, router } from 'expo-router';
import { Building2, Mail, Lock, MapPin, Phone, FileCheck, ArrowLeft, Camera } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';

type RegistrationStep = 'basics' | 'business' | 'verification';

export default function ProviderRegister() {
  const [currentStep, setCurrentStep] = useState<RegistrationStep>('basics');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    email: '',
    password: '',
    businessName: '',
    businessAddress: '',
    phone: '',
    serviceRadius: '',
    insuranceDoc: '',
    businessLicense: '',
  });

  const handleImageUpload = async () => {
    if (Platform.OS === 'web') {
      // For web, use input type="file"
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          // In a real app, upload to storage and get URL
          console.log('File selected:', file.name);
        }
      };
      input.click();
    }
  };

  const handleRegister = async () => {
    if (!form.email || !form.password || !form.businessName || !form.businessAddress) {
      setError('Please fill in all required fields');
      return;
    }

    try {
      setLoading(true);
      setError('');

      // Sign up with provider role in metadata
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: {
            role: 'provider'
          }
        }
      });

      if (signUpError) throw signUpError;

      if (authData.user) {
        const { error: profileError } = await supabase
          .from('provider_profiles')
          .insert({
            id: authData.user.id,
            business_name: form.businessName,
            business_address: form.businessAddress,
            phone: form.phone,
            service_radius: parseInt(form.serviceRadius),
            verification_status: 'incomplete',
          });

        if (profileError) throw profileError;

        router.replace('/(provider)/(tabs)');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 'basics':
        return (
          <>
            <View style={styles.inputContainer}>
              <Mail size={20} color="#666" style={styles.inputIcon} />
              <TextInput
                placeholder="Business Email"
                style={styles.input}
                keyboardType="email-address"
                autoCapitalize="none"
                value={form.email}
                onChangeText={(text) => setForm({ ...form, email: text })}
              />
            </View>

            <View style={styles.inputContainer}>
              <Lock size={20} color="#666" style={styles.inputIcon} />
              <TextInput
                placeholder="Password"
                style={styles.input}
                secureTextEntry
                value={form.password}
                onChangeText={(text) => setForm({ ...form, password: text })}
              />
            </View>

            <TouchableOpacity 
              style={styles.button}
              onPress={() => setCurrentStep('business')}
            >
              <Text style={styles.buttonText}>Next</Text>
            </TouchableOpacity>
          </>
        );

      case 'business':
        return (
          <>
            <View style={styles.inputContainer}>
              <Building2 size={20} color="#666" style={styles.inputIcon} />
              <TextInput
                placeholder="Business Name"
                style={styles.input}
                value={form.businessName}
                onChangeText={(text) => setForm({ ...form, businessName: text })}
              />
            </View>

            <View style={styles.inputContainer}>
              <MapPin size={20} color="#666" style={styles.inputIcon} />
              <TextInput
                placeholder="Business Address"
                style={styles.input}
                value={form.businessAddress}
                onChangeText={(text) => setForm({ ...form, businessAddress: text })}
              />
            </View>

            <View style={styles.inputContainer}>
              <Phone size={20} color="#666" style={styles.inputIcon} />
              <TextInput
                placeholder="Business Phone"
                style={styles.input}
                keyboardType="phone-pad"
                value={form.phone}
                onChangeText={(text) => setForm({ ...form, phone: text })}
              />
            </View>

            <View style={styles.inputContainer}>
              <MapPin size={20} color="#666" style={styles.inputIcon} />
              <TextInput
                placeholder="Service Radius (miles)"
                style={styles.input}
                keyboardType="numeric"
                value={form.serviceRadius}
                onChangeText={(text) => setForm({ ...form, serviceRadius: text })}
              />
            </View>

            <TouchableOpacity 
              style={styles.button}
              onPress={() => setCurrentStep('verification')}
            >
              <Text style={styles.buttonText}>Next</Text>
            </TouchableOpacity>
          </>
        );

      case 'verification':
        return (
          <>
            <Text style={styles.verificationNote}>
              You can complete document verification later in your profile settings.
            </Text>

            <TouchableOpacity 
              style={styles.uploadButton}
              onPress={handleImageUpload}
              disabled={loading}
            >
              <Camera size={24} color="#2B5F21" />
              <Text style={styles.uploadText}>Upload Insurance Document</Text>
              <Text style={styles.optionalText}>(Optional)</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.uploadButton}
              onPress={handleImageUpload}
              disabled={loading}
            >
              <FileCheck size={24} color="#2B5F21" />
              <Text style={styles.uploadText}>Upload Business License</Text>
              <Text style={styles.optionalText}>(Optional)</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleRegister}
              disabled={loading}
            >
              <Text style={styles.buttonText}>
                {loading ? 'Creating Account...' : 'Complete Registration'}
              </Text>
            </TouchableOpacity>
          </>
        );
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView style={styles.scrollView}>
        <View style={styles.content}>
          <TouchableOpacity 
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <ArrowLeft size={24} color="#2B5F21" />
          </TouchableOpacity>

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

          <Text style={styles.title}>Provider Registration</Text>
          <Text style={styles.subtitle}>Step {currentStep === 'basics' ? '1' : currentStep === 'business' ? '2' : '3'} of 3</Text>

          <View style={styles.stepIndicator}>
            <View style={[styles.stepDot, currentStep === 'basics' && styles.stepActive]} />
            <View style={styles.stepLine} />
            <View style={[styles.stepDot, currentStep === 'business' && styles.stepActive]} />
            <View style={styles.stepLine} />
            <View style={[styles.stepDot, currentStep === 'verification' && styles.stepActive]} />
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.form}>
            {renderStep()}

            <Link href="/(auth)/login" asChild>
              <TouchableOpacity style={styles.loginLink}>
                <Text style={styles.loginText}>
                  Already have an account? <Text style={styles.loginHighlight}>Sign In</Text>
                </Text>
              </TouchableOpacity>
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingTop: 60,
  },
  backButton: {
    position: 'absolute',
    top: 60,
    left: 20,
    zIndex: 10,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 32,
    marginTop: 40,
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
  title: {
    fontSize: 28,
    fontFamily: 'InterBold',
    color: '#1B1B1B',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    fontFamily: 'Inter',
    textAlign: 'center',
    marginBottom: 24,
  },
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
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
  form: {
    gap: 16,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 12,
    padding: 14,
    backgroundColor: '#F9F9F9',
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Inter',
    color: '#1B1B1B',
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#2B5F21',
    borderRadius: 12,
    padding: 20,
    backgroundColor: '#F9F9F9',
  },
  uploadText: {
    fontSize: 16,
    fontFamily: 'InterMedium',
    color: '#2B5F21',
  },
  optionalText: {
    fontSize: 12,
    fontFamily: 'Inter',
    color: '#666',
    marginLeft: 4,
  },
  verificationNote: {
    fontSize: 14,
    fontFamily: 'Inter',
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  button: {
    backgroundColor: '#2B5F21',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'InterSemiBold',
  },
  loginLink: {
    marginTop: 16,
    alignItems: 'center',
  },
  loginText: {
    fontSize: 14,
    color: '#666',
    fontFamily: 'Inter',
  },
  loginHighlight: {
    color: '#2B5F21',
    fontFamily: 'InterSemiBold',
  },
});