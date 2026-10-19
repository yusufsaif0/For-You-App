import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { defaultScheduleCategories, getScheduleCategoryStyle, type Schedule, type ScheduleCategory, type ScheduleCreateInput } from '@/types/schedule';
import { useAppTheme } from '@/state/ThemeProvider';
import ScheduleDateTimeField from './ScheduleDateTimeField';
import { useScheduleColors } from './schedule-theme';
import ScheduleCategoryField from './ScheduleCategoryField';

interface Props {
  visible: boolean;
  appearance?: 'schedule';
  initialSchedule?: Schedule | null;
  initialDate?: Date;
  initialCategory?: string;
  categories?: string[];
  onCreateCategory: (name: string) => Promise<string>;
  onClose: () => void;
  onSave: (input: ScheduleCreateInput) => Promise<void>;
}

export default function ScheduleEditor({ visible, appearance, initialSchedule, initialDate, initialCategory, categories = defaultScheduleCategories, onCreateCategory, onClose, onSave }: Props) {
  const insets = useSafeAreaInsets();
  const { colors: appColors, theme } = useAppTheme();
  const scheduleColors = useScheduleColors();
  const colors = appearance === 'schedule' ? scheduleColors : appColors;
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(new Date());
  const [category, setCategory] = useState<ScheduleCategory>('Workout');
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const saving = useRef(false);
  const scroll = useRef<ScrollView>(null);
  const categoryExpanded = useRef(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    categoryExpanded.current = false;
    // Opening the modal or changing its target resets the draft form.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTitle(initialSchedule?.title ?? '');
    setNotes(initialSchedule?.notes ?? '');
    const initialValue = initialSchedule ? new Date(initialSchedule.starts_at) : new Date();
    if (!initialSchedule && initialDate) initialValue.setFullYear(initialDate.getFullYear(), initialDate.getMonth(), initialDate.getDate());
    setDate(initialValue);
    setCategory(initialSchedule?.category ?? initialCategory ?? 'Workout');
    setReminderEnabled(!!initialSchedule?.reminder_at);
    setError('');
  }, [visible, initialSchedule, initialDate, initialCategory]);

  const close = () => { if (!saving.current) onClose(); };
  const save = async () => {
    if (saving.current) return;
    if (!title.trim() || title.trim().length > 120) {
      setError('Enter an activity name between 1 and 120 characters.');
      return;
    }
    if (!Number.isFinite(date.getTime())) { setError('Choose a valid date and time.'); return; }
    if (reminderEnabled && date.getTime() - 10 * 60_000 <= Date.now()) {
      setError('Choose a schedule at least 10 minutes in the future to set a reminder.');
      return;
    }
    const style = getScheduleCategoryStyle(category);
    saving.current = true;
    setIsSaving(true);
    setError('');
    try {
      await onSave({
        title: title.trim(), notes: notes.trim(), starts_at: date.toISOString(), category,
        icon: initialSchedule?.category === category ? initialSchedule.icon ?? style.icon : style.icon,
        color: initialSchedule?.category === category ? initialSchedule.color ?? style.iconBackground : style.iconBackground,
        reminder_at: reminderEnabled ? new Date(date.getTime() - 10 * 60_000).toISOString() : null,
      });
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Your changes could not be saved. Please try again.');
    } finally {
      saving.current = false;
      setIsSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16), backgroundColor: colors.surface }]} accessibilityViewIsModal>
          <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}
            onContentSizeChange={() => { if (categoryExpanded.current) scroll.current?.scrollToEnd({ animated: true }); }}>
            <View style={styles.header}>
              <Text style={[styles.heading, { color: colors.text }]}>{initialSchedule ? 'Edit Schedule' : 'Add Schedule'}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close schedule form" disabled={isSaving} onPress={close} style={styles.close}>
                <Ionicons name="close" size={24} color={colors.muted} />
              </Pressable>
            </View>
            <Text style={[styles.label, { color: colors.text }]}>Activity</Text>
            <TextInput accessibilityLabel="Activity name" value={title} onChangeText={setTitle} maxLength={120}
              editable={!isSaving} placeholder="e.g. Gym, Office, Study" placeholderTextColor={colors.muted}
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]} />
            {visible ? <ScheduleDateTimeField value={date} onChange={setDate} disabled={isSaving}
              colors={appearance === 'schedule' ? scheduleColors : undefined}
              themeVariant={appearance === 'schedule' ? theme : 'light'} /> : null}
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: reminderEnabled }}
              onPress={() => setReminderEnabled((enabled) => !enabled)}
              style={styles.reminderToggle}
              disabled={isSaving}
            >
              <Ionicons
                name={reminderEnabled ? 'checkbox' : 'square-outline'}
                size={22}
                color={reminderEnabled ? colors.primary : colors.muted}
              />
              <View style={styles.reminderCopy}>
                <Text style={[styles.reminderTitle, { color: colors.text }]}>Remind me</Text>
                <Text style={[styles.reminderHint, { color: colors.muted }]}>10 minutes before</Text>
              </View>
            </Pressable>
            <Text style={[styles.label, { color: colors.text }]}>Notes (optional)</Text>
            <TextInput accessibilityLabel="Schedule notes" value={notes} onChangeText={setNotes} maxLength={1000}
              editable={!isSaving} multiline textAlignVertical="top" placeholder="Add any details..." placeholderTextColor={colors.muted}
              style={[styles.input, styles.notes, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]} />
            <Text style={[styles.count, { color: colors.muted }]}>{notes.length}/1000</Text>
            <Text style={[styles.label, { color: colors.text }]}>Category</Text>
            {visible ? <ScheduleCategoryField value={category} categories={categories} disabled={isSaving}
              onChange={setCategory} onCreate={onCreateCategory} onExpandedChange={(expanded) => { categoryExpanded.current = expanded; }} /> : null}
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error} Your entries have been kept.</Text> : null}
            <Pressable accessibilityRole="button" disabled={isSaving} onPress={() => void save()}
              style={[styles.save, { backgroundColor: colors.primary }, isSaving && styles.disabled]}>
              <Text style={[styles.saveText, appearance === 'schedule' && { color: scheduleColors.onPrimary }]}>{isSaving ? 'Saving...' : initialSchedule ? 'Save Changes' : 'Save Schedule'}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={isSaving} onPress={close} style={styles.cancel}><Text style={[styles.cancelText, { color: colors.muted }]}>Cancel</Text></Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end', alignItems: 'center' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 26, borderTopRightRadius: 26, maxHeight: '92%', width: '100%', maxWidth: 640 },
  content: { padding: 22 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  heading: { fontSize: 22, fontWeight: '700', color: '#111827' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#D9DEE8', borderRadius: 10, padding: 13, fontSize: 16, color: '#111827', marginBottom: 18 },
  notes: { minHeight: 90, marginBottom: 4 },
  count: { color: '#64748B', textAlign: 'right', fontSize: 11, marginBottom: 18 },
  reminderToggle: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, marginBottom: 16 },
  reminderCopy: { gap: 3 },
  reminderTitle: { fontSize: 14, fontWeight: '600' },
  reminderHint: { fontSize: 12 },
  error: { marginTop: 16, color: '#B91C1C', lineHeight: 20 },
  save: { backgroundColor: '#1769E0', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 24 },
  saveText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  cancel: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  cancelText: { color: '#64748B', fontSize: 14 },
});
