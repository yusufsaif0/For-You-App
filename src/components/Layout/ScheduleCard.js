import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useNow } from '../../hooks/use-now';
import { useSchedules } from '../../state/ScheduleProvider';
import { isInSelectedPeriod } from '../../utils/scheduleDates';
import ScheduleRow from './ScheduleRow';

export default function ScheduleCard() {
  const { schedules, isLoading, error, busyIds, refresh, update } = useSchedules();
  const [actionError, setActionError] = useState('');
  const now = useNow();
  const today = schedules.filter((schedule) => now && isInSelectedPeriod(schedule.starts_at, 'Today', now));
  const completed = today.filter((schedule) => schedule.completed).length;
  const toggle = async (schedule) => {
    setActionError('');
    try { await update(schedule.id, { completed: !schedule.completed }); }
    catch (failure) { setActionError(failure instanceof Error ? failure.message : 'Change not saved. Please try again.'); }
  };
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>Today&apos;s Schedule</Text>
        <Pressable accessibilityRole="button" onPress={() => router.navigate('/tabs/schedule')} style={styles.button}><Text style={styles.link}>View All</Text></Pressable>
      </View>
      {isLoading ? <ActivityIndicator accessibilityLabel="Loading today's schedule" color="#1769E0" /> : null}
      {error ? <View><Text accessibilityRole="alert" style={styles.error}>{error}{today.length ? ' Showing your last loaded schedules.' : ''}</Text>
        <Pressable accessibilityRole="button" style={styles.button} onPress={() => void refresh()}><Text style={styles.link}>Retry loading</Text></Pressable></View> : null}
      {actionError ? <Text accessibilityRole="alert" style={styles.error}>{actionError} Tap the checkbox to try again.</Text> : null}
      {!isLoading && !error && today.length === 0 ? <Text style={styles.empty}>No activities planned for today. Open Schedule to add one.</Text> : null}
      {today.length ? <Text style={styles.progress}>{completed} of {today.length} completed</Text> : null}
      {today.slice(0, 4).map((schedule) => <ScheduleRow key={schedule.id} schedule={schedule}
        busy={busyIds.includes(schedule.id)} onToggle={() => void toggle(schedule)} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 20, padding: 14, borderRadius: 18, backgroundColor: '#FFFFFF' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: '#17283D', fontWeight: '700', fontSize: 16 },
  button: { minHeight: 44, paddingHorizontal: 8, justifyContent: 'center' },
  link: { color: '#1769E0', fontWeight: '600', fontSize: 13 },
  empty: { color: '#64748B', lineHeight: 21, paddingVertical: 16 },
  progress: { color: '#64748B', fontSize: 12, marginBottom: 12 },
  error: { color: '#B91C1C', lineHeight: 20, marginVertical: 8 },
});
