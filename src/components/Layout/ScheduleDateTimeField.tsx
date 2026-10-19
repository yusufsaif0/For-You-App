import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { localDateInput, localTimeInput, mergeDatePart, mergeTimePart } from '@/utils/scheduleDates';

interface FieldColors {
  surface: string;
  text: string;
  border: string;
}

export default function ScheduleDateTimeField({ value, onChange, disabled, colors, themeVariant = 'light' }: {
  value: Date; onChange: (date: Date) => void; disabled: boolean;
  colors?: FieldColors;
  themeVariant?: 'light' | 'dark';
}) {
  const [mode, setMode] = useState<'date' | 'time' | null>(null);
  const labelColor = colors && { color: colors.text };
  const pickerColors = colors && { backgroundColor: colors.surface, borderColor: colors.border };
  const inputStyle = colors ? { ...webInput, color: colors.text, background: colors.surface, borderColor: colors.border, colorScheme: themeVariant } : webInput;
  if (Platform.OS === 'web') {
    return (
      <View style={styles.fields}>
        <Text style={[styles.label, labelColor]}>Date</Text>
        <input aria-label="Schedule date" type="date" value={localDateInput(value)} disabled={disabled}
          style={inputStyle} onChange={(event) => {
            const parts = event.target.value.split('-').map(Number);
            if (parts.length === 3 && parts.every(Number.isFinite) && parts[0] > 0) {
              onChange(mergeDatePart(value, new Date(parts[0], parts[1] - 1, parts[2])));
            }
          }} />
        <Text style={[styles.label, labelColor]}>Time</Text>
        <input aria-label="Schedule time" type="time" value={localTimeInput(value)} disabled={disabled}
          style={inputStyle} onChange={(event) => {
            const parts = event.target.value.split(':').map(Number);
            if (parts.length === 2 && parts.every(Number.isFinite)) {
              const picked = new Date(value);
              picked.setHours(parts[0], parts[1], 0, 0);
              onChange(mergeTimePart(value, picked));
            }
          }} />
      </View>
    );
  }
  return (
    <View style={styles.fields}>
      <Text style={[styles.label, labelColor]}>Date</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Change schedule date" style={[styles.picker, pickerColors]} disabled={disabled} onPress={() => setMode('date')}>
        <Text style={[styles.value, labelColor]}>{value.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</Text>
      </Pressable>
      <Text style={[styles.label, labelColor]}>Time</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Change schedule time" style={[styles.picker, pickerColors]} disabled={disabled} onPress={() => setMode('time')}>
        <Text style={[styles.value, labelColor]}>{value.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}</Text>
      </Pressable>
      {mode ? <DateTimePicker value={value} mode={mode} themeVariant={themeVariant} display={Platform.OS === 'ios' ? 'spinner' : 'default'}
        onChange={(event, picked) => {
          if (Platform.OS !== 'ios' || event.type === 'dismissed') setMode(null);
          if (event.type !== 'dismissed' && picked) {
            onChange(mode === 'date' ? mergeDatePart(value, picked) : mergeTimePart(value, picked));
          }
        }} /> : null}
      {mode && Platform.OS === 'ios' ? <Pressable accessibilityRole="button" onPress={() => setMode(null)} style={[styles.picker, pickerColors]}><Text style={[styles.value, labelColor]}>Done</Text></Pressable> : null}
    </View>
  );
}

const webInput = { padding: 12, border: '1px solid #D9DEE8', borderRadius: 10, fontSize: 16, background: '#FFFFFF', color: '#17283D', fontFamily: 'inherit' };
const styles = StyleSheet.create({
  fields: { gap: 8, marginBottom: 18 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151' },
  value: { color: '#17283D' },
  picker: { padding: 14, minHeight: 48, borderWidth: 1, borderColor: '#D9DEE8', borderRadius: 10, marginBottom: 8 },
});
