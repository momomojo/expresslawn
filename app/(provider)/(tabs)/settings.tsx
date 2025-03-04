import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { Building2, MapPin, FileCheck, Bell, CreditCard, CircleHelp as HelpCircle, LogOut, ChevronRight } from 'lucide-react-native';

const menuItems = [
  {
    title: 'Business Profile',
    icon: Building2,
    color: '#2B5F21',
  },
  {
    title: 'Service Areas',
    icon: MapPin,
    color: '#FF9800',
  },
  {
    title: 'Documents & Verification',
    icon: FileCheck,
    color: '#4CAF50',
  },
  {
    title: 'Notifications',
    icon: Bell,
    color: '#2196F3',
  },
  {
    title: 'Payment Settings',
    icon: CreditCard,
    color: '#9C27B0',
  },
  {
    title: 'Help & Support',
    icon: HelpCircle,
    color: '#607D8B',
  },
];

export default function Settings() {
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace('/provider-auth/login');
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.menuSection}>
          {menuItems.map((item, index) => (
            <TouchableOpacity key={item.title} style={styles.menuItem}>
              <View style={[styles.menuIcon, { backgroundColor: `${item.color}10` }]}>
                <item.icon size={24} color={item.color} />
              </View>
              <Text style={styles.menuText}>{item.title}</Text>
              <ChevronRight size={20} color="#666" />
            </TouchableOpacity>
          ))}
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
  menuSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#EAEAEA',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#EAEAEA',
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  menuText: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'InterMedium',
    color: '#1B1B1B',
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 24,
    padding: 16,
    backgroundColor: '#FFF1F1',
    borderRadius: 12,
  },
  signOutText: {
    color: '#FF4B4B',
    fontSize: 16,
    fontFamily: 'InterSemiBold',
  },
});