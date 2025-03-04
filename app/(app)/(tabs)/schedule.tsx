import { View, Text, StyleSheet } from 'react-native';

export default function Schedule() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Schedule</Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.emptyText}>No scheduled services</Text>
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontFamily: 'Inter',
    color: '#666',
  },
});