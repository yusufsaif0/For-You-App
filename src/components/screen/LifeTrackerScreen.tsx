import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useFocusEffect, router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable,
  RefreshControl, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createLifeItem, deleteLifeItem, getLifeItems, updateLifeItem } from '@/services/api/life-items';
import { syncReminderNotifications } from '@/services/notifications/reminders';
import { useAppTheme } from '@/state/ThemeProvider';
import type { LifeItem, LifeItemInput, LifeItemKind, MealType, TaskPriority } from '@/types/life-item';
import { mergeDatePart, mergeTimePart } from '@/utils/scheduleDates';

const featureConfig = {
  meal: { title: 'Meals & calories', subtitle: 'A mindful look at what fuels you', icon: 'nutrition-outline', accent: '#F08A55', add: 'Log a meal' },
  weight: { title: 'Weight journey', subtitle: 'Small steps, steady progress', icon: 'scale-outline', accent: '#D96A96', add: 'Log weight' },
  task: { title: 'Office tasks', subtitle: 'Focus on what moves work forward', icon: 'briefcase-outline', accent: '#3C9C88', add: 'Add a task' },
  event: { title: 'Upcoming events', subtitle: 'Make time for what matters', icon: 'sparkles-outline', accent: '#685CF6', add: 'Add an event' },
} as const satisfies Record<LifeItemKind, { title: string; subtitle: string; icon: keyof typeof Ionicons.glyphMap; accent: string; add: string }>;

const mealTypes: MealType[] = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
const priorities: TaskPriority[] = ['Low', 'Medium', 'High'];

interface Props {
  kind: LifeItemKind;
}

const inputDate = (item: LifeItem | null, kind: LifeItemKind) => {
  const value = kind === 'meal' || kind === 'weight' ? item?.occurred_at
    : kind === 'task' ? item?.due_at : item?.starts_at;
  return value ? new Date(value) : new Date(Date.now() + (kind === 'task' || kind === 'event' ? 60 * 60_000 : 0));
};

function displayDate(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return date.toLocaleString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  });
}

export default function LifeTrackerScreen({ kind }: Props) {
  const { colors } = useAppTheme();
  const config = featureConfig[kind];
  const [items, setItems] = useState<LifeItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<LifeItem | null>(null);
  const [title, setTitle] = useState('');
  const [calories, setCalories] = useState('');
  const [sugar, setSugar] = useState('');
  const [fat, setFat] = useState('');
  const [weight, setWeight] = useState('');
  const [notes, setNotes] = useState('');
  const [mealType, setMealType] = useState<MealType>('Breakfast');
  const [priority, setPriority] = useState<TaskPriority>('Medium');
  const [date, setDate] = useState(() => inputDate(null, kind));
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [picker, setPicker] = useState<'date' | 'time' | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [busyId, setBusyId] = useState('');
  const reminderNoticeShown = useRef(false);

  const load = useCallback(async (quiet = false) => {
    if (quiet) setIsRefreshing(true);
    else setIsLoading(true);
    try {
      const result = await getLifeItems(kind);
      setItems(result);
      setError('');
      setHasLoaded(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to load your information.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [kind]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  useEffect(() => {
    if (!hasLoaded || (kind !== 'task' && kind !== 'event')) return;
    syncReminderNotifications(kind, items).then((enabled) => {
      if (!enabled && !reminderNoticeShown.current) {
        reminderNoticeShown.current = true;
        Alert.alert(
          'Notifications are disabled',
          'Your item is saved, but this device will not send its reminder. Allow notifications for Daily Life in Android settings.',
        );
      }
    }).catch((failure: unknown) => {
      console.error(`Unable to update ${kind} reminders:`, failure);
      if (!reminderNoticeShown.current) {
        reminderNoticeShown.current = true;
        Alert.alert('Reminder could not be scheduled', 'Your item is saved, but its notification could not be set. Check notification settings and try again.');
      }
    });
  }, [hasLoaded, items, kind]);

  const todayCalories = useMemo(() => {
    if (kind !== 'meal') return 0;
    const today = new Date().toDateString();
    return items.reduce((total, item) =>
      item.occurred_at && new Date(item.occurred_at).toDateString() === today ? total + (item.calories ?? 0) : total, 0);
  }, [items, kind]);
  const today = new Date().toDateString();
  const todayTasks = items.filter((item) => item.due_at && new Date(item.due_at).toDateString() === today);
  const completedTasks = todayTasks.filter((item) => item.completed).length;
  const visibleItems = kind === 'event'
    ? items.filter((item) => item.starts_at && new Date(item.starts_at).getTime() >= new Date().setHours(0, 0, 0, 0))
    : items;
  const latestWeight = kind === 'weight' ? [...items].sort((a, b) =>
    (b.occurred_at ?? '').localeCompare(a.occurred_at ?? '')) : [];
  const currentWeight = latestWeight[0]?.weight_kg;
  const weightChange = currentWeight != null && latestWeight[1]?.weight_kg != null
    ? currentWeight - latestWeight[1].weight_kg : undefined;
  const openForm = (item: LifeItem | null = null) => {
    setEditing(item);
    setTitle(item?.title ?? '');
    setCalories(item?.calories === undefined || item.calories === null ? '' : String(item.calories));
    setSugar(item?.sugar_g === undefined || item.sugar_g === null ? '' : String(item.sugar_g));
    setFat(item?.fat_g === undefined || item.fat_g === null ? '' : String(item.fat_g));
    setWeight(item?.weight_kg === undefined || item.weight_kg === null ? '' : String(item.weight_kg));
    setNotes(item?.notes ?? '');
    setMealType(item?.meal_type ?? 'Breakfast');
    setPriority(item?.priority ?? 'Medium');
    setDate(inputDate(item, kind));
    setReminderEnabled(!!item?.reminder_at);
    setFormOpen(true);
  };

  const save = async () => {
    const cleanTitle = kind === 'weight' ? 'Weight check-in' : title.trim();
    if (kind !== 'weight' && !cleanTitle) {
      Alert.alert('Add a name', 'Enter a name before saving.');
      return;
    }
    const parsedCalories = Number(calories);
    const parsedSugar = sugar.trim() ? Number(sugar) : null;
    const parsedFat = fat.trim() ? Number(fat) : null;
    const parsedWeight = Number(weight);
    if (kind === 'meal' && (!calories.trim() || !Number.isInteger(parsedCalories) || parsedCalories < 0 || parsedCalories > 10000)) {
      Alert.alert('Check the calories', 'Enter a whole number from 0 to 10,000.');
      return;
    }
    if (kind === 'meal' && [parsedSugar, parsedFat].some((value) => value !== null && (!Number.isFinite(value) || value < 0 || value > 1000))) {
      Alert.alert('Check the nutrition values', 'Sugar and fat must be from 0 to 1,000 grams.');
      return;
    }
    if (kind === 'weight' && (!Number.isFinite(parsedWeight) || parsedWeight <= 0 || parsedWeight > 1000)) {
      Alert.alert('Check the weight', 'Enter a weight greater than 0 and no more than 1,000 kg.');
      return;
    }
    if ((kind === 'task' || kind === 'event') && reminderEnabled && date.getTime() - 10 * 60_000 <= Date.now()) {
      Alert.alert('Choose a later time', 'A reminder needs to be at least 10 minutes before the task or event.');
      return;
    }
    const common: LifeItemInput = {
      kind,
      title: cleanTitle,
      notes: notes.trim() || null,
      completed: editing?.completed ?? false,
      ...(kind === 'meal' ? {
        occurred_at: date.toISOString(), calories: parsedCalories, sugar_g: parsedSugar, fat_g: parsedFat, meal_type: mealType,
      } : {}),
      ...(kind === 'weight' ? { occurred_at: date.toISOString(), weight_kg: parsedWeight } : {}),
      ...(kind === 'task' ? {
        due_at: date.toISOString(), priority,
        reminder_at: reminderEnabled ? new Date(date.getTime() - 10 * 60_000).toISOString() : null,
      } : {}),
      ...(kind === 'event' ? {
        starts_at: date.toISOString(),
        reminder_at: reminderEnabled ? new Date(date.getTime() - 10 * 60_000).toISOString() : null,
      } : {}),
    };

    setIsSaving(true);
    try {
      if (editing) {
        const { kind: inputKind, ...changes } = common;
        if (inputKind !== kind) throw new Error('The entry type changed. Close and reopen the form.');
        await updateLifeItem(editing.id, changes);
      }
      else await createLifeItem(common);
      setFormOpen(false);
      await load(true);
    } catch (failure) {
      Alert.alert('Could not save', failure instanceof Error ? failure.message : 'Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const remove = (item: LifeItem) => Alert.alert(
    'Delete this entry?',
    `“${item.title}” will be permanently removed.`,
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: () => {
          setBusyId(item.id);
          deleteLifeItem(item.id).then(() => load(true)).catch((failure: unknown) => {
            Alert.alert('Could not delete', failure instanceof Error ? failure.message : 'Please try again.');
          }).finally(() => setBusyId(''));
        },
      },
    ],
  );

  const toggleTask = async (item: LifeItem) => {
    setBusyId(item.id);
    try {
      await updateLifeItem(item.id, { completed: !item.completed });
      await load(true);
    } catch (failure) {
      Alert.alert('Could not update task', failure instanceof Error ? failure.message : 'Please try again.');
    } finally {
      setBusyId('');
    }
  };

  const handleDateTime = (event: DateTimePickerEvent, picked?: Date) => {
    if (Platform.OS !== 'ios') setPicker(null);
    if (!picked || event.type === 'dismissed') return;
    setDate((current) => picker === 'date' ? mergeDatePart(current, picked) : mergeTimePart(current, picked));
  };

  const primaryDate = (item: LifeItem) => kind === 'meal' || kind === 'weight' ? item.occurred_at
    : kind === 'task' ? item.due_at : item.starts_at;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={styles.back}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={[styles.heading, { color: colors.text }]}>{config.title}</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>{config.subtitle}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={config.add} onPress={() => openForm()} style={[styles.addButton, { backgroundColor: colors.primary }]}>
          <Ionicons name="add" size={23} color="#FFFFFF" />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void load(true)} tintColor={colors.primary} />}
      >
        {kind === 'meal' ? (
          <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.summaryIcon, { backgroundColor: `${config.accent}20` }]}>
              <Ionicons name="flame-outline" size={23} color={config.accent} />
            </View>
            <View>
              <Text style={[styles.summaryLabel, { color: colors.muted }]}>TODAY&apos;S CALORIES</Text>
              <Text style={[styles.summaryValue, { color: colors.text }]}>{todayCalories.toLocaleString()} <Text style={styles.unit}>kcal</Text></Text>
            </View>
            <Text style={[styles.summaryCount, { color: colors.muted }]}>{items.filter((item) => item.occurred_at && new Date(item.occurred_at).toDateString() === new Date().toDateString()).length} meals</Text>
          </View>
        ) : null}
        {kind === 'weight' ? (
          <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.summaryIcon, { backgroundColor: `${config.accent}20` }]}>
              <Ionicons name="scale-outline" size={23} color={config.accent} />
            </View>
            <View>
              <Text style={[styles.summaryLabel, { color: colors.muted }]}>LATEST CHECK-IN</Text>
              <Text style={[styles.summaryValue, { color: colors.text }]}>{currentWeight != null ? `${currentWeight} kg` : '—'}</Text>
            </View>
            {weightChange !== undefined ? (
              <Text style={[styles.summaryCount, { color: weightChange <= 0 ? colors.green : config.accent }]}>
                {weightChange > 0 ? '+' : ''}{weightChange.toFixed(1)} kg
              </Text>
            ) : null}
          </View>
        ) : null}
        {kind === 'task' && todayTasks.length ? (
          <View style={[styles.taskProgress, { backgroundColor: colors.surfaceAlt }]}>
            <Text style={[styles.summaryLabel, { color: colors.muted }]}>TODAY&apos;S PROGRESS</Text>
            <Text style={[styles.taskProgressText, { color: colors.text }]}>{completedTasks} of {todayTasks.length} tasks completed</Text>
          </View>
        ) : null}
        {error ? (
          <View style={[styles.errorBox, { backgroundColor: colors.surface }]}>
            <Text accessibilityRole="alert" style={[styles.errorText, { color: colors.red }]}>{error}</Text>
            <Pressable accessibilityRole="button" onPress={() => void load(true)} style={styles.retry}>
              <Text style={[styles.actionLink, { color: colors.primary }]}>Retry</Text>
            </Pressable>
          </View>
        ) : null}
        {isLoading ? <ActivityIndicator size="large" color={colors.primary} style={styles.loader} /> : null}
        {!isLoading && !error && visibleItems.length === 0 ? (
          <View style={styles.empty}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.surfaceAlt }]}>
              <Ionicons name={config.icon} size={34} color={config.accent} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>A fresh start</Text>
            <Text style={[styles.emptyText, { color: colors.muted }]}>{emptyCopy[kind]}</Text>
            <Pressable accessibilityRole="button" onPress={() => openForm()} style={[styles.emptyButton, { backgroundColor: colors.primary }]}>
              <Text style={styles.emptyButtonText}>{config.add}</Text>
            </Pressable>
          </View>
        ) : null}
        {visibleItems.map((item) => (
          <View key={item.id} style={[styles.itemCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.itemIcon, { backgroundColor: `${config.accent}20` }]}>
              <Ionicons name={config.icon} size={20} color={config.accent} />
            </View>
            <View style={styles.itemCopy}>
              <View style={styles.itemTitleRow}>
                {kind === 'task' ? (
                  <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: item.completed }} disabled={busyId === item.id}
                    onPress={() => void toggleTask(item)} style={styles.check}>
                    <Ionicons name={item.completed ? 'checkmark-circle' : 'ellipse-outline'} size={21} color={item.completed ? colors.green : colors.muted} />
                  </Pressable>
                ) : null}
                <Text numberOfLines={1} style={[styles.itemTitle, { color: colors.text }, item.completed && { textDecorationLine: 'line-through', color: colors.muted }]}>
                  {item.title}
                </Text>
              </View>
              <Text style={[styles.itemDetail, { color: colors.muted }]}>
                {kind === 'meal' ? `${item.meal_type ?? 'Meal'} · ${item.calories ?? 0} kcal${item.sugar_g != null ? ` · ${item.sugar_g} g sugar` : ''}${item.fat_g != null ? ` · ${item.fat_g} g fat` : ''} · ${displayDate(primaryDate(item))}`
                  : kind === 'weight' ? `${item.weight_kg} kg · ${displayDate(primaryDate(item))}`
                    : `${displayDate(primaryDate(item))}${item.reminder_at ? ' · reminder set' : ''}`}
              </Text>
              {kind === 'task' && item.priority ? (
                <Text style={[styles.priority, { color: item.priority === 'High' ? colors.red : item.priority === 'Medium' ? config.accent : colors.muted }]}>
                  {item.priority} priority
                </Text>
              ) : null}
              {item.notes ? <Text style={[styles.notes, { color: colors.muted }]}>{item.notes}</Text> : null}
            </View>
            <View style={styles.itemActions}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${item.title}`} onPress={() => openForm(item)} hitSlop={8}>
                <Ionicons name="create-outline" size={18} color={colors.primary} />
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${item.title}`} disabled={busyId === item.id} onPress={() => remove(item)} hitSlop={8}>
                <Ionicons name="trash-outline" size={18} color={colors.red} />
              </Pressable>
            </View>
          </View>
        ))}
      </ScrollView>

      <Modal visible={formOpen} transparent animationType="slide" onRequestClose={() => !isSaving && setFormOpen(false)}>
        <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.formContent}>
              <View style={styles.formHeader}>
                <View>
                  <Text style={[styles.formTitle, { color: colors.text }]}>{editing ? `Edit ${singular[kind]}` : config.add}</Text>
                  <Text style={[styles.formSubtitle, { color: colors.muted }]}>{formDescription[kind]}</Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Close form" onPress={() => setFormOpen(false)} disabled={isSaving} style={styles.close}>
                  <Ionicons name="close" size={23} color={colors.muted} />
                </Pressable>
              </View>
              {kind !== 'weight' ? (
                <TextInput
                  accessibilityLabel={kind === 'meal' ? 'Meal name' : kind === 'task' ? 'Task name' : 'Event name'}
                  value={title}
                  onChangeText={setTitle}
                  placeholder={placeholders[kind]}
                  placeholderTextColor={colors.muted}
                  maxLength={120}
                  style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]}
                />
              ) : null}
              {kind === 'meal' ? (
                <>
                  <Text style={[styles.fieldLabel, { color: colors.text }]}>Meal type</Text>
                  <View style={styles.chips}>
                    {mealTypes.map((item) => (
                      <Pressable key={item} onPress={() => setMealType(item)} style={[
                        styles.chip, { borderColor: colors.border }, mealType === item && { backgroundColor: colors.primarySoft, borderColor: colors.primary },
                      ]}>
                        <Text style={[styles.chipText, { color: mealType === item ? colors.primary : colors.muted }]}>{item}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <Text style={[styles.fieldLabel, { color: colors.text }]}>Calories</Text>
                  <TextInput accessibilityLabel="Calories" value={calories} onChangeText={setCalories} keyboardType="number-pad"
                    placeholder="e.g. 450" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]} />
                  <View style={styles.macroFields}>
                    <View style={styles.macroField}>
                      <Text style={[styles.fieldLabel, { color: colors.text }]}>Sugar (g)</Text>
                      <TextInput accessibilityLabel="Sugar in grams" value={sugar} onChangeText={setSugar} keyboardType="decimal-pad"
                        placeholder="Optional" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]} />
                    </View>
                    <View style={styles.macroField}>
                      <Text style={[styles.fieldLabel, { color: colors.text }]}>Fat (g)</Text>
                      <TextInput accessibilityLabel="Fat in grams" value={fat} onChangeText={setFat} keyboardType="decimal-pad"
                        placeholder="Optional" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]} />
                    </View>
                  </View>
                </>
              ) : null}
              {kind === 'weight' ? (
                <>
                  <Text style={[styles.fieldLabel, { color: colors.text }]}>Weight (kg)</Text>
                  <TextInput accessibilityLabel="Weight in kilograms" value={weight} onChangeText={setWeight} keyboardType="decimal-pad"
                    placeholder="e.g. 68.5" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]} />
                </>
              ) : null}
              {kind === 'task' ? (
                <>
                  <Text style={[styles.fieldLabel, { color: colors.text }]}>Priority</Text>
                  <View style={styles.chips}>
                    {priorities.map((item) => (
                      <Pressable key={item} onPress={() => setPriority(item)} style={[
                        styles.chip, { borderColor: colors.border }, priority === item && { backgroundColor: colors.primarySoft, borderColor: colors.primary },
                      ]}>
                        <Text style={[styles.chipText, { color: priority === item ? colors.primary : colors.muted }]}>{item}</Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : null}
              {(kind === 'meal' || kind === 'weight' || kind === 'task' || kind === 'event') ? (
                <>
                  <Text style={[styles.fieldLabel, { color: colors.text }]}>{dateLabel[kind]}</Text>
                  <View style={styles.dateButtons}>
                    <Pressable accessibilityRole="button" onPress={() => setPicker('date')} style={[styles.dateButton, { backgroundColor: colors.background, borderColor: colors.border }]}>
                      <Ionicons name="calendar-outline" size={16} color={colors.primary} />
                      <Text style={[styles.dateButtonText, { color: colors.text }]}>{date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" onPress={() => setPicker('time')} style={[styles.dateButton, { backgroundColor: colors.background, borderColor: colors.border }]}>
                      <Ionicons name="time-outline" size={16} color={colors.primary} />
                      <Text style={[styles.dateButtonText, { color: colors.text }]}>{date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</Text>
                    </Pressable>
                  </View>
                  {picker ? (
                    <DateTimePicker
                      value={date}
                      mode={picker}
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      onChange={handleDateTime}
                    />
                  ) : null}
                </>
              ) : null}
              {kind === 'task' || kind === 'event' ? (
                <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: reminderEnabled }}
                  onPress={() => setReminderEnabled((enabled) => !enabled)} style={styles.reminderRow}>
                  <Ionicons name={reminderEnabled ? 'checkbox' : 'square-outline'} size={22} color={reminderEnabled ? colors.primary : colors.muted} />
                  <View>
                    <Text style={[styles.reminderTitle, { color: colors.text }]}>Remind me</Text>
                    <Text style={[styles.formSubtitle, { color: colors.muted }]}>10 minutes before</Text>
                  </View>
                </Pressable>
              ) : null}
              <Text style={[styles.fieldLabel, { color: colors.text }]}>Notes (optional)</Text>
              <TextInput accessibilityLabel="Notes" value={notes} onChangeText={setNotes} multiline maxLength={1000}
                placeholder="Add a note..." placeholderTextColor={colors.muted}
                style={[styles.input, styles.notesInput, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]} />
              <Pressable accessibilityRole="button" disabled={isSaving} onPress={() => void save()} style={[styles.saveButton, { backgroundColor: colors.primary }, isSaving && styles.disabled]}>
                <Text style={styles.saveText}>{isSaving ? 'Saving…' : editing ? 'Save changes' : config.add}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" disabled={isSaving} onPress={() => setFormOpen(false)} style={styles.cancelButton}>
                <Text style={[styles.cancelText, { color: colors.muted }]}>Cancel</Text>
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const emptyCopy: Record<LifeItemKind, string> = {
  meal: 'Log meals to see how many calories you take in each day.',
  weight: 'Add check-ins over time to follow your weight trend.',
  task: 'Capture work tasks, set priorities, and keep your day moving.',
  event: 'Save an upcoming event and get a reminder before it begins.',
};
const singular: Record<LifeItemKind, string> = { meal: 'meal', weight: 'weight entry', task: 'task', event: 'event' };
const formDescription: Record<LifeItemKind, string> = {
  meal: 'Record what you ate and its calories.',
  weight: 'Add a simple progress check-in.',
  task: 'Give the next action a time and priority.',
  event: 'Save the date so it does not slip by.',
};
const placeholders: Partial<Record<LifeItemKind, string>> = {
  meal: 'What did you eat?',
  task: 'What needs to get done?',
  event: 'What is coming up?',
};
const dateLabel: Record<LifeItemKind, string> = {
  meal: 'When did you eat?',
  weight: 'When was this check-in?',
  task: 'Due date',
  event: 'Event date',
};

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 17, paddingTop: 8, paddingBottom: 15 },
  back: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1 },
  heading: { fontSize: 21, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { fontSize: 11, marginTop: 3 },
  addButton: { width: 43, height: 43, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 18, paddingBottom: 35, flexGrow: 1 },
  summaryCard: { minHeight: 80, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 20, padding: 14, marginBottom: 14 },
  summaryIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  summaryLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  summaryValue: { fontSize: 22, fontWeight: '800', marginTop: 3 },
  unit: { fontSize: 13, fontWeight: '600' },
  summaryCount: { marginLeft: 'auto', fontSize: 11, fontWeight: '700' },
  taskProgress: { padding: 14, borderRadius: 16, marginBottom: 12 },
  taskProgressText: { fontSize: 13, fontWeight: '700', marginTop: 5 },
  errorBox: { padding: 14, borderRadius: 16, marginBottom: 12 },
  errorText: { fontSize: 13, lineHeight: 19 },
  retry: { minHeight: 40, justifyContent: 'center' },
  actionLink: { fontSize: 13, fontWeight: '700' },
  loader: { marginTop: 35 },
  empty: { alignItems: 'center', paddingHorizontal: 18, marginTop: 60 },
  emptyIcon: { width: 72, height: 72, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '800', marginTop: 16 },
  emptyText: { fontSize: 13, lineHeight: 20, textAlign: 'center', maxWidth: 280, marginTop: 7 },
  emptyButton: { paddingHorizontal: 17, minHeight: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 19 },
  emptyButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  itemCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderWidth: 1, borderRadius: 18, padding: 13, marginBottom: 10 },
  itemIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  itemCopy: { flex: 1, paddingTop: 1 },
  itemTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  check: { minWidth: 25, minHeight: 28, alignItems: 'center', justifyContent: 'center' },
  itemTitle: { flex: 1, fontSize: 14, fontWeight: '700' },
  itemDetail: { fontSize: 10, lineHeight: 16, marginTop: 4 },
  priority: { fontSize: 10, fontWeight: '700', marginTop: 4 },
  notes: { fontSize: 11, lineHeight: 17, marginTop: 5 },
  itemActions: { flexDirection: 'row', gap: 13, paddingTop: 2 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.48)', justifyContent: 'flex-end', alignItems: 'center' },
  sheet: { width: '100%', maxWidth: 600, maxHeight: '94%', borderTopLeftRadius: 27, borderTopRightRadius: 27, overflow: 'hidden' },
  formContent: { padding: 21, paddingBottom: 32 },
  formHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  formTitle: { fontSize: 21, fontWeight: '800' },
  formSubtitle: { fontSize: 11, marginTop: 4 },
  close: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  input: { borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, paddingVertical: 12, fontSize: 15, marginBottom: 15 },
  macroFields: { flexDirection: 'row', gap: 10 },
  macroField: { flex: 1 },
  fieldLabel: { fontSize: 12, fontWeight: '700', marginBottom: 8, marginTop: 3 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 14 },
  chip: { minHeight: 38, borderWidth: 1, borderRadius: 12, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 11, fontWeight: '700' },
  dateButtons: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  dateButton: { flex: 1, minHeight: 46, borderWidth: 1, borderRadius: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  dateButtonText: { fontSize: 11, fontWeight: '700' },
  reminderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 54, marginBottom: 10 },
  reminderTitle: { fontSize: 13, fontWeight: '700' },
  notesInput: { minHeight: 75, textAlignVertical: 'top' },
  saveButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 14, marginTop: 5 },
  saveText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  cancelButton: { minHeight: 45, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 13, fontWeight: '600' },
  disabled: { opacity: 0.6 },
});
