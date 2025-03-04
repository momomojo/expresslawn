import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { DollarSign, TrendingUp, Calendar } from 'lucide-react-native';

export default function Earnings() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Earnings</Text>
        <View style={styles.earningsCard}>
          <Text style={styles.earningsLabel}>This Month</Text>
          <Text style={styles.earningsAmount}>$2,450</Text>
          <View style={styles.earningsTrend}>
            <TrendingUp size={16} color="#4CAF50" />
            <Text style={styles.earningsTrendText}>+15% from last month</Text>
          </View>
        </View>
      </View>

      <ScrollView style={styles.content}>
        <Text style={styles.sectionTitle}>Recent Earnings</Text>
        
        <View style={styles.transactionsList}>
          {[1, 2, 3, 4, 5].map((i) => (
            <View key={i} style={styles.transactionCard}>
              <View style={styles.transactionIcon}>
                <DollarSign size={24} color="#2B5F21" />
              </View>
              <View style={styles.transactionInfo}>
                <Text style={styles.transactionTitle}>Lawn Mowing Service</Text>
                <Text style={styles.transactionDate}>March {i}, 2025</Text>
              </View>
              <Text style={styles.transactionAmount}>+$45.00</Text>
            </View>
          ))}
        </View>
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
    marginBottom: 24,
  },
  earningsCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 20,
  },
  earningsLabel: {
    fontSize: 14,
    fontFamily: 'Inter',
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: 8,
  },
  earningsAmount: {
    fontSize: 36,
    fontFamily: 'InterBold',
    color: '#fff',
    marginBottom: 12,
  },
  earningsTrend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  earningsTrendText: {
    fontSize: 14,
    fontFamily: 'InterMedium',
    color: '#4CAF50',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: 'InterSemiBold',
    color: '#1B1B1B',
    marginBottom: 16,
  },
  transactionsList: {
    gap: 12,
  },
  transactionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#EAEAEA',
  },
  transactionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E5FFE9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  transactionInfo: {
    flex: 1,
  },
  transactionTitle: {
    fontSize: 16,
    fontFamily: 'InterSemiBold',
    color: '#1B1B1B',
    marginBottom: 4,
  },
  transactionDate: {
    fontSize: 14,
    fontFamily: 'Inter',
    color: '#666',
  },
  transactionAmount: {
    fontSize: 16,
    fontFamily: 'InterSemiBold',
    color: '#2B5F21',
  },
});