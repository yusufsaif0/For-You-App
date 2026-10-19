import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, PermissionsAndroid, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getStepCounterStatus, isStepCounterAvailable, startStepTracking, stopStepTracking, type StepCounterStatus } from '@/services/step-counter';
import { useAppTheme } from '@/state/ThemeProvider';

const DAILY_GOAL = 10_000;

function localDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dayName(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' });
}

export default function StepsScreen() {
  const { colors } = useAppTheme();
  const [status, setStatus] = useState<StepCounterStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const supported = isStepCounterAvailable();

  const refresh = useCallback(async () => {
    if (!supported) {
      setLoading(false);
      return;
    }
    try {
      setStatus(await getStepCounterStatus());
      setError('');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not read step data.');
    } finally {
      setLoading(false);
    }
  }, [supported]);

  useFocusEffect(useCallback(() => {
    void refresh();
    const interval = setInterval(() => { void refresh(); }, 30_000);
    return () => clearInterval(interval);
  }, [refresh]));

  const toggleTracking = async () => {
    setBusy(true);
    setError('');
    try {
      if (status?.tracking) {
        await stopStepTracking();
      } else {
        if (Platform.OS !== 'android') throw new Error('Step tracking is available on Android only.');
        const activity = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION,
          {
            title: 'Allow step tracking',
            message: 'Daily Life uses the device step sensor to count steps on this phone. Step totals stay on your device.',
            buttonPositive: 'Allow',
            buttonNegative: 'Not now',
          },
        );
        if (activity !== PermissionsAndroid.RESULTS.GRANTED) {
          throw new Error('Activity Recognition permission is required to count steps.');
        }
        if (Number(Platform.Version) >= 33) {
          const notifications = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
            {
              title: 'Show step-tracking notification',
              message: 'Android shows an ongoing notification while steps are counted in the background.',
              buttonPositive: 'Allow',
              buttonNegative: 'Not now',
            },
          );
          if (notifications !== PermissionsAndroid.RESULTS.GRANTED) {
            throw new Error('Allow notifications to start visible background step tracking.');
          }
        }
        await startStepTracking();
      }
      await refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not update step tracking.');
    } finally {
      setBusy(false);
    }
  };

  const todaySteps = status?.todaySteps ?? 0;
  const progress = Math.min(todaySteps / DAILY_GOAL, 1);
  const weekTotal = status?.lastSevenDays.reduce((sum, day) => sum + day.steps, 0) ?? 0;
  const weekMax = Math.max(1, ...(status?.lastSevenDays.map((day) => day.steps) ?? []));

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={styles.back}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: colors.text }]}>Daily steps</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>A little movement adds up</Text>
        </View>
        {status?.tracking ? <Pressable accessibilityRole="button" accessibilityLabel="Refresh step count" onPress={() => void refresh()} style={styles.refresh}>
          <Ionicons name="refresh-outline" size={20} color={colors.primary} />
        </Pressable> : null}
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.privacyCard, { backgroundColor: colors.primarySoft }]}>
          <Ionicons name="lock-closed-outline" size={18} color={colors.primary} />
          <Text style={[styles.privacyText, { color: colors.text }]}>
            Step totals are stored only on this device. Android keeps a persistent notification visible while background tracking is on.
          </Text>
        </View>
        {Platform.OS !== 'android' ? (
          <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="phone-portrait-outline" size={30} color={colors.muted} />
            <Text style={[styles.infoTitle, { color: colors.text }]}>Android only</Text>
            <Text style={[styles.infoText, { color: colors.muted }]}>Daily step tracking uses the Android device step sensor.</Text>
          </View>
        ) : !supported ? (
          <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="build-outline" size={30} color={colors.primary} />
            <Text style={[styles.infoTitle, { color: colors.text }]}>Install the Android app</Text>
            <Text style={[styles.infoText, { color: colors.muted }]}>
              Step tracking needs this project’s custom Android build and a device with a step-counter sensor. It is not available in Expo Go.
            </Text>
          </View>
        ) : loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
        ) : status && !status.available ? (
          <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="alert-circle-outline" size={30} color={colors.muted} />
            <Text style={[styles.infoTitle, { color: colors.text }]}>Step sensor unavailable</Text>
            <Text style={[styles.infoText, { color: colors.muted }]}>This device does not provide an Android step-counter sensor.</Text>
          </View>
        ) : status ? (
          <>
            <View style={[styles.todayCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.todayHeading}>
                <View>
                  <Text style={[styles.cardEyebrow, { color: colors.muted }]}>TODAY</Text>
                  <Text style={[styles.stepsValue, { color: colors.text }]}>{todaySteps.toLocaleString()}</Text>
                  <Text style={[styles.goalCopy, { color: colors.muted }]}>of {DAILY_GOAL.toLocaleString()} steps</Text>
                </View>
                <View style={[styles.walkIcon, { backgroundColor: colors.primarySoft }]}>
                  <Ionicons name="walk-outline" size={34} color={colors.primary} />
                </View>
              </View>
              <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: DAILY_GOAL, now: Math.min(todaySteps, DAILY_GOAL) }} style={[styles.progressTrack, { backgroundColor: colors.surfaceAlt }]}>
                <View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${Math.max(progress > 0 ? 2 : 0, progress * 100)}%` }]} />
              </View>
              <Text style={[styles.progressCaption, { color: colors.muted }]}>
                {todaySteps >= DAILY_GOAL ? 'Daily goal reached. Great work!' : `${Math.max(0, DAILY_GOAL - todaySteps).toLocaleString()} steps to your daily goal`}
              </Text>
            </View>

            <View style={[styles.weekCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.weekHeader}>
                <View>
                  <Text style={[styles.weekTitle, { color: colors.text }]}>Last 7 days</Text>
                  <Text style={[styles.weekSubtitle, { color: colors.muted }]}>{weekTotal.toLocaleString()} steps in the last 7 days</Text>
                </View>
                <Ionicons name="calendar-outline" size={20} color={colors.primary} />
              </View>
              <View style={styles.chart}>
                {status.lastSevenDays.map((day) => (
                  <View key={day.date} style={styles.chartColumn}>
                    <Text style={[styles.chartValue, { color: colors.muted }]}>{day.steps ? day.steps.toLocaleString() : '0'}</Text>
                    <View style={[styles.chartTrack, { backgroundColor: colors.surfaceAlt }]}>
                      <View style={[styles.chartBar, { backgroundColor: day.date === localDateString(new Date()) ? colors.primary : colors.primarySoft, height: `${Math.max(day.steps ? 5 : 0, day.steps / weekMax * 100)}%` }]} />
                    </View>
                    <Text style={[styles.chartDay, { color: colors.muted }]}>{dayName(day.date)}</Text>
                  </View>
                ))}
              </View>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ busy, checked: status.tracking }}
              disabled={busy}
              onPress={() => void toggleTracking()}
              style={[styles.toggleButton, { backgroundColor: status.tracking ? colors.surfaceAlt : colors.primary, borderColor: colors.border }]}
            >
              {busy ? <ActivityIndicator color={status.tracking ? colors.text : '#FFFFFF'} /> : <>
                <Ionicons name={status.tracking ? 'pause-circle-outline' : 'play-circle-outline'} size={20} color={status.tracking ? colors.text : '#FFFFFF'} />
                <Text style={[styles.toggleText, { color: status.tracking ? colors.text : '#FFFFFF' }]}>{status.tracking ? 'Stop step tracking' : 'Enable step tracking'}</Text>
              </>}
            </Pressable>
            <Text style={[styles.footer, { color: colors.muted }]}>
              {status.tracking
                ? 'Tracking is on. Steps are counted in the background while Android keeps the ongoing notification active.'
                : 'Tracking is off. Start tracking to count steps from this point onward; earlier steps today are not available.'}
            </Text>
          </>
        ) : null}
        {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.red }]}>{error}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingVertical: 10 },
  back: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1 },
  title: { fontSize: 21, fontWeight: '800' },
  subtitle: { fontSize: 11, marginTop: 3 },
  refresh: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 19, paddingBottom: 30 },
  privacyCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 13, borderRadius: 16, marginTop: 5, marginBottom: 15 },
  privacyText: { flex: 1, fontSize: 11, lineHeight: 17 },
  infoCard: { borderWidth: 1, borderRadius: 22, padding: 22, alignItems: 'center', marginTop: 10 },
  infoTitle: { textAlign: 'center', fontSize: 17, fontWeight: '800', marginTop: 13 },
  infoText: { textAlign: 'center', fontSize: 12, lineHeight: 19, marginTop: 8 },
  loader: { marginTop: 30 },
  todayCard: { borderWidth: 1, borderRadius: 23, padding: 20, marginTop: 4 },
  todayHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardEyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.1 },
  stepsValue: { fontSize: 42, lineHeight: 50, fontWeight: '800', letterSpacing: -1.1, marginTop: 7 },
  goalCopy: { fontSize: 12, marginTop: 1 },
  walkIcon: { width: 62, height: 62, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  progressTrack: { height: 10, borderRadius: 6, overflow: 'hidden', marginTop: 23 },
  progressFill: { height: '100%', borderRadius: 6 },
  progressCaption: { fontSize: 11, fontWeight: '600', marginTop: 9 },
  weekCard: { borderWidth: 1, borderRadius: 22, padding: 17, marginTop: 14 },
  weekHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  weekTitle: { fontSize: 15, fontWeight: '800' },
  weekSubtitle: { fontSize: 11, marginTop: 4 },
  chart: { height: 145, flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 20 },
  chartColumn: { flex: 1, alignItems: 'center', gap: 6 },
  chartValue: { minHeight: 13, fontSize: 8, fontWeight: '600' },
  chartTrack: { flex: 1, width: '100%', borderRadius: 7, justifyContent: 'flex-end', overflow: 'hidden' },
  chartBar: { width: '100%', borderRadius: 7 },
  chartDay: { fontSize: 9, fontWeight: '700' },
  toggleButton: { minHeight: 49, borderWidth: 1, borderRadius: 15, marginTop: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  toggleText: { fontSize: 13, fontWeight: '800' },
  footer: { fontSize: 10, lineHeight: 16, textAlign: 'center', marginTop: 11 },
  error: { fontSize: 12, lineHeight: 18, marginVertical: 10 },
});
