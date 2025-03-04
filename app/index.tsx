import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Platform, ImageBackground } from 'react-native';
import { Link, router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { ArrowRight } from 'lucide-react-native';

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

        <View style={styles.buttonContainer}>
          <Link href="/register" asChild>
            <TouchableOpacity style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Get Started</Text>
              <ArrowRight size={20} color="#2B5F21" />
            </TouchableOpacity>
          </Link>
          <Link href="/login" asChild>
            <TouchableOpacity style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Sign In</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backgroundImage: {
    opacity: 0.8,
  },
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
  },
  buttonContainer: {
    gap: 12,
    marginBottom: Platform.OS === 'web' ? 80 : 40,
  },
  primaryButton: {
    backgroundColor: '#fff',
    paddingVertical: Platform.OS === 'web' ? 16 : 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryButtonText: {
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
});