import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export default function QuickActions() {
  return (
    <Pressable accessibilityRole="button" onPress={() => router.navigate('/tabs/schedule')} style={styles.card}>
      <Ionicons name="calendar-outline" size={28} color="#1769E0" />
      <View style={styles.text}><Text style={styles.title}>Plan your day</Text><Text style={styles.subtitle}>Add activities and keep track of your progress</Text></View>
      <Ionicons name="chevron-forward" size={20} color="#1769E0" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 20, marginTop: 18, padding: 16, borderRadius: 16, backgroundColor: '#FFFFFF', flexDirection: 'row', gap: 12, alignItems: 'center' },
  text: { flex: 1 },
  title: { color: '#17283D', fontSize: 15, fontWeight: '600' },
  subtitle: { color: '#64748B', fontSize: 12, marginTop: 4, lineHeight: 18 },
});
