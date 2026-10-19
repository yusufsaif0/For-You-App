import { StyleSheet, Text, View } from 'react-native';
import { useNow } from '../../hooks/use-now';

export default function HomeHeader() {
  const now = useNow();
  const hour = now?.getHours();
  const greeting = hour === undefined ? 'Welcome' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  return (
    <View style={styles.container}>
      <Text style={styles.greeting}>{greeting}</Text>
      <Text style={styles.title}>Your Daily Life</Text>
      <Text style={styles.subtitle}>Make room for what matters today.</Text>
      <Text style={styles.date}>{now?.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) ?? 'Today'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 24 },
  greeting: { fontSize: 17, color: '#475569' },
  title: { fontSize: 30, fontWeight: '700', color: '#101C2C', marginTop: 4 },
  subtitle: { fontSize: 14, color: '#64748B', marginTop: 6 },
  date: { fontSize: 13, color: '#29466B', marginTop: 14, fontWeight: '600' },
});
