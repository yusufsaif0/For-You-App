import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  getAppUsage, hasUsageAccess, isUsageTrackingAvailable, openUsageAccessSettings, type AppUsageEntry,
} from '@/services/app-usage';
import { useAppTheme } from '@/state/ThemeProvider';
import { goBackOrHome } from '@/services/navigation';

type Period = 'Today' | 'This week' | 'This month';

function getRange(period: Period, current: Date) {
  const start = new Date(current.getFullYear(), current.getMonth(), current.getDate());
  if (period === 'This week') start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  if (period === 'This month') start.setDate(1);
  return { start, end: current };
}

function formatDuration(milliseconds: number) {
  const totalMinutes = Math.floor(milliseconds / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`;
}

export default function ScreenTimeScreen() {
  const { colors } = useAppTheme();
  const [permission, setPermission] = useState<boolean | null>(null);
  const [period, setPeriod] = useState<Period>('Today');
  const [entries, setEntries] = useState<AppUsageEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const available = isUsageTrackingAvailable();

  const refresh = useCallback(async () => {
    if (!available) return;
    setLoading(true);
    setError('');
    try {
      const allowed = await hasUsageAccess();
      setPermission(allowed);
      if (!allowed) {
        setEntries([]);
        return;
      }
      const { start, end } = getRange(period, new Date());
      const usage = await getAppUsage(start, end);
      setEntries(usage.sort((a, b) => b.foregroundTimeMs - a.foregroundTimeMs));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to read app usage.');
    } finally {
      setLoading(false);
    }
  }, [available, period]);

  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  const total = entries.reduce((sum, item) => sum + item.foregroundTimeMs, 0);
  const maxDuration = entries[0]?.foregroundTimeMs || 1;

  const enableTracking = async () => {
    setError('');
    try {
      await openUsageAccessSettings();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not open Usage Access settings.');
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={goBackOrHome} style={styles.back}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: colors.text }]}>Screen time</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>A mindful view of your device use</Text>
        </View>
        {permission ? <Pressable accessibilityRole="button" accessibilityLabel="Refresh screen time" onPress={() => void refresh()} style={styles.refresh}>
          <Ionicons name="refresh-outline" size={20} color={colors.primary} />
        </Pressable> : null}
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.privacyCard, { backgroundColor: colors.primarySoft }]}>
          <Ionicons name="lock-closed-outline" size={18} color={colors.primary} />
          <Text style={[styles.privacyText, { color: colors.text }]}>
            Private to this device. Usage totals are read from Android and are not uploaded or stored by Daily Life. You can turn access off in Settings at any time.
          </Text>
        </View>
        {Platform.OS !== 'android' ? (
          <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="phone-portrait-outline" size={30} color={colors.muted} />
            <Text style={[styles.infoTitle, { color: colors.text }]}>Android only</Text>
            <Text style={[styles.infoText, { color: colors.muted }]}>Android Usage Access is required to read app screen time.</Text>
          </View>
        ) : !available ? (
          <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="build-outline" size={30} color={colors.primary} />
            <Text style={[styles.infoTitle, { color: colors.text }]}>Install the development build</Text>
            <Text style={[styles.infoText, { color: colors.muted }]}>
              Expo Go cannot access Android app usage. Build and install this project’s Android app to enable the on-device UsageStats feature.
            </Text>
          </View>
        ) : permission === null ? (
          <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {loading ? <ActivityIndicator size="large" color={colors.primary} /> : null}
            {!loading ? <Text style={[styles.infoText, { color: colors.muted }]}>Could not check Android Usage Access. Retry by reopening this screen.</Text> : null}
            {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.red }]}>{error}</Text> : null}
          </View>
        ) : permission === false ? (
          <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.infoIcon, { backgroundColor: colors.primarySoft }]}>
              <Ionicons name="analytics-outline" size={26} color={colors.primary} />
            </View>
            <Text style={[styles.infoTitle, { color: colors.text }]}>Choose to enable usage access</Text>
            <Text style={[styles.infoText, { color: colors.muted }]}>
              Android will open Usage Access settings. Find Daily Life and enable “Permit usage access.” Return here to see daily, weekly, and monthly totals for apps used on this device.
            </Text>
            <Pressable accessibilityRole="button" onPress={() => void enableTracking()} style={[styles.enableButton, { backgroundColor: colors.primary }]}>
              <Text style={styles.enableText}>Open Android settings</Text>
              <Ionicons name="open-outline" size={17} color="#FFFFFF" />
            </Pressable>
          </View>
        ) : (
          <>
            <View style={[styles.periods, { backgroundColor: colors.surfaceAlt }]}>
              {(['Today', 'This week', 'This month'] as const).map((item) => (
                <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: period === item }}
                  onPress={() => setPeriod(item)} style={[styles.period, period === item && { backgroundColor: colors.primary }]}>
                  <Text style={[styles.periodText, { color: colors.muted }, period === item && styles.activePeriodText]}>{item}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable accessibilityRole="button" onPress={() => void enableTracking()} style={styles.manageAccess}>
              <Ionicons name="settings-outline" size={15} color={colors.primary} />
              <Text style={[styles.manageAccessText, { color: colors.primary }]}>Manage Usage Access permission</Text>
            </Pressable>
            <View style={[styles.totalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.totalIcon, { backgroundColor: colors.primarySoft }]}>
                <Ionicons name="hourglass-outline" size={22} color={colors.primary} />
              </View>
              <View>
                <Text style={[styles.totalLabel, { color: colors.muted }]}>{period.toUpperCase()} TOTAL</Text>
                <Text style={[styles.totalValue, { color: colors.text }]}>{formatDuration(total)}</Text>
              </View>
              <Text style={[styles.appsCount, { color: colors.muted }]}>{entries.length} apps</Text>
            </View>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Apps used</Text>
              <Text style={[styles.sectionHint, { color: colors.muted }]}>Most used first</Text>
            </View>
            {loading ? <ActivityIndicator size="large" color={colors.primary} style={styles.loader} /> : null}
            {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.red }]}>{error}</Text> : null}
            {!loading && entries.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.infoText, { color: colors.muted }]}>No app activity was reported for this period.</Text>
              </View>
            ) : null}
            {entries.map((entry) => (
              <View key={entry.packageName} style={[styles.appRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={[styles.appIcon, { backgroundColor: colors.surfaceAlt }]}>
                  <Text style={[styles.appInitial, { color: colors.primary }]}>{entry.appName.trim().charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.appDetails}>
                  <View style={styles.appTitleLine}>
                    <Text numberOfLines={1} style={[styles.appName, { color: colors.text }]}>{entry.appName}</Text>
                    <Text style={[styles.appTime, { color: colors.text }]}>{formatDuration(entry.foregroundTimeMs)}</Text>
                  </View>
                  <View style={[styles.track, { backgroundColor: colors.surfaceAlt }]}>
                    <View style={[styles.bar, { backgroundColor: colors.primary, width: `${Math.max(3, entry.foregroundTimeMs / maxDuration * 100)}%` }]} />
                  </View>
                </View>
              </View>
            ))}
            <Text style={[styles.footer, { color: colors.muted }]}>Android provides foreground screen-time estimates. Some system apps may be hidden by Android.</Text>
          </>
        )}
        {error && !permission ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.red }]}>{error}</Text> : null}
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
  infoIcon: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  infoTitle: { textAlign: 'center', fontSize: 17, fontWeight: '800', marginTop: 13 },
  infoText: { textAlign: 'center', fontSize: 12, lineHeight: 19, marginTop: 8 },
  enableButton: { minHeight: 46, paddingHorizontal: 15, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 18 },
  enableText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  periods: { flexDirection: 'row', padding: 3, borderRadius: 13, marginBottom: 13 },
  period: { flex: 1, minHeight: 39, alignItems: 'center', justifyContent: 'center', borderRadius: 10, paddingHorizontal: 2 },
  periodText: { fontSize: 10, fontWeight: '700' },
  activePeriodText: { color: '#FFFFFF' },
  manageAccess: { minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 5, marginTop: -7, marginBottom: 8 },
  manageAccessText: { fontSize: 10, fontWeight: '700' },
  totalCard: { minHeight: 82, borderWidth: 1, borderRadius: 19, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  totalIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  totalLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 0.7 },
  totalValue: { fontSize: 22, fontWeight: '800', marginTop: 3 },
  appsCount: { marginLeft: 'auto', fontSize: 10 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 11 },
  sectionTitle: { fontSize: 16, fontWeight: '800' },
  sectionHint: { fontSize: 10 },
  loader: { marginTop: 20 },
  error: { fontSize: 12, lineHeight: 18, marginVertical: 10 },
  emptyCard: { borderWidth: 1, borderRadius: 17, padding: 18 },
  appRow: { flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderRadius: 16, padding: 12, marginBottom: 8 },
  appIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  appInitial: { fontSize: 15, fontWeight: '800' },
  appDetails: { flex: 1, gap: 9 },
  appTitleLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  appName: { flex: 1, fontSize: 12, fontWeight: '700' },
  appTime: { fontSize: 11, fontWeight: '800' },
  track: { height: 5, borderRadius: 3, overflow: 'hidden' },
  bar: { height: '100%', borderRadius: 3 },
  footer: { fontSize: 10, lineHeight: 15, marginTop: 10 },
});
