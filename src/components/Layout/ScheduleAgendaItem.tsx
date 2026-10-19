import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { toScheduleListItem, type Schedule } from '@/types/schedule';
import { useScheduleColors } from './schedule-theme';

interface Props {
  schedule: Schedule;
  busy: boolean;
  showDate?: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

// Schedule owns this presentation; Home continues to use ScheduleRow.
export default function ScheduleAgendaItem({ schedule, busy, showDate, onToggle, onEdit, onDelete }: Props) {
  const colors = useScheduleColors();
  const item = toScheduleListItem(schedule);
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.accent, { backgroundColor: schedule.completed ? colors.green : item.iconBackground }]} />
      <View style={styles.content}>
        <View style={styles.topLine}>
          <View style={[styles.category, { backgroundColor: colors.surfaceAlt }]}>
            <Ionicons name={item.icon as keyof typeof Ionicons.glyphMap} size={13} color={colors.muted} />
            <Text style={[styles.categoryText, { color: colors.muted }]}>{schedule.category}</Text>
          </View>
          <Text style={[styles.time, { color: colors.muted }]}>{item.time}</Text>
        </View>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: schedule.completed ? colors.muted : colors.text }, schedule.completed && styles.completed]}>{item.title}</Text>
          <Pressable onPress={onToggle} disabled={busy} accessibilityRole="checkbox"
            accessibilityState={{ checked: schedule.completed, disabled: busy }} aria-checked={schedule.completed}
            accessibilityLabel={`Mark ${schedule.title} ${schedule.completed ? 'incomplete' : 'complete'}`}
            style={({ pressed }) => [styles.touch, pressed && { backgroundColor: colors.surfaceAlt }, busy && styles.disabled]}>
            {busy ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name={schedule.completed ? 'checkmark-circle' : 'ellipse-outline'} size={25} color={schedule.completed ? colors.green : colors.muted} />}
          </Pressable>
        </View>
        {item.notes ? <Text style={[styles.notes, { color: colors.muted }]}>{item.notes}</Text> : null}
        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          <View style={styles.metadata}>
            {showDate ? <Text style={[styles.date, { color: colors.muted }]}>{new Date(schedule.starts_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</Text> : null}
            {schedule.completed ? <Text style={[styles.status, { color: colors.green }]}>Completed</Text> : null}
            {schedule.reminder_at ? <Ionicons name="notifications-outline" size={14} color={colors.muted} accessibilityLabel="Reminder set" /> : null}
          </View>
          <Pressable onPress={onEdit} disabled={busy} accessibilityRole="button" accessibilityLabel={`Edit ${item.title}`}
            style={({ pressed }) => [styles.action, pressed && { backgroundColor: colors.primarySoft }, busy && styles.disabled]}>
            <Ionicons name="create-outline" size={17} color={colors.primary} /><Text style={[styles.actionText, { color: colors.primary }]}>Edit</Text>
          </Pressable>
          <Pressable onPress={onDelete} disabled={busy} accessibilityRole="button" accessibilityLabel={`Delete ${item.title}`}
            style={({ pressed }) => [styles.touch, pressed && { backgroundColor: colors.redSoft }, busy && styles.disabled]}>
            <Ionicons name="trash-outline" size={17} color={colors.muted} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', borderWidth: 1, borderRadius: 18, overflow: 'hidden', marginBottom: 12 },
  accent: { width: 4, marginVertical: 18, borderRadius: 2 },
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  topLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  category: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6 },
  categoryText: { fontSize: 11, fontWeight: '500' },
  time: { fontSize: 12, fontWeight: '500' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  title: { flex: 1, fontSize: 16, lineHeight: 23, fontWeight: '600' },
  completed: { textDecorationLine: 'line-through' },
  touch: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  notes: { fontSize: 13, lineHeight: 20, marginBottom: 10 },
  footer: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, marginTop: 6, gap: 4 },
  metadata: { flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, paddingVertical: 8 },
  date: { fontSize: 11 },
  status: { fontSize: 11, fontWeight: '500' },
  action: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 10, borderRadius: 22 },
  actionText: { fontSize: 12, fontWeight: '600' },
  disabled: { opacity: 0.5 },
});
