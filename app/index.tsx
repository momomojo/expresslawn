import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Platform, ImageBackground } from 'react-native';
import { Link, router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { ArrowRight, Building2 } from 'lucide-react-native';

const heroImage = 'https://images.unsplash.com/photo-1592417817098-8fd3d9eb14a5?q=80&w=1920&auto=format&fit=crop';

export default function Index() {
  const [session, setSession] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Initial session check
    supabase.auth.getSession().then(({ data: { session: currentSession }, error }) => {
      if (error) {
        setError(error.message);
        setSession(false);
      } else if (currentSession) {
        router.replace('/(app)/(tabs)');
      } else {
        setSession(false);
      }
    });

    // Setup auth state change listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        router.replace('/(app)/(tabs)');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Show loading state while checking session
  if (session === null) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  // Show error state if there's an error
  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Error: {error}</Text>
      </View>
    );
  }

  return (
    <ImageBackground
      source={{ uri: heroImage }}
      style={styles.container}
      imageStyle={styles.backgroundImage}
    >
      <View style={styles.overlay} />
      <View style={styles.content}>
        <View style={styles.header}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>L</Text>
            <View style={styles.heart} />
          </View>
          <Text style={styles.title}>Express Lawn</Text>
          <Text style={styles.subtitle}>Professional lawn care services at your fingertips</Text>
        </View>

        <View style={styles.sections}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>For Customers</Text>
            <View style={styles.buttonContainer}>
              <TouchableOpacity 
                style={styles.primaryButton}
                onPress={() => router.push('/(auth)/register')}
              >
                <Text style={styles.primaryButtonText}>Get Started</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.secondaryButton}
                onPress={() => router.push('/(auth)/login')}
              >
                <Text style={styles.secondaryButtonText}>Sign In</Text>
              </TouchableOpacity>
            </View>
          </View>
          
          <View style={styles.divider} />
          
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>For Service Providers</Text>
            <View style={styles.buttonContainer}>
              <TouchableOpacity 
                style={styles.providerButton}
                onPress={() => router.push('/(auth)/provider-register')}
              >
                <Building2 size={20} color="#2B5F21" />
                <Text style={styles.providerButtonText}>Register as Provider</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.secondaryButton, styles.providerSecondaryButton]}
                onPress={() => router.push('/(provider-auth)/login')}
              >
                <Text style={[styles.secondaryButtonText, styles.providerSecondaryText]}>Provider Login</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </ImageBackground>
  );

}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backgroundImage: StyleSheet.flatten({
    opacity: 0.8
  }),
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(43, 95, 33, 0.85)',
  },
  content: {
    flex: 1,
    padding: 20,
    justifyContent: 'space-between',
  },
  header: {
    alignItems: 'center',
    marginTop: Platform.OS === 'web' ? 80 : 60,
  },
  logo: {
    width: 80,
    height: 80,
    backgroundColor: '#fff',
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  logoText: {
    color: '#2B5F21',
    fontSize: 40,
    fontFamily: 'InterBold',
  },
  heart: {
    position: 'absolute',
    right: -4,
    top: -4,
    width: 24,
    height: 24,
    backgroundColor: '#fff',
    borderRadius: 12,
    transform: [{ rotate: '45deg' }],
  },
  title: {
    fontSize: Platform.OS === 'web' ? 48 : 36,
    fontFamily: 'InterBold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 16,
  },
  subtitle: {
    fontSize: Platform.OS === 'web' ? 20 : 18,
    fontFamily: 'Inter',
    color: '#fff',
    opacity: 0.9,
    textAlign: 'center',
    paddingHorizontal: 20,
    marginBottom: 40,
  },
  sections: {
    gap: 32,
    marginBottom: Platform.OS === 'web' ? 80 : 40,
  },
  section: {
    gap: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: 'InterSemiBold',
    color: '#fff',
    textAlign: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginHorizontal: 40,
  },
  buttonContainer: {
    gap: 12,
  },
  primaryButton: {
    backgroundColor: '#fff',
    paddingVertical: Platform.OS === 'web' ? 16 : 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: 'center'
  },
  primaryButtonText: {
    color: '#2B5F21',
    fontSize: Platform.OS === 'web' ? 18 : 16,
    fontFamily: 'InterSemiBold',
  },
  providerButton: {
    backgroundColor: '#fff',
    paddingVertical: Platform.OS === 'web' ? 16 : 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#2B5F21',
  },
  providerButtonText: {
    color: '#2B5F21',
    fontSize: Platform.OS === 'web' ? 18 : 16,
    fontFamily: 'InterSemiBold',
  },
  secondaryButton: {
    borderWidth: 2,
    borderColor: '#fff',
    paddingVertical: Platform.OS === 'web' ? 16 : 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#fff',
    fontSize: Platform.OS === 'web' ? 18 : 16,
    fontFamily: 'InterSemiBold',
  },
  loadingText: {
    fontSize: 16,
    fontFamily: 'Inter',
    color: '#666',
    textAlign: 'center',
  },
  errorText: {
    color: '#FF4B4B',
    fontSize: 16,
    fontFamily: 'Inter',
    textAlign: 'center',
  },
  providerSecondaryButton: {
    borderColor: '#2B5F21',
    backgroundColor: 'rgba(43, 95, 33, 0.1)',
  },
  providerSecondaryText: {
    color: '#2B5F21',
  },
});