import { Link, useRouter } from 'expo-router';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';

export default function NotFoundScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Oops!</Text>
        <Text style={styles.message}>This screen doesn't exist.</Text>
        <TouchableOpacity 
          style={styles.button}
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace('/');
            }
          }}
        >
          <ArrowLeft size={20} color="#fff" />
          <Text style={styles.buttonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 20,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 32,
    fontFamily: 'InterBold',
    color: '#1B1B1B',
    marginBottom: 8,
  },
  message: {
    fontSize: 16,
    fontFamily: 'Inter',
    color: '#666',
    marginBottom: 24,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#2B5F21',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'InterSemiBold',
  },
});