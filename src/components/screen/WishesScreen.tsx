import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator, AppState, KeyboardAvoidingView, Modal, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { syncWishNotifications } from '@/services/notifications/reminders';
import {
  addWishContribution, createWish, deleteWish, getWishProgress, getWishes,
  localDateKey, type SavingsWish,
} from '@/services/wishes';
import { useAppTheme } from '@/state/ThemeProvider';

function formatCurrency(amount: number): string {
  return `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function formatDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function defaultTargetDate(): string {
  const date = new Date();
  const targetMonth = date.getMonth() + 3;
  const targetYear = date.getFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = targetMonth % 12;
  const lastDay = new Date(targetYear, normalizedMonth + 1, 0).getDate();
  date.setFullYear(targetYear, normalizedMonth, Math.min(date.getDate(), lastDay));
  return localDateKey(date);
}

function inputStyle(colors: ReturnType<typeof useAppTheme>['colors']) {
  return [styles.input, {
    color: colors.text,
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
  }];
}

export default function WishesScreen() {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [wishes, setWishes] = useState<SavingsWish[]>([]);
  const [contributionAmounts, setContributionAmounts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [reminderMessage, setReminderMessage] = useState('');
  const [today, setToday] = useState(() => localDateKey(new Date()));
  const [createVisible, setCreateVisible] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SavingsWish | null>(null);
  const [wishTitle, setWishTitle] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [targetDate, setTargetDate] = useState(defaultTargetDate);

  const updateNotifications = useCallback(async (next: SavingsWish[]) => {
    try {
      const enabled = await syncWishNotifications(next);
      if (!enabled && next.some((wish) => !getWishProgress(wish).isComplete)) {
        setReminderMessage(Platform.OS === 'web'
          ? 'Daily notifications are available in the mobile app. Your savings plan is still saved here.'
          : 'Allow notifications to receive a daily savings reminder.');
      } else {
        setReminderMessage('');
      }
    } catch (failure) {
      setReminderMessage(failure instanceof Error
        ? `Wish reminders could not be updated: ${failure.message}`
        : 'Wish reminders could not be updated.');
    }
  }, []);

  useFocusEffect(useCallback(() => {
    let active = true;
    setToday(localDateKey(new Date()));
    setLoading(true);
    getWishes().then((stored) => {
      if (!active) return;
      setWishes(stored);
      setContributionAmounts(Object.fromEntries(stored.map((wish) => [
        wish.id, String(getWishProgress(wish).dueToday || getWishProgress(wish).dailyPlan.toFixed(2)),
      ])));
      void updateNotifications(stored);
    }).catch((failure: unknown) => {
      if (active) setError(failure instanceof Error ? failure.message : 'Unable to load saved wishes.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setToday(localDateKey(new Date()));
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [updateNotifications]));

  const saveWish = async () => {
    const amount = Number(targetAmount.replace(/,/g, '').trim());
    setSaving(true);
    setError('');
    try {
      const next = await createWish(wishes, wishTitle, amount, targetDate);
      setWishes(next);
      const newWish = next[0];
      setContributionAmounts((previous) => ({
        ...previous,
        [newWish.id]: getWishProgress(newWish).dueToday.toFixed(2),
      }));
      setWishTitle('');
      setTargetAmount('');
      setTargetDate(defaultTargetDate());
      setCreateVisible(false);
      await updateNotifications(next);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to save this wish.');
    } finally {
      setSaving(false);
    }
  };

  const saveContribution = async (wish: SavingsWish) => {
    const amount = Number((contributionAmounts[wish.id] ?? '').replace(/,/g, '').trim());
    setSaving(true);
    setError('');
    try {
      const next = await addWishContribution(wishes, wish.id, amount);
      setWishes(next);
      const updatedWish = next.find((item) => item.id === wish.id)!;
      const progress = getWishProgress(updatedWish);
      setContributionAmounts((previous) => ({
        ...previous,
        [wish.id]: progress.dueToday > 0 ? progress.dueToday.toFixed(2) : progress.dailyPlan.toFixed(2),
      }));
      await updateNotifications(next);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to record these savings.');
    } finally {
      setSaving(false);
    }
  };

  const removeWish = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    setError('');
    try {
      const next = await deleteWish(wishes, deleteTarget.id);
      setWishes(next);
      setDeleteTarget(null);
      await updateNotifications(next);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to delete this wish.');
    } finally {
      setSaving(false);
    }
  };

  const renderWish = (wish: SavingsWish) => {
    const progress = getWishProgress(wish, today);
    const isActive = !progress.isComplete && !progress.isOverdue;
    return (
      <View key={wish.id} style={[styles.wishCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.wishHeading}>
          <View style={[styles.wishIcon, { backgroundColor: colors.primarySoft }]}>
            <Ionicons name={progress.isComplete ? 'checkmark-circle-outline' : 'heart-outline'} size={22} color={progress.isComplete ? colors.green : colors.primary} />
          </View>
          <View style={styles.wishHeadingText}>
            <Text style={[styles.wishTitle, { color: colors.text }]}>{wish.title}</Text>
            <Text style={[styles.wishSubtitle, { color: colors.muted }]}>Target by {formatDate(wish.targetDate)}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${wish.title} wish`} onPress={() => setDeleteTarget(wish)} hitSlop={8} style={styles.deleteButton}>
            <Ionicons name="trash-outline" size={19} color={colors.muted} />
          </Pressable>
        </View>

        <View style={styles.amountRow}>
          <Text style={[styles.savedAmount, { color: colors.text }]}>{formatCurrency(progress.totalSaved)}</Text>
          <Text style={[styles.targetAmount, { color: colors.muted }]}>of {formatCurrency(wish.targetAmount)}</Text>
        </View>
        <View style={[styles.progressTrack, { backgroundColor: colors.surfaceAlt }]}>
          <View style={[styles.progressFill, { width: `${Math.max(progress.progress * 100, progress.progress > 0 ? 2 : 0)}%`, backgroundColor: progress.isComplete ? colors.green : colors.primary }]} />
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCell}>
            <Text style={[styles.statLabel, { color: colors.muted }]}>Remaining</Text>
            <Text style={[styles.statValue, { color: colors.text }]}>{formatCurrency(progress.remaining)}</Text>
          </View>
          <View style={styles.statCell}>
            <Text style={[styles.statLabel, { color: colors.muted }]}>{progress.isOverdue ? 'Status' : 'Days left'}</Text>
            <Text style={[styles.statValue, { color: progress.isOverdue ? colors.red : colors.text }]}>{progress.isOverdue ? 'Past due' : progress.daysRemaining}</Text>
          </View>
        </View>

        {progress.isComplete ? (
          <View style={[styles.completeBanner, { backgroundColor: colors.primarySoft }]}>
            <Ionicons name="sparkles-outline" size={18} color={colors.green} />
            <Text style={[styles.bannerText, { color: colors.text }]}>Wish achieved! You reached your savings target.</Text>
          </View>
        ) : progress.isOverdue ? (
          <View style={[styles.completeBanner, { backgroundColor: colors.surfaceAlt }]}>
            <Ionicons name="alert-circle-outline" size={18} color={colors.red} />
            <Text style={[styles.bannerText, { color: colors.text }]}>{formatCurrency(progress.remaining)} left after the target date. Update the plan date to continue.</Text>
          </View>
        ) : (
          <View style={[styles.dueCard, { backgroundColor: colors.surfaceAlt }]}>
            <View style={styles.dueHeading}>
              <View>
                <Text style={[styles.dueLabel, { color: colors.text }]}>Due today, including missed days</Text>
                <Text style={[styles.dueAmount, { color: colors.primary }]}>{formatCurrency(progress.dueToday)}</Text>
              </View>
              <Text style={[styles.dailyHint, { color: colors.muted }]}>
                {progress.dueToday > 0 ? `About ${formatCurrency(progress.dailyPlan)} per day` : 'You’re on track today'}
              </Text>
            </View>
            <View style={styles.contributionRow}>
              <TextInput
                accessibilityLabel={`Savings amount for ${wish.title}`}
                value={contributionAmounts[wish.id] ?? ''}
                onChangeText={(value) => setContributionAmounts((previous) => ({ ...previous, [wish.id]: value }))}
                keyboardType="decimal-pad"
                placeholder="Amount saved today"
                placeholderTextColor={colors.muted}
                style={[inputStyle(colors), styles.contributionInput]}
              />
              <Pressable accessibilityRole="button" disabled={saving} onPress={() => void saveContribution(wish)} style={[styles.saveButton, { backgroundColor: colors.primary, opacity: saving ? 0.65 : 1 }]}>
                {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.saveButtonText}>Save today</Text>}
              </Pressable>
            </View>
          </View>
        )}
        {isActive ? <Text style={[styles.reminderHint, { color: colors.muted }]}>Daily reminder at 9:00 AM. Any missed daily amount is added to today’s due.</Text> : null}
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={styles.headerIcon}><Ionicons name="heart" size={21} color={colors.primary} /></View>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: colors.text }]}>Wishes</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>Save a little each day for what matters</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={() => { setError(''); setCreateVisible(true); }} style={[styles.addButton, { backgroundColor: colors.primary }]}>
          <Ionicons name="add" size={20} color="#FFFFFF" />
          <Text style={styles.addButtonText}>Add wish</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 18) + 92 }]} keyboardShouldPersistTaps="handled">
        <View style={[styles.introCard, { backgroundColor: colors.primarySoft }]}>
          <Ionicons name="calendar-outline" size={23} color={colors.primary} />
          <Text style={[styles.introText, { color: colors.text }]}>
            Set a savings target and date. Record what you actually set aside; this won’t move money or connect to your bank. Missed daily dues build up automatically.
          </Text>
        </View>
        {reminderMessage ? <Text accessibilityRole="alert" style={[styles.notice, { color: colors.primary }]}>{reminderMessage}</Text> : null}
        {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.red }]}>{error}</Text> : null}
        {loading ? <ActivityIndicator style={styles.loader} color={colors.primary} /> : wishes.length ? (
          <View style={styles.wishList}>{wishes.map(renderWish)}</View>
        ) : (
          <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.primarySoft }]}>
              <Ionicons name="gift-outline" size={30} color={colors.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>Start with a wish</Text>
            <Text style={[styles.emptyCaption, { color: colors.muted }]}>Add a goal such as a car, trip, or new phone. We’ll work out a daily savings plan.</Text>
            <Pressable accessibilityRole="button" onPress={() => setCreateVisible(true)} style={[styles.emptyButton, { backgroundColor: colors.primary }]}>
              <Text style={styles.saveButtonText}>Create your first wish</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      <Modal transparent visible={createVisible} animationType="slide" onRequestClose={() => setCreateVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalShade}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalScroll}>
            <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Create a wish</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setCreateVisible(false)} hitSlop={10}>
                  <Ionicons name="close" size={24} color={colors.muted} />
                </Pressable>
              </View>
              <Text style={[styles.fieldLabel, { color: colors.text }]}>What do you want to buy?</Text>
              <TextInput value={wishTitle} onChangeText={setWishTitle} placeholder="For example, a car" placeholderTextColor={colors.muted} style={inputStyle(colors)} maxLength={80} />
              <Text style={[styles.fieldLabel, { color: colors.text }]}>Target amount (₹)</Text>
              <TextInput value={targetAmount} onChangeText={setTargetAmount} keyboardType="decimal-pad" placeholder="1200000" placeholderTextColor={colors.muted} style={inputStyle(colors)} />
              <Text style={[styles.fieldLabel, { color: colors.text }]}>Target date (YYYY-MM-DD)</Text>
              <TextInput value={targetDate} onChangeText={setTargetDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} style={inputStyle(colors)} autoCapitalize="none" />
              <Text style={[styles.modalHint, { color: colors.muted }]}>The daily target is calculated from today through your selected date. Missed installments are added to the next day’s due.</Text>
              {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.red }]}>{error}</Text> : null}
              <Pressable accessibilityRole="button" disabled={saving} onPress={() => void saveWish()} style={[styles.modalPrimary, { backgroundColor: colors.primary, opacity: saving ? 0.65 : 1 }]}>
                {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveButtonText}>Create savings plan</Text>}
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal transparent visible={deleteTarget !== null} animationType="fade" onRequestClose={() => setDeleteTarget(null)}>
        <View style={styles.modalShade}>
          <View style={[styles.confirmCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Delete this wish?</Text>
            <Text style={[styles.modalHint, { color: colors.muted }]}>{deleteTarget?.title} and its saved contribution history will be removed from this device.</Text>
            <View style={styles.confirmActions}>
              <Pressable accessibilityRole="button" onPress={() => setDeleteTarget(null)} style={[styles.cancelButton, { borderColor: colors.border }]}>
                <Text style={[styles.cancelText, { color: colors.text }]}>Keep wish</Text>
              </Pressable>
              <Pressable accessibilityRole="button" disabled={saving} onPress={() => void removeWish()} style={[styles.deleteConfirm, { backgroundColor: colors.red }]}>
                <Text style={styles.saveButtonText}>Delete</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 13, gap: 11 },
  headerIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1769E018' },
  headerCopy: { flex: 1 },
  title: { fontSize: 23, fontWeight: '800' },
  subtitle: { marginTop: 3, fontSize: 12 },
  addButton: { minHeight: 40, paddingHorizontal: 12, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 3 },
  addButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  content: { padding: 16, gap: 14 },
  introCard: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 14, borderRadius: 16 },
  introText: { flex: 1, fontSize: 13, lineHeight: 19 },
  notice: { fontSize: 13, lineHeight: 19, paddingHorizontal: 3 },
  error: { fontSize: 13, lineHeight: 19, paddingHorizontal: 3 },
  loader: { marginTop: 36 },
  wishList: { gap: 13 },
  wishCard: { padding: 16, borderRadius: 18, borderWidth: 1, gap: 12 },
  wishHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  wishIcon: { width: 40, height: 40, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  wishHeadingText: { flex: 1 },
  wishTitle: { fontSize: 17, fontWeight: '700' },
  wishSubtitle: { marginTop: 3, fontSize: 12 },
  deleteButton: { padding: 7 },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  savedAmount: { fontSize: 23, fontWeight: '800' },
  targetAmount: { fontSize: 13 },
  progressTrack: { height: 8, borderRadius: 5, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 5 },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCell: { flex: 1, gap: 4 },
  statLabel: { fontSize: 11 },
  statValue: { fontSize: 14, fontWeight: '700' },
  dueCard: { padding: 13, borderRadius: 14, gap: 11 },
  dueHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  dueLabel: { fontSize: 12, fontWeight: '600' },
  dueAmount: { marginTop: 3, fontSize: 21, fontWeight: '800' },
  dailyHint: { fontSize: 11, textAlign: 'right', flexShrink: 1 },
  contributionRow: { flexDirection: 'row', gap: 8 },
  input: { minHeight: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 15 },
  contributionInput: { flex: 1, minWidth: 0 },
  saveButton: { minWidth: 100, minHeight: 46, borderRadius: 12, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  saveButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  reminderHint: { fontSize: 11, lineHeight: 16, marginTop: -5 },
  completeBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12 },
  bannerText: { flex: 1, fontSize: 12, lineHeight: 18 },
  emptyCard: { alignItems: 'center', padding: 24, borderRadius: 18, borderWidth: 1, gap: 11 },
  emptyIcon: { height: 58, width: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '800' },
  emptyCaption: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
  emptyButton: { marginTop: 3, borderRadius: 12, paddingHorizontal: 17, paddingVertical: 12 },
  modalShade: { flex: 1, backgroundColor: '#00000066', justifyContent: 'center', padding: 18 },
  modalScroll: { flexGrow: 1, justifyContent: 'center' },
  modalCard: { padding: 19, borderRadius: 20, gap: 10 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  modalTitle: { fontSize: 19, fontWeight: '800' },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  modalHint: { fontSize: 12, lineHeight: 18, marginTop: 2 },
  modalPrimary: { minHeight: 48, borderRadius: 13, justifyContent: 'center', alignItems: 'center', marginTop: 5 },
  confirmCard: { padding: 20, borderRadius: 18, gap: 12 },
  confirmActions: { flexDirection: 'row', gap: 10, marginTop: 5 },
  cancelButton: { flex: 1, minHeight: 44, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 13, fontWeight: '700' },
  deleteConfirm: { flex: 1, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
