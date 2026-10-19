import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable,
  StyleSheet, Text, TextInput, View, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { addManualTransaction, getFinanceData, saveDailyPocketMoney, setSmsSyncEnabled } from '../../services/financeStorage';
import { requestSMSPermission, hasSMSPermission } from '../../services/permissionService';
import { readSMS } from '../../services/smsService';
import { useAppTheme } from '../../state/ThemeProvider';
import { formatCurrency, summarizeByDay, summarizeTransactions } from '../../utils/transactionParser';

const FinanceSummary = () => {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const [cardWidth, setCardWidth] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [manualTransactions, setManualTransactions] = useState([]);
  const [smsTransactions, setSmsTransactions] = useState([]);
  const [dailyPocketMoney, setDailyPocketMoney] = useState(0);
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [smsLoading, setSmsLoading] = useState(false);
  const [error, setError] = useState('');
  const [formType, setFormType] = useState(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    getFinanceData().then((data) => {
      if (!active) return;
      setManualTransactions(data.manualTransactions);
      setDailyPocketMoney(data.dailyPocketMoney);
      setSmsEnabled(data.smsEnabled);
    }).catch((failure) => {
      if (active) setError(failure instanceof Error ? failure.message : 'Unable to load saved money data.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const transactions = useMemo(
    () => [...manualTransactions, ...smsTransactions],
    [manualTransactions, smsTransactions],
  );
  const summary = useMemo(() => summarizeTransactions(transactions), [transactions]);
  const dailySummary = useMemo(() => summarizeByDay(transactions), [transactions]);
  const daysInMonth = new Date().getDate();
  const monthBudget = dailyPocketMoney * new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const todayRemaining = dailyPocketMoney - summary.today.expense;
  const monthRemaining = monthBudget - summary.thisMonth.expense;
  const todayProgress = dailyPocketMoney > 0 ? Math.min(summary.today.expense / dailyPocketMoney, 1) : 0;
  const contentWidth = Math.max((cardWidth || width - 40) - 32, 0);
  const stackPeriods = !expanded || contentWidth < 520 * fontScale;
  const periodWidth = stackPeriods ? contentWidth : (contentWidth - 24) / 2;
  const longestAmount = Math.max(...[
    summary.today.expense, summary.today.income,
    ...(expanded ? [summary.thisMonth.expense, summary.thisMonth.income] : []),
  ].map((value) => formatCurrency(value).length));
  // Make room before shrinking numbers, including with larger system fonts.
  const stackStats = periodWidth < 220 * fontScale || longestAmount * 10 * fontScale > (periodWidth - 8) / 2 - 16;
  const currencyFontSize = (value, baseSize, availableWidth) => Math.min(
    baseSize, Math.max(availableWidth, 1) / (formatCurrency(value).length * 0.7 * fontScale),
  );

  const syncSms = useCallback(async (checkPermission = true) => {
    if (Platform.OS !== 'android') {
      setError('Automatic SMS import is available on Android only. You can still add transactions manually.');
      return;
    }
    setSmsLoading(true);
    setError('');
    try {
      const allowed = checkPermission ? await hasSMSPermission() : true;
      if (!allowed) {
        await setSmsSyncEnabled(false);
        setSmsEnabled(false);
        setError('SMS permission is off. Tap Enable to grant access again.');
        return;
      }
      setSmsTransactions(await readSMS());
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not read transaction messages.');
    } finally {
      setSmsLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    if (!smsEnabled || loading) return undefined;
    void syncSms();
    const interval = setInterval(() => { void syncSms(); }, 30_000);
    return () => clearInterval(interval);
  }, [loading, smsEnabled, syncSms]));

  const connectSms = async () => {
    if (Platform.OS !== 'android') {
      setError('Automatic SMS import is available on Android only. You can still add transactions manually.');
      return;
    }
    setError('');
    setSmsLoading(true);
    try {
      const granted = await requestSMSPermission();
      if (!granted) {
        setError('SMS permission was not granted. You can enable it later in Android Settings.');
        return;
      }
      await setSmsSyncEnabled(true);
      setSmsEnabled(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to enable SMS import.');
    } finally {
      setSmsLoading(false);
    }
  };

  const disconnectSms = async () => {
    try {
      await setSmsSyncEnabled(false);
      setSmsEnabled(false);
      setSmsTransactions([]);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to turn off SMS import.');
    }
  };

  const openForm = (type) => {
    setFormType(type);
    setAmount(type === 'pocket' ? (dailyPocketMoney ? String(dailyPocketMoney) : '') : '');
    setNote('');
    setError('');
  };

  const saveForm = async () => {
    const parsedAmount = Number(amount.replace(/,/g, '').trim());
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0 || parsedAmount > 10_000_000) {
      setError('Enter an amount greater than ₹0 and no more than ₹1,00,00,000.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (formType === 'pocket') {
        await saveDailyPocketMoney(parsedAmount);
        setDailyPocketMoney(parsedAmount);
      } else {
        const transaction = await addManualTransaction({
          amount: parsedAmount,
          type: formType,
          note: note.trim(),
        });
        setManualTransactions((previous) => [transaction, ...previous]);
      }
      setFormType(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to save this money entry.');
    } finally {
      setSaving(false);
    }
  };

  const statBox = (value, label, tint) => (
    <View style={[styles.statBox, { backgroundColor: colors.surfaceAlt }]}>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}
        accessibilityLabel={`${label}: ${formatCurrency(value)}`}
        style={[styles.statValue, { color: tint, fontSize: currencyFontSize(value, 18, (stackStats ? periodWidth : (periodWidth - 8) / 2) - 20) }]}>{formatCurrency(value)}</Text>
      <Text style={[styles.statLabel, { color: colors.muted }]}>{label}</Text>
    </View>
  );

  return (
    <View onLayout={(event) => setCardWidth(event.nativeEvent.layout.width)}
      style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.periods, stackPeriods && styles.stackedPeriods]}>
        <View style={styles.period}>
          <Text style={[styles.periodTitle, { color: colors.text }]}>Today</Text>
          <View style={[styles.statRow, stackStats && styles.stackedStats]}>
            {statBox(loading ? 0 : summary.today.expense, 'Spent', colors.red)}
            {statBox(loading ? 0 : summary.today.income, 'Income', colors.green)}
          </View>
        </View>
        {expanded ? <>
        <View style={[styles.divider, stackPeriods && styles.stackedDivider, { backgroundColor: colors.border }]} />
        <View style={styles.period}>
          <Text style={[styles.periodTitle, { color: colors.text }]}>This Month</Text>
          <View style={[styles.statRow, stackStats && styles.stackedStats]}>
            {statBox(loading ? 0 : summary.thisMonth.expense, 'Expense', colors.red)}
            {statBox(loading ? 0 : summary.thisMonth.income, 'Income', colors.green)}
          </View>
        </View>
        </> : null}
      </View>

      {expanded ? <View style={[styles.budgetCard, { backgroundColor: colors.surfaceAlt }]}>
        <View style={styles.budgetHeading}>
          <View style={styles.budgetCopy}>
            <Text style={[styles.budgetTitle, { color: colors.text }]}>Daily pocket money</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={() => openForm('pocket')} style={[styles.smallButton, { backgroundColor: colors.primarySoft }]}>
            <Text style={[styles.smallButtonText, { color: colors.primary }]}>{dailyPocketMoney > 0 ? 'Edit' : 'Set budget'}</Text>
          </Pressable>
        </View>
        <Text style={[styles.budgetCaption, { color: colors.muted }]}>
          {dailyPocketMoney > 0 ? `Budget ${formatCurrency(dailyPocketMoney)} per day` : 'Set a daily spending budget'}
        </Text>
        {dailyPocketMoney > 0 ? (
          <>
            <View style={styles.remainingRow}>
              <Text style={[styles.remainingLabel, { color: colors.muted }]}>Left today</Text>
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}
                style={[styles.remainingValue, { color: todayRemaining < 0 ? colors.red : colors.green,
                  fontSize: currencyFontSize(Math.abs(todayRemaining), 20, contentWidth - 26) }]}>{formatCurrency(Math.abs(todayRemaining))}</Text>
              {todayRemaining < 0 ? <Text style={[styles.balanceStatus, { color: colors.red }]}>Over budget</Text> : null}
            </View>
            <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
              <View style={[styles.progressFill, { backgroundColor: todayRemaining < 0 ? colors.red : colors.primary, width: `${todayProgress * 100}%` }]} />
            </View>
            <View style={styles.monthBudgetRow}>
              <Text style={[styles.budgetCaption, { color: colors.muted }]}>
                Month budget
              </Text>
              <Text style={[styles.budgetCaption, { color: colors.muted }]}>{new Date().toLocaleDateString('en-IN', { month: 'long' })} · {daysInMonth} days elapsed</Text>
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}
                style={[styles.monthBalance, { color: monthRemaining < 0 ? colors.red : colors.text,
                  fontSize: currencyFontSize(Math.abs(monthRemaining), 16, contentWidth - 26) }]}>{formatCurrency(Math.abs(monthRemaining))}</Text>
              <Text style={[styles.balanceStatus, { color: monthRemaining < 0 ? colors.red : colors.muted }]}>{monthRemaining < 0 ? 'Over budget' : 'Left this month'}</Text>
            </View>
          </>
        ) : null}
      </View> : null}

      <View style={styles.actions}>
        <Pressable accessibilityRole="button" onPress={() => openForm('expense')} style={[styles.actionButton, { backgroundColor: colors.primary }]}>
          <Text style={styles.actionText}>+ Add expense</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => openForm('income')} style={[styles.actionButton, styles.secondaryAction, { borderColor: colors.border }]}>
          <Text style={[styles.actionText, { color: colors.text }]}>+ Add income</Text>
        </Pressable>
      </View>

      {expanded ? <>
      <View style={styles.dailyHeader}>
        <Text style={[styles.dailyTitle, { color: colors.text }]}>Daily spending</Text>
        <Text style={[styles.dailyCaption, { color: colors.muted }]}>Last 7 days</Text>
      </View>
      {dailySummary.map((day) => (
        <View key={day.key} style={styles.dayRow}>
          <View style={styles.dayTotals}>
            <Text style={[styles.dayName, { color: colors.muted }]}>{day.label}</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}
              accessibilityLabel={`${day.label}: ${formatCurrency(day.expense)} spent`}
              style={[styles.dayAmount, { color: colors.text,
                fontSize: currencyFontSize(day.expense, 11, contentWidth - 68) }]}>{formatCurrency(day.expense)}</Text>
          </View>
          <View style={[styles.dayTrack, { backgroundColor: colors.border }]}>
            <View style={[styles.dayBar, { backgroundColor: colors.primary, width: `${Math.min(day.expense / Math.max(...dailySummary.map((item) => item.expense), 1), 1) * 100}%` }]} />
          </View>
        </View>
      ))}

      <View style={[styles.smsCard, { borderTopColor: colors.border }]}>
        <View style={styles.smsCopy}>
          <Text style={[styles.smsTitle, { color: colors.text }]}>{smsEnabled ? 'Bank SMS sync on' : 'Automatic bank SMS sync'}</Text>
          <Text style={[styles.smsCaption, { color: colors.muted }]}>
            {Platform.OS === 'android'
              ? 'Transaction alerts are read and processed on this device only.'
              : 'SMS import is Android-only. Manual entries work here.'}
          </Text>
        </View>
        {smsLoading ? <ActivityIndicator size="small" color={colors.primary} /> : (
          <Pressable accessibilityRole="button" onPress={() => (smsEnabled ? void disconnectSms() : void connectSms())}>
            <Text style={[styles.smallButtonText, { color: colors.primary }]}>{smsEnabled ? 'Turn off' : 'Enable'}</Text>
          </Pressable>
        )}
      </View>
      </> : null}
      {error ? <Text accessibilityRole="alert" style={[styles.errorText, { color: colors.red }]}>{error}</Text> : null}
      <Pressable accessibilityRole="button" accessibilityLabel={expanded ? 'Collapse money details' : 'Expand money details'}
        accessibilityState={{ expanded }} aria-expanded={expanded} onPress={() => setExpanded((current) => !current)}
        style={({ pressed }) => [styles.expandButton, { borderTopColor: colors.border }, pressed && styles.pressed]}>
        <Text style={[styles.expandText, { color: colors.primary }]}>{expanded ? 'Show less' : 'Show more'}</Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.primary} />
      </Pressable>

      <Modal visible={!!formType} transparent animationType="slide" onRequestClose={() => !saving && setFormType(null)}>
        <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => !saving && setFormType(null)} />
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 18), backgroundColor: colors.surface }]} accessibilityViewIsModal>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <Text style={[styles.sheetTitle, { color: colors.text }]}>
              {formType === 'pocket' ? 'Set daily pocket money' : formType === 'income' ? 'Add income' : 'Add expense'}
            </Text>
            <Text style={[styles.sheetCaption, { color: colors.muted }]}>
              {formType === 'pocket' ? 'This budget repeats each day; monthly budget is calculated from the days in the month.' : 'Saved privately on this device.'}
            </Text>
            <Text style={[styles.inputLabel, { color: colors.text }]}>Amount (₹)</Text>
            <TextInput
              accessibilityLabel="Amount in rupees"
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={colors.muted}
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
              autoFocus
            />
            {formType !== 'pocket' ? (
              <>
                <Text style={[styles.inputLabel, { color: colors.text }]}>Note (optional)</Text>
                <TextInput
                  accessibilityLabel="Transaction note"
                  value={note}
                  onChangeText={setNote}
                  maxLength={80}
                  placeholder="e.g. Lunch"
                  placeholderTextColor={colors.muted}
                  style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
                />
              </>
            ) : null}
            {error ? <Text accessibilityRole="alert" style={[styles.errorText, { color: colors.red }]}>{error}</Text> : null}
            <Pressable accessibilityRole="button" disabled={saving} onPress={() => void saveForm()} style={[styles.saveButton, { backgroundColor: colors.primary }]}>
              {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveText}>Save</Text>}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { marginHorizontal: 0, borderWidth: 1, borderRadius: 22, padding: 15 },
  periods: { flexDirection: 'row', alignItems: 'stretch', gap: 12 },
  stackedPeriods: { flexDirection: 'column' },
  period: { flex: 1, minWidth: 0 },
  periodTitle: { fontSize: 14, fontWeight: '700', marginBottom: 11, marginLeft: 3 },
  statRow: { flexDirection: 'row', gap: 8 },
  stackedStats: { flexDirection: 'column' },
  statBox: { flex: 1, minWidth: 0, minHeight: 78, borderRadius: 15, alignItems: 'stretch', justifyContent: 'center', padding: 10 },
  statValue: { width: '100%', fontSize: 18, fontWeight: '800', textAlign: 'center', fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: 12, fontWeight: '600', marginTop: 5, textAlign: 'center' },
  divider: { width: 1, alignSelf: 'stretch' },
  stackedDivider: { width: '100%', height: 1 },
  budgetCard: { borderRadius: 17, padding: 13, marginTop: 16 },
  budgetHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  budgetCopy: { flex: 1, minWidth: 0 },
  budgetTitle: { fontSize: 14, fontWeight: '800' },
  budgetCaption: { fontSize: 11, lineHeight: 17, marginTop: 4 },
  smallButton: { flexShrink: 0, minHeight: 44, justifyContent: 'center', borderRadius: 11, paddingHorizontal: 12, paddingVertical: 8 },
  smallButtonText: { fontSize: 12, fontWeight: '800' },
  remainingRow: { marginTop: 14, gap: 4 },
  remainingLabel: { fontSize: 12, fontWeight: '600' },
  remainingValue: { fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'] },
  balanceStatus: { fontSize: 11, lineHeight: 17 },
  monthBalance: { fontSize: 16, fontWeight: '700', marginTop: 6, fontVariant: ['tabular-nums'] },
  progressTrack: { height: 6, borderRadius: 4, overflow: 'hidden', marginTop: 8 },
  progressFill: { height: '100%', borderRadius: 4 },
  monthBudgetRow: { alignItems: 'stretch', marginTop: 12 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 14 },
  actionButton: { flex: 1, minWidth: 110, minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 10 },
  secondaryAction: { backgroundColor: 'transparent', borderWidth: 1 },
  actionText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800', textAlign: 'center' },
  dailyHeader: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center', justifyContent: 'space-between', marginTop: 18, marginBottom: 10 },
  dailyTitle: { fontSize: 13, fontWeight: '800' },
  dailyCaption: { fontSize: 11 },
  dayRow: { gap: 7, marginVertical: 7 },
  dayTotals: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dayName: { flexShrink: 0, fontSize: 11, fontWeight: '600' },
  dayTrack: { height: 6, borderRadius: 4, overflow: 'hidden' },
  dayBar: { height: '100%', borderRadius: 4 },
  dayAmount: { flex: 1, minWidth: 0, fontSize: 11, fontWeight: '700', textAlign: 'right', fontVariant: ['tabular-nums'] },
  smsCard: { borderTopWidth: 1, paddingTop: 12, marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  smsCopy: { flex: 1 },
  smsTitle: { fontSize: 12, fontWeight: '800' },
  smsCaption: { fontSize: 10, lineHeight: 15, marginTop: 3 },
  errorText: { fontSize: 12, lineHeight: 17, marginTop: 9 },
  expandButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderTopWidth: 1, marginTop: 14, marginBottom: -7 },
  expandText: { fontSize: 12, fontWeight: '600' },
  pressed: { opacity: 0.65 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.48)' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 22, paddingTop: 12 },
  handle: { width: 42, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 17 },
  sheetTitle: { fontSize: 20, fontWeight: '800' },
  sheetCaption: { fontSize: 12, lineHeight: 18, marginTop: 5, marginBottom: 14 },
  inputLabel: { fontSize: 12, fontWeight: '700', marginBottom: 7 },
  input: { borderWidth: 1, borderRadius: 12, minHeight: 46, paddingHorizontal: 12, marginBottom: 13 },
  saveButton: { minHeight: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginTop: 6 },
  saveText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
});

export default FinanceSummary;
