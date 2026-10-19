import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { getScheduleCategoryStyle } from '@/types/schedule';
import { categoryKey, normalizeCategoryName } from '@/utils/scheduleCategories';
import { useScheduleColors } from './schedule-theme';

interface Props {
  value: string;
  categories: string[];
  disabled: boolean;
  onChange: (value: string) => void;
  onCreate: (name: string) => Promise<string>;
  onExpandedChange: (expanded: boolean) => void;
}

export default function ScheduleCategoryField({ value, categories, disabled, onChange, onCreate, onExpandedChange }: Props) {
  const colors = useScheduleColors();
  const [expanded, setExpanded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const icon = getScheduleCategoryStyle(value).icon as keyof typeof Ionicons.glyphMap;
  const expand = (next: boolean) => { setExpanded(next); onExpandedChange(next); };
  const close = () => { if (!saving.current) setAdding(false); };
  const save = async () => {
    if (saving.current) return;
    const normalized = normalizeCategoryName(name);
    if (!normalized || normalized.length > 60) {
      setError('Enter a category name between 1 and 60 characters.');
      return;
    }
    const existing = categories.find((item) => categoryKey(item) === categoryKey(normalized));
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      const selected = existing ?? await onCreate(normalized);
      onChange(selected);
      setAdding(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Category was not saved. Please try again.');
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };

  return <View>
    <Pressable accessibilityRole="button" accessibilityLabel="Schedule category" accessibilityValue={{ text: value }}
      accessibilityState={{ expanded, disabled }} disabled={disabled} onPress={() => expand(!expanded)}
      style={[styles.trigger, { borderColor: expanded ? colors.primary : colors.border, backgroundColor: colors.background }]}>
      <Ionicons name={icon} size={19} color={colors.primary} />
      <Text style={[styles.value, { color: colors.text }]}>{value}</Text>
      <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={17} color={colors.muted} />
    </Pressable>
    {expanded ? <View style={[styles.menu, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={styles.options} accessibilityRole="radiogroup" accessibilityLabel="Categories">
        {categories.map((item) => {
          const selected = categoryKey(value) === categoryKey(item);
          return <Pressable key={categoryKey(item)} accessibilityRole="radio" accessibilityLabel={item}
            accessibilityState={{ checked: selected }} aria-checked={selected} disabled={disabled}
            onPress={() => { onChange(item); expand(false); }}
            style={({ pressed }) => [styles.option, { backgroundColor: selected || pressed ? colors.primarySoft : colors.surface }]}>
            <Ionicons name={getScheduleCategoryStyle(item).icon as keyof typeof Ionicons.glyphMap} size={18} color={selected ? colors.primary : colors.muted} />
            <Text style={[styles.optionText, { color: selected ? colors.primary : colors.text }]}>{item}</Text>
            {selected ? <Ionicons name="checkmark" size={18} color={colors.primary} /> : null}
          </Pressable>;
        })}
      </ScrollView>
      <Pressable accessibilityRole="button" accessibilityLabel="Other, add a new category" disabled={disabled}
        onPress={() => { expand(false); setName(''); setError(''); setAdding(true); }}
        style={({ pressed }) => [styles.other, { borderTopColor: colors.border, backgroundColor: pressed ? colors.primarySoft : colors.surface }]}>
        <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
        <View style={styles.optionText}>
          <Text style={[styles.otherTitle, { color: colors.primary }]}>Other</Text>
          <Text style={[styles.hint, { color: colors.muted }]}>Add a new category</Text>
        </View>
      </Pressable>
    </View> : null}
    <Modal visible={adding} transparent animationType="fade" onRequestClose={close}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View accessibilityViewIsModal style={[styles.dialog, { backgroundColor: colors.surface }]}>
          <View style={styles.dialogHeader}>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>Add category</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close new category" disabled={busy} onPress={close} style={styles.close}>
              <Ionicons name="close" size={21} color={colors.muted} />
            </Pressable>
          </View>
          <Text style={[styles.description, { color: colors.muted }]}>Save a category to use for your activities.</Text>
          <TextInput accessibilityLabel="New category name" autoFocus value={name} maxLength={60} editable={!busy}
            onChangeText={(value) => { setName(value); setError(''); }} placeholder="e.g. Family, Travel, Personal"
            placeholderTextColor={colors.muted} returnKeyType="done" onSubmitEditing={() => void save()}
            style={[styles.input, { backgroundColor: colors.background, borderColor: error ? colors.red : colors.border, color: colors.text }]} />
          {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.red }]}>{error}</Text> : null}
          <View style={styles.dialogActions}>
            <Pressable accessibilityRole="button" disabled={busy} onPress={close} style={styles.cancel}>
              <Text style={[styles.buttonText, { color: colors.muted }]}>Cancel</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Save category" disabled={busy} onPress={() => void save()}
              style={[styles.save, { backgroundColor: colors.primary }, busy && styles.disabled]}>
              {busy ? <ActivityIndicator size="small" color={colors.onPrimary} /> : null}
              <Text style={[styles.buttonText, { color: colors.onPrimary }]}>{busy ? 'Saving...' : 'Save category'}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  trigger: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  value: { flex: 1, fontSize: 15 },
  menu: { borderWidth: 1, borderRadius: 14, marginTop: 8, overflow: 'hidden' },
  options: { maxHeight: 220 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingHorizontal: 16, paddingVertical: 12 },
  optionText: { flex: 1, fontSize: 14 },
  other: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 66, borderTopWidth: 1, paddingHorizontal: 16, paddingVertical: 12 },
  otherTitle: { fontSize: 14, fontWeight: '600' },
  hint: { fontSize: 12, marginTop: 3 },
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.6)' },
  dialog: { width: '100%', maxWidth: 400, borderRadius: 24, padding: 24 },
  dialogHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 21, fontWeight: '600' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  description: { fontSize: 13, lineHeight: 20, marginTop: 4, marginBottom: 20 },
  input: { minHeight: 52, borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 16 },
  error: { fontSize: 13, lineHeight: 19, marginTop: 12 },
  dialogActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8, marginTop: 24 },
  cancel: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14 },
  save: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 18, borderRadius: 22 },
  buttonText: { fontSize: 13, fontWeight: '600' },
  disabled: { opacity: 0.5 },
});
