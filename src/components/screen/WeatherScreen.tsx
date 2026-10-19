import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { aqiDescription, getLocalWeather, type LocalWeather } from '@/services/weather';
import { useAppTheme } from '@/state/ThemeProvider';

export default function WeatherScreen() {
  const { colors, theme } = useAppTheme();
  const [weather, setWeather] = useState<LocalWeather | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setWeather(await getLocalWeather());
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to load local weather.');
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => {
    if (weather) return;
    void load();
  }, [load, weather]));
  const air = aqiDescription(weather?.aqi ?? null);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={styles.back}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: colors.text }]}>Weather & air</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>Local conditions, at a glance</Text>
        </View>
        {weather ? <Pressable accessibilityRole="button" accessibilityLabel="Refresh weather" onPress={() => void load()} style={styles.refresh}>
          <Ionicons name="refresh-outline" size={21} color={colors.primary} />
        </Pressable> : null}
      </View>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={colors.primary} />}>
        <View style={styles.privacy}>
          <Ionicons name="location-outline" size={17} color={colors.primary} />
          <Text style={[styles.privacyText, { color: colors.muted }]}>
            Weather uses your approximate location to look up conditions with Open-Meteo. Location is not saved or sent to our backend.
          </Text>
        </View>
        {loading && !weather ? <ActivityIndicator size="large" color={colors.primary} style={styles.loader} /> : null}
        {error ? (
          <View style={[styles.errorCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="cloud-offline-outline" size={26} color={colors.red} />
            <Text accessibilityRole="alert" style={[styles.errorText, { color: colors.text }]}>{error}</Text>
            <View style={styles.errorActions}>
              <Pressable accessibilityRole="button" onPress={() => void load()} style={[styles.action, { backgroundColor: colors.primary }]}>
                <Text style={styles.actionText}>Try again</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => void Linking.openSettings()} style={styles.settingsAction}>
                <Text style={[styles.settingsText, { color: colors.primary }]}>Open settings</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
        {weather ? (
          <>
            <LinearGradient colors={theme === 'light' ? ['#5E75E8', '#7A89ED', '#94A3F4'] : ['#292F60', '#394275', '#4A5787']} style={styles.weatherHero}>
              <View style={styles.locationLine}>
                <Ionicons name="location" size={15} color="rgba(255,255,255,0.85)" />
                <Text style={styles.location}>{weather.city}</Text>
              </View>
              <View style={styles.heroMain}>
                <View>
                  <Text style={styles.temperature}>{Math.round(weather.temperature)}°</Text>
                  <Text style={styles.description}>{weather.description}</Text>
                  <Text style={styles.feels}>Feels like {Math.round(weather.feelsLike)}°</Text>
                </View>
                <Ionicons name="partly-sunny-outline" size={82} color="rgba(255,255,255,0.88)" />
              </View>
              <View style={styles.weatherStats}>
                <View style={styles.weatherStat}>
                  <Ionicons name="water-outline" size={16} color="#FFFFFF" />
                  <Text style={styles.weatherStatValue}>{weather.humidity}%</Text>
                  <Text style={styles.weatherStatLabel}>Humidity</Text>
                </View>
                <View style={styles.weatherDivider} />
                <View style={styles.weatherStat}>
                  <Ionicons name="navigate-outline" size={16} color="#FFFFFF" />
                  <Text style={styles.weatherStatValue}>{Math.round(weather.windSpeed)} km/h</Text>
                  <Text style={styles.weatherStatLabel}>Wind</Text>
                </View>
                <View style={styles.weatherDivider} />
                <View style={styles.weatherStat}>
                  <Ionicons name="time-outline" size={16} color="#FFFFFF" />
                  <Text style={styles.weatherStatValue}>Now</Text>
                  <Text style={styles.weatherStatLabel}>Updated</Text>
                </View>
              </View>
            </LinearGradient>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Air quality</Text>
              <Text style={[styles.provider, { color: colors.muted }]}>Open-Meteo</Text>
            </View>
            <View style={[styles.aqiCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.aqiIcon, { backgroundColor: `${air.color}20` }]}>
                <Ionicons name="leaf-outline" size={23} color={air.color} />
              </View>
              <View style={styles.aqiCopy}>
                <Text style={[styles.aqiLabel, { color: colors.muted }]}>US AIR QUALITY INDEX</Text>
                <Text style={[styles.aqiCategory, { color: air.color }]}>{air.label}</Text>
              </View>
              <Text style={[styles.aqiValue, { color: air.color }]}>{weather.aqi ?? '—'}</Text>
            </View>
            <View style={styles.pollutants}>
              <View style={[styles.pollutantCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.pollutantLabel, { color: colors.muted }]}>PM2.5</Text>
                <Text style={[styles.pollutantValue, { color: colors.text }]}>{weather.pm25 === null ? '—' : `${weather.pm25.toFixed(1)} μg/m³`}</Text>
              </View>
              <View style={[styles.pollutantCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.pollutantLabel, { color: colors.muted }]}>Source</Text>
                <Text style={[styles.pollutantValue, { color: colors.text }]}>Open-Meteo</Text>
              </View>
            </View>
            <Text style={[styles.disclaimer, { color: colors.muted }]}>Weather and air-quality values are estimates from Open-Meteo and may not reflect official local measurements.</Text>
          </>
        ) : null}
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
  privacy: { flexDirection: 'row', gap: 8, padding: 12, marginTop: 4, marginBottom: 14 },
  privacyText: { flex: 1, fontSize: 11, lineHeight: 17 },
  loader: { marginTop: 45 },
  errorCard: { borderWidth: 1, borderRadius: 20, padding: 18, gap: 12 },
  errorText: { fontSize: 13, lineHeight: 20 },
  errorActions: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  action: { minHeight: 42, paddingHorizontal: 15, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  actionText: { color: '#FFFFFF', fontWeight: '700' },
  settingsAction: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 9 },
  settingsText: { fontSize: 12, fontWeight: '700' },
  weatherHero: { borderRadius: 25, padding: 20, marginTop: 5 },
  locationLine: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  location: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  heroMain: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13 },
  temperature: { color: '#FFFFFF', fontSize: 60, lineHeight: 65, fontWeight: '300', letterSpacing: -3 },
  description: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', marginTop: 3 },
  feels: { color: 'rgba(255,255,255,0.8)', fontSize: 11, marginTop: 4 },
  weatherStats: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 13, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.24)' },
  weatherStat: { flex: 1, alignItems: 'center', gap: 4 },
  weatherStatValue: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  weatherStatLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 9 },
  weatherDivider: { width: 1, height: 34, backgroundColor: 'rgba(255,255,255,0.3)' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 11 },
  sectionTitle: { fontSize: 16, fontWeight: '800' },
  provider: { fontSize: 10 },
  aqiCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, borderRadius: 19, borderWidth: 1 },
  aqiIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  aqiCopy: { flex: 1 },
  aqiLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 0.6 },
  aqiCategory: { fontSize: 15, fontWeight: '800', marginTop: 4 },
  aqiValue: { fontSize: 22, fontWeight: '800' },
  pollutants: { flexDirection: 'row', gap: 10, marginTop: 10 },
  pollutantCard: { flex: 1, padding: 14, borderWidth: 1, borderRadius: 16 },
  pollutantLabel: { fontSize: 10, fontWeight: '700' },
  pollutantValue: { fontSize: 12, fontWeight: '800', marginTop: 6 },
  disclaimer: { fontSize: 10, lineHeight: 15, marginTop: 13 },
});
