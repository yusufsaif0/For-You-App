import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Schedule } from '@/types/schedule';
import { useScheduleColors } from './schedule-theme';

interface Props {
  month: Date;
  selectedDate: Date;
  schedules: Schedule[];
  onMonthChange: (date: Date) => void;
  onSelectDate: (date: Date) => void;
}

const weekdays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const dateKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

export default function CalendarMonth({ month, selectedDate, schedules, onMonthChange, onSelectDate }: Props) {
  const colors = useScheduleColors();
  const firstWeekday = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const numberOfDays = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const numberOfWeeks = Math.ceil((firstWeekday + numberOfDays) / 7);
  const todayKey = dateKey(new Date());
  const selectedKey = dateKey(selectedDate);
  const counts = new Map<string, number>();

  schedules.forEach((schedule) => {
    const key = dateKey(new Date(schedule.starts_at));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  const shiftMonth = (amount: number) => onMonthChange(new Date(month.getFullYear(), month.getMonth() + amount, 1));

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.monthHeader}>
        <View style={styles.monthCopy}>
          <Text style={[styles.monthTitle, { color: colors.text }]}>{month.toLocaleDateString('en-IN', { month: 'long' })}</Text>
          <Text style={[styles.year, { color: colors.muted }]}>{month.getFullYear()}</Text>
        </View>
        <View style={styles.navigation}>
          <Pressable accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => shiftMonth(-1)}
            style={({ pressed }) => [styles.monthArrow, { backgroundColor: pressed ? colors.primarySoft : colors.surfaceAlt }]}>
            <Ionicons name="chevron-back" size={18} color={colors.text} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Next month" onPress={() => shiftMonth(1)}
            style={({ pressed }) => [styles.monthArrow, { backgroundColor: pressed ? colors.primarySoft : colors.surfaceAlt }]}>
            <Ionicons name="chevron-forward" size={18} color={colors.text} />
          </Pressable>
        </View>
      </View>
      <View style={styles.grid}>
        {weekdays.map((day, index) => (
          <View key={`${day}-${index}`} style={styles.weekdayCell}>
            <Text style={[styles.weekday, { color: colors.muted }]}>{day}</Text>
          </View>
        ))}
        {Array.from({ length: numberOfWeeks * 7 }, (_, index) => {
          const dayNumber = index - firstWeekday + 1;
          if (dayNumber < 1 || dayNumber > numberOfDays) return <View key={`blank-${index}`} style={styles.cell} />;
          const date = new Date(month.getFullYear(), month.getMonth(), dayNumber);
          const key = dateKey(date);
          const selected = key === selectedKey;
          const today = key === todayKey;
          const count = counts.get(key) ?? 0;
          return (
            <Pressable key={key} accessibilityRole="button"
              accessibilityLabel={`${date.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}${today ? ', today' : ''}${count ? `, ${count} scheduled ${count === 1 ? 'activity' : 'activities'}` : ''}`}
              accessibilityState={{ selected }} onPress={() => onSelectDate(date)}
              style={({ pressed }) => [styles.cell, pressed && { backgroundColor: colors.surfaceAlt, borderRadius: 12 }]}>
              <View style={[styles.dayCircle, today && { borderColor: colors.primary }, selected && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                <Text style={[styles.dayNumber, { color: selected ? colors.onPrimary : today ? colors.primary : colors.text }, (selected || today) && styles.emphasizedDay]}>{dayNumber}</Text>
              </View>
              <View style={[styles.marker, { backgroundColor: count ? colors.primary : 'transparent' }]} />
            </Pressable>
          );
        })}
      </View>
      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <View style={styles.legend}>
          <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
          <Text style={[styles.legendText, { color: colors.muted }]}>Activity planned</Text>
        </View>
        <View style={styles.legend}>
          <View style={[styles.todayRing, { borderColor: colors.primary }]} />
          <Text style={[styles.legendText, { color: colors.muted }]}>Today</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 24, padding: 16 },
  monthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 8 },
  monthCopy: { flex: 1, flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 8 },
  monthTitle: { fontSize: 21, fontWeight: '600', letterSpacing: -0.5 },
  year: { fontSize: 15 },
  navigation: { flexDirection: 'row', gap: 4 },
  monthArrow: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekdayCell: { width: `${100 / 7}%`, alignItems: 'center', paddingBottom: 10 },
  weekday: { fontSize: 11, fontWeight: '600' },
  cell: { width: `${100 / 7}%`, minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingVertical: 2 },
  dayCircle: { width: 34, minHeight: 34, borderRadius: 17, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  dayNumber: { fontSize: 13, fontWeight: '500' },
  emphasizedDay: { fontWeight: '700' },
  marker: { width: 4, height: 4, borderRadius: 2, marginTop: 3 },
  footer: { flexDirection: 'row', flexWrap: 'wrap', gap: 20, borderTopWidth: 1, marginTop: 12, paddingTop: 14 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  legendDot: { width: 5, height: 5, borderRadius: 3 },
  todayRing: { width: 10, height: 10, borderWidth: 1, borderRadius: 5 },
  legendText: { fontSize: 11 },
});
