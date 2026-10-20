import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNow } from '../../hooks/use-now';
import FinanceSummary from '../Layout/FinanceSummary';
import MarketWatch from '../Layout/MarketWatch';
import { getMarketQuotes } from '../../services/api/market';
import { aqiDescription, getLocalWeather } from '../../services/weather';
import { useAppTheme } from '../../state/ThemeProvider';
import { useSchedules } from '../../state/ScheduleProvider';
import { isInSelectedPeriod } from '../../utils/scheduleDates';

export default function HomeScreen() {
  const { theme, colors } = useAppTheme();
  const { schedules, isRefreshing, refresh } = useSchedules();
  const [market, setMarket] = useState(null);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketError, setMarketError] = useState('');
  const marketRequest = useRef(false);
  const [weather, setWeather] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState('');
  const now = useNow();
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  const refreshWeather = useCallback(async () => {
    if (weatherLoading) return;
    setWeatherLoading(true);
    setWeatherError('');
    try {
      setWeather(await getLocalWeather());
    } catch (failure) {
      setWeatherError(failure instanceof Error ? failure.message : 'Unable to load local weather.');
    } finally {
      setWeatherLoading(false);
    }
  }, [weatherLoading]);
  useFocusEffect(useCallback(() => {
    if (!weather && !weatherLoading && !weatherError) void refreshWeather();
  }, [refreshWeather, weather, weatherError, weatherLoading]));
  const refreshMarket = useCallback(async () => {
    if (marketRequest.current) return;
    marketRequest.current = true;
    setMarketLoading(true);
    setMarketError('');
    try {
      setMarket(await getMarketQuotes());
    } catch (failure) {
      setMarketError(failure instanceof Error ? failure.message : 'Market data is temporarily unavailable.');
    } finally {
      marketRequest.current = false;
      setMarketLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => {
    void refreshMarket();
    const interval = setInterval(() => { void refreshMarket(); }, 5 * 60_000);
    return () => clearInterval(interval);
  }, [refreshMarket]));

  const todaySchedules = schedules
    .filter((schedule) => now && isInSelectedPeriod(schedule.starts_at, 'Today', now))
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const completed = todaySchedules.filter((schedule) => schedule.completed).length;
  const nextSchedule = todaySchedules.find((schedule) => !schedule.completed);
  const dayLabel = now?.toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long',
  }) ?? 'Your day';
  const greetingHour = now?.getHours() ?? 12;
  const greeting = greetingHour < 12 ? 'Good morning' : greetingHour < 18 ? 'Good afternoon' : 'Good evening';
  const air = aqiDescription(weather?.aqi ?? null);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void refresh()} tintColor={colors.primary} />}
      >
        <View style={styles.topBar}>
          <View>
            <Text style={[styles.eyebrow, { color: colors.muted }]}>{dayLabel.toUpperCase()}</Text>
            <Text style={[styles.greeting, { color: colors.text }]}>{greeting} <Text style={styles.wave}>✦</Text></Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open notifications"
            onPress={() => router.navigate('/notifications')}
            style={[styles.themeButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Ionicons name="notifications-outline" size={21} color={colors.text} />
          </Pressable>
        </View>

        <LinearGradient
          colors={theme === 'light' ? ['#6259F5', '#8877FA', '#B18BFA'] : ['#35306E', '#4A3E83', '#664B91']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroOrbOne} />
          <View style={styles.heroOrbTwo} />
          <View style={styles.heroContent}>
            <View style={styles.weatherHeroHeading}>
              <View style={styles.weatherHeroLabel}>
                <Ionicons name="location" size={13} color="rgba(255,255,255,0.82)" />
                <Text numberOfLines={1} style={styles.heroLabelText}>
                  {weather?.city?.toUpperCase() ?? 'LOCAL WEATHER'}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Refresh weather"
                disabled={weatherLoading}
                onPress={() => void refreshWeather()}
                hitSlop={8}
                style={styles.weatherRefresh}
              >
                {weatherLoading
                  ? <ActivityIndicator size="small" color="#FFFFFF" />
                  : <Ionicons name="refresh-outline" size={19} color="#FFFFFF" />}
              </Pressable>
            </View>
            {weather ? (
              <>
                <View style={styles.weatherHeroMain}>
                  <View style={styles.weatherHeroCopy}>
                    <Text style={styles.weatherHeroTemperature}>{Math.round(weather.temperature)}°</Text>
                    <Text style={styles.weatherHeroCondition}>{weather.description}</Text>
                    <Text style={styles.heroSubtitle}>Feels like {Math.round(weather.feelsLike)}°</Text>
                  </View>
                  <Ionicons name="partly-sunny-outline" size={66} color="rgba(255,255,255,0.88)" />
                </View>
                <View style={styles.weatherHeroFooter}>
                  <View style={styles.weatherHeroStat}>
                    <Ionicons name="water-outline" size={15} color="#FFFFFF" />
                    <Text style={styles.weatherHeroStatText}>{weather.humidity}% humidity</Text>
                  </View>
                  <View style={styles.weatherHeroStat}>
                    <Ionicons name="leaf-outline" size={15} color="#FFFFFF" />
                    <Text style={styles.weatherHeroStatText}>AQI {weather.aqi ?? '—'} · {air.label}</Text>
                  </View>
                  <Pressable accessibilityRole="button" accessibilityLabel="Open full weather report"
                    onPress={() => router.navigate('/weather')} style={styles.weatherReportButton}>
                    <Ionicons name="arrow-forward" size={17} color="#5148C7" />
                  </Pressable>
                </View>
              </>
            ) : (
              <View style={styles.weatherEmpty}>
                <Text style={styles.weatherHeroTitle}>Weather report</Text>
                <Text style={styles.heroSubtitle}>
                  {weatherLoading ? 'Getting conditions near you…' : weatherError || 'Check local weather and air quality.'}
                </Text>
                {!weatherLoading ? (
                  <Pressable accessibilityRole="button" onPress={() => weatherError ? void refreshWeather() : router.navigate('/weather')}
                    style={styles.heroButton}>
                    <Text style={styles.heroButtonText}>{weatherError ? 'Try again' : 'Get local weather'}</Text>
                    <Ionicons name="arrow-forward" size={16} color="#5A50DB" />
                  </Pressable>
                ) : null}
              </View>
            )}
          </View>
          <View style={styles.heroDecoration}>
            <Ionicons name={weather?.description?.toLowerCase().includes('rain') ? 'rainy-outline' : 'sunny-outline'} size={74} color="rgba(255,255,255,0.18)" />
          </View>
        </LinearGradient>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Today at a glance</Text>
            <Text style={[styles.sectionSubtitle, { color: colors.muted }]}>Your plans, in one place</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={() => router.navigate('/tabs/schedule')} hitSlop={8}>
            <Text style={[styles.seeAll, { color: colors.primary }]}>See all</Text>
          </Pressable>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.navigate('/tabs/schedule')}
          style={[styles.agendaCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <View style={[styles.agendaIcon, { backgroundColor: colors.primarySoft }]}>
            <Ionicons name={nextSchedule ? 'time-outline' : 'checkmark-done-outline'} size={22} color={colors.primary} />
          </View>
          <View style={styles.agendaText}>
            <Text style={[styles.agendaKicker, { color: colors.muted }]}>{nextSchedule ? 'UP NEXT' : 'YOUR SCHEDULE'}</Text>
            <Text numberOfLines={1} style={[styles.agendaTitle, { color: colors.text }]}>
              {nextSchedule?.title ?? (todaySchedules.length ? 'You’re all caught up' : 'No plans added yet')}
            </Text>
            <Text style={[styles.agendaDetail, { color: colors.muted }]}>
              {nextSchedule
                ? new Date(nextSchedule.starts_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
                : todaySchedules.length ? `${completed} ${completed === 1 ? 'plan' : 'plans'} completed` : 'Tap to add your first plan'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>

        <MarketWatch market={market} loading={marketLoading} error={marketError} onRefresh={() => void refreshMarket()} />

        <View style={styles.sectionHeader}>
          <View>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Your money</Text>
            <Text style={[styles.sectionSubtitle, { color: colors.muted }]}>Daily budget, manual tracking & optional bank SMS</Text>
          </View>
        </View>
        <FinanceSummary />

      </ScrollView>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open application assistant"
        onPress={() => router.navigate('/applications')}
        style={[styles.assistantButton, { backgroundColor: colors.primary, borderColor: colors.background }]}
      >
        <Ionicons name="chatbubbles" size={24} color="#FFFFFF" />
        <View style={styles.assistantSparkle}>
          <Ionicons name="sparkles" size={12} color="#FFFFFF" />
        </View>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 32 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.35, marginBottom: 5 },
  greeting: { fontSize: 24, fontWeight: '800', letterSpacing: -0.6 },
  wave: { color: '#F4B544' },
  themeButton: { width: 44, height: 44, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  assistantButton: { position: 'absolute', right: 18, bottom: 84, width: 58, height: 58, borderRadius: 22, borderWidth: 3, alignItems: 'center', justifyContent: 'center', elevation: 7, shadowColor: '#000000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.22, shadowRadius: 6 },
  assistantSparkle: { position: 'absolute', right: 5, top: 4, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#7D61E8', borderWidth: 2, borderColor: '#FFFFFF' },
  hero: { minHeight: 220, borderRadius: 26, padding: 20, overflow: 'hidden', justifyContent: 'center' },
  heroContent: { zIndex: 1 },
  weatherHeroHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  weatherHeroLabel: { flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 },
  heroLabelText: { color: 'rgba(255,255,255,0.82)', fontSize: 10, letterSpacing: 1.15, fontWeight: '800' },
  weatherRefresh: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.16)' },
  weatherHeroMain: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, paddingRight: 8 },
  weatherHeroCopy: { flex: 1 },
  weatherHeroTemperature: { color: '#FFFFFF', fontSize: 50, lineHeight: 55, fontWeight: '300', letterSpacing: -2 },
  weatherHeroCondition: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', marginTop: 1 },
  weatherHeroTitle: { color: '#FFFFFF', fontSize: 24, fontWeight: '800', marginTop: 11 },
  heroSubtitle: { color: 'rgba(255,255,255,0.82)', fontSize: 12, marginTop: 5 },
  weatherHeroFooter: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.24)' },
  weatherHeroStat: { flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 },
  weatherHeroStatText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700', flexShrink: 1 },
  weatherReportButton: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  weatherEmpty: { alignItems: 'flex-start', paddingTop: 7 },
  heroButton: { backgroundColor: '#FFFFFF', borderRadius: 14, minHeight: 42, paddingHorizontal: 15, marginTop: 17, flexDirection: 'row', alignItems: 'center', gap: 9 },
  heroButtonText: { color: '#5148C7', fontSize: 12, fontWeight: '800' },
  heroDecoration: { position: 'absolute', right: 18, top: 26, transform: [{ rotate: '12deg' }] },
  heroOrbOne: { width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(255,255,255,0.09)', position: 'absolute', right: -35, bottom: -55 },
  heroOrbTwo: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.07)', position: 'absolute', right: 68, top: -42 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 25, marginBottom: 13 },
  sectionTitle: { fontSize: 17, fontWeight: '800', letterSpacing: -0.25 },
  sectionSubtitle: { fontSize: 11, marginTop: 3 },
  seeAll: { fontSize: 12, fontWeight: '700', paddingVertical: 8 },
  agendaCard: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 19, borderWidth: 1, gap: 12 },
  agendaIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  agendaText: { flex: 1 },
  agendaKicker: { fontSize: 9, fontWeight: '800', letterSpacing: 1, marginBottom: 4 },
  agendaTitle: { fontSize: 14, fontWeight: '700' },
  agendaDetail: { fontSize: 11, marginTop: 3 },
});
