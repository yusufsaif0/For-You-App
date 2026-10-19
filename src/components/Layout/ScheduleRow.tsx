import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useAppTheme } from '@/state/ThemeProvider';
import { toScheduleListItem, type Schedule } from '@/types/schedule';

interface Props {
  schedule: Schedule;
  busy?: boolean;
  showDate?: boolean;
  onToggle?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

export default function ScheduleRow({ schedule, busy, showDate, onToggle, onEdit, onDelete }: Props) {
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const inlineActions = width >= 640;
  const item = toScheduleListItem(schedule);
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.row}>
        {onToggle ? (
          <Pressable onPress={onToggle} disabled={busy} accessibilityRole="checkbox"
            accessibilityState={{ checked: schedule.completed, disabled: busy }}
            aria-checked={schedule.completed} aria-disabled={busy}
            accessibilityLabel={`Mark ${schedule.title} ${schedule.completed ? 'incomplete' : 'complete'}`}
            style={styles.touch}>
            {busy ? <ActivityIndicator color={colors.primary} /> : (
              <Ionicons name={schedule.completed ? 'checkbox' : 'square-outline'} size={26}
                color={schedule.completed ? colors.green : colors.muted} />
            )}
          </Pressable>
        ) : null}
        <View style={[styles.icon, { backgroundColor: item.iconBackground }]}>
          <Ionicons name={item.icon as keyof typeof Ionicons.glyphMap} color={item.iconColor} size={20} />
        </View>
        <View style={styles.details}>
          <Text style={[styles.title, { color: colors.text }, schedule.completed && { color: colors.muted, textDecorationLine: 'line-through' }]}>{item.title}</Text>
          <Text style={[styles.time, { color: colors.muted }]}>
            {showDate ? `${new Date(schedule.starts_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · ` : ''}
            {item.time}{schedule.completed ? ' · Completed' : ''}
          </Text>
          {item.notes ? <Text style={[styles.notes, { color: colors.muted }]}>{item.notes}</Text> : null}
        </View>
        {inlineActions && (onEdit || onDelete) ? (
          <View style={styles.inlineActions}>
            {onEdit ? <Pressable onPress={onEdit} disabled={busy} accessibilityLabel={`Edit ${item.title}`} accessibilityRole="button" style={styles.action}>
              <Ionicons name="create-outline" size={18} color={colors.primary} /><Text style={[styles.edit, { color: colors.primary }]}>Edit</Text>
            </Pressable> : null}
            {onDelete ? <Pressable onPress={onDelete} disabled={busy} accessibilityLabel={`Delete ${item.title}`} accessibilityRole="button" style={styles.action}>
              <Ionicons name="trash-outline" size={18} color="#B91C1C" /><Text style={styles.delete}>Delete</Text>
            </Pressable> : null}
          </View>
        ) : null}
      </View>
      {!inlineActions && (onEdit || onDelete) ? (
        <View style={styles.actions}>
          {onEdit ? <Pressable onPress={onEdit} disabled={busy} accessibilityLabel={`Edit ${item.title}`} accessibilityRole="button" style={styles.action}>
            <Ionicons name="create-outline" size={18} color={colors.primary} /><Text style={[styles.edit, { color: colors.primary }]}>Edit</Text>
          </Pressable> : null}
          {onDelete ? <Pressable onPress={onDelete} disabled={busy} accessibilityLabel={`Delete ${item.title}`} accessibilityRole="button" style={styles.action}>
            <Ionicons name="trash-outline" size={18} color="#B91C1C" /><Text style={styles.delete}>Delete</Text>
          </Pressable> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, padding: 12, marginBottom: 10, borderWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  touch: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  icon: { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  details: { flex: 1, gap: 4 },
  title: { fontSize: 15, fontWeight: '600' },
  time: { fontSize: 12 },
  notes: { fontSize: 13, lineHeight: 19 },
  inlineActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 5 },
  action: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8 },
  edit: { fontSize: 13, fontWeight: '600' },
  delete: { color: '#B91C1C', fontSize: 13, fontWeight: '600' },
});
