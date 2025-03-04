import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../../lib/supabase';

export default function Profile() {
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
      </View>

      <View style={styles.content}>
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleSignOut}
        >
          <Text style={styles.logoutText}>Sign Out</Text>
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
  },
  title: {
    fontSize: 32,
    fontFamily: 'InterBold',
    color: '#fff',
  },
  content: {
    flex: 1,
    padding: 24,
  },
  logoutButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#FF4B4B',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  logoutText: {
    color: '#FF4B4B',
    fontSize: 16,
    fontFamily: 'InterSemiBold',
  },
});