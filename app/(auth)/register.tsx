import { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, Image } from 'react-native';
import { Link, router } from 'expo-router';
import { Lock, Mail, User, Phone, MapPin, ArrowLeft } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';

export default function Register() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    phone: '',
    address: '',
  });

  const handleRegister = async () => {
    if (!form.email || !form.password || !form.firstName || !form.lastName || !form.phone || !form.address) {
      setError('Please fill in all fields');
      return;
    }

    try {
      setLoading(true);
      setError('');

      // Create auth user
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
      });

      if (signUpError) throw signUpError;

      if (authData.user) {
        // Create profile
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: authData.user.id,
            first_name: form.firstName,
            last_name: form.lastName,
            phone: form.phone,
            address: form.address,
            role: 'customer',
          });

        if (profileError) throw profileError;

        router.replace('/(app)/(tabs)');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during registration');
    } finally {
      setLoading(false);
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

          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Enter your information below</Text>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.form}>
            <View style={styles.nameRow}>
              <View style={[styles.inputContainer, styles.nameInput]}>
                <User size={20} color="#666" style={styles.inputIcon} />
                <TextInput
                  placeholder="First Name"
                  style={styles.input}
                  value={form.firstName}
                  onChangeText={(text) => setForm({ ...form, firstName: text })}
                />
              </View>

              <View style={[styles.inputContainer, styles.nameInput]}>
                <User size={20} color="#666" style={styles.inputIcon} />
                <TextInput
                  placeholder="Last Name"
                  style={styles.input}
                  value={form.lastName}
                  onChangeText={(text) => setForm({ ...form, lastName: text })}
                />
              </View>
            </View>

            <View style={styles.inputContainer}>
              <Mail size={20} color="#666" style={styles.inputIcon} />
              <TextInput
                placeholder="Email"
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

            <View style={styles.inputContainer}>
              <Phone size={20} color="#666" style={styles.inputIcon} />
              <TextInput
                placeholder="Phone Number"
                style={styles.input}
                keyboardType="phone-pad"
                value={form.phone}
                onChangeText={(text) => setForm({ ...form, phone: text })}
              />
            </View>

            <View style={styles.inputContainer}>
              <MapPin size={20} color="#666" style={styles.inputIcon} />
              <TextInput
                placeholder="Service Address"
                style={styles.input}
                value={form.address}
                onChangeText={(text) => setForm({ ...form, address: text })}
              />
            </View>

            <TouchableOpacity 
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleRegister}
              disabled={loading}
            >
              <Text style={styles.buttonText}>
                {loading ? 'Creating Account...' : 'Create Account'}
              </Text>
            </TouchableOpacity>

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
    marginBottom: 16,
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
    marginBottom: 32,
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
  nameRow: {
    flexDirection: 'row',
    gap: 12,
  },
  nameInput: {
    flex: 1,
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