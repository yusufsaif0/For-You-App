import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { MarketQuotesResponse } from '@/services/api/market';
import { useAppTheme } from '@/state/ThemeProvider';

interface Props {
  market: MarketQuotesResponse | null;
  loading: boolean;
  error: string;
  onRefresh: () => void;
}

const instruments = {
  'NIFTY 50': { name: 'NIFTY 50', detail: 'Index · points', icon: 'stats-chart-outline', light: '#245AA8', dark: '#A8C7FA', lightSurface: '#EAF1FD', darkSurface: '#253249' },
  'GOLD / 10G': { name: 'Gold', detail: 'Per 10 g · estimate', icon: 'diamond-outline', light: '#8B6016', dark: '#F2C66D', lightSurface: '#FBF2DC', darkSurface: '#383022' },
  'SILVER / KG': { name: 'Silver', detail: 'Per kg · estimate', icon: 'layers-outline', light: '#536278', dark: '#C0CDDF', lightSurface: '#EDF1F6', darkSurface: '#2B3240' },
} as const;

export default function MarketWatch({ market, loading, error, onRefresh }: Props) {
  const { theme, colors } = useAppTheme();
  const { width, fontScale } = useWindowDimensions();
  const [cardWidth, setCardWidth] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const innerWidth = Math.max((cardWidth || width - 40) - 32, 1);
  const compact = innerWidth < 290 * fontScale;
  const quotes = market?.quotes ?? [];
  const primaryQuote = quotes.find((quote) => quote.symbol === 'NIFTY 50') ?? quotes[0];
  const visibleQuotes = expanded ? quotes : primaryQuote ? [primaryQuote] : [];

  return <View style={styles.section}>
    <View style={styles.header}>
      <View style={styles.headerCopy}>
        <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>Market watch</Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>{market?.is_stale ? 'Saved quotes' : 'Updates every 5 min'}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Refresh market quotes" accessibilityState={{ disabled: loading, busy: loading }}
        disabled={loading} onPress={onRefresh}
        style={({ pressed }) => [styles.refresh, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]}>
        {loading ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="refresh-outline" size={19} color={colors.primary} />}
      </Pressable>
    </View>
    <View onLayout={(event) => setCardWidth(event.nativeEvent.layout.width)} style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {visibleQuotes.map((item, index) => {
        const instrument = instruments[item.symbol];
        const value = item.symbol === 'NIFTY 50'
          ? item.price.toLocaleString('en-IN', { maximumFractionDigits: 2 })
          : `₹${item.price.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
        const unchanged = item.change_percent === 0;
        const positive = item.change_percent > 0;
        const changeColor = unchanged ? colors.muted : positive
          ? theme === 'dark' ? colors.green : '#13734B'
          : theme === 'dark' ? colors.red : '#B3261E';
        const change = `${positive ? '+' : ''}${item.change_percent.toFixed(2)}%`;
        const time = new Date(item.updated_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
        const longValue = value.length > 13 || (value.length * 14 + change.length * 8 + 40) * fontScale > innerWidth;
        const stacked = compact || longValue;
        const valueWidth = stacked ? innerWidth : innerWidth * 0.45;
        return <View key={item.symbol} style={[styles.quote, { borderTopColor: colors.border }, index > 0 && styles.quoteBorder, stacked && styles.stackedQuote]}>
          <View style={styles.instrument}>
            <View style={[styles.icon, { backgroundColor: theme === 'dark' ? instrument.darkSurface : instrument.lightSurface }]}>
              <Ionicons name={instrument.icon} size={20} color={theme === 'dark' ? instrument.dark : instrument.light} />
            </View>
            <View style={styles.instrumentCopy}>
              <Text style={[styles.name, { color: colors.text }]}>{instrument.name}</Text>
              <Text style={[styles.detail, { color: colors.muted }]}>{instrument.detail}</Text>
              <Text accessibilityLabel={`Quote updated at ${time}`} style={[styles.timestamp, { color: colors.muted }]}>{time}</Text>
            </View>
          </View>
          <View style={[styles.pricing, stacked && styles.stackedPricing, longValue && styles.longPricing]}>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}
              accessibilityLabel={`${item.symbol}: ${value}, ${item.unit}`}
              style={[styles.value, { color: colors.text, fontSize: Math.min(21, valueWidth / (value.length * 0.7 * fontScale)) }]}>{value}</Text>
            <View accessibilityLabel={`${change} today`} style={[styles.changeBadge, { backgroundColor: `${changeColor}16` }]}>
              <Ionicons name={unchanged ? 'remove' : positive ? 'arrow-up' : 'arrow-down'} size={12} color={changeColor} />
              <Text style={[styles.change, { color: changeColor }]}>{change}</Text>
            </View>
          </View>
        </View>;
      })}
      {loading && !market ? <View style={styles.empty}>
        <ActivityIndicator color={colors.primary} />
        <Text accessibilityLiveRegion="polite" style={[styles.emptyCopy, { color: colors.muted }]}>Fetching the latest quotes…</Text>
      </View> : null}
      {error ? <View style={[styles.error, { borderTopColor: colors.border }, market && styles.quoteBorder]}>
        <Ionicons name="cloud-offline-outline" size={23} color={colors.muted} />
        <Text accessibilityRole="alert" style={[styles.errorTitle, { color: colors.text }]}>{market ? 'Couldn’t update quotes' : 'Quotes unavailable'}</Text>
        <Text style={[styles.emptyCopy, { color: colors.muted }]}>{error}{market ? ' Showing your last loaded quotes.' : ''}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Retry market quotes" disabled={loading} onPress={onRefresh} style={styles.retry}>
          <Text style={[styles.retryText, { color: colors.primary }]}>Try again</Text>
        </Pressable>
      </View> : null}
      {market ? <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <View style={styles.sourceRow}>
          <Text style={[styles.source, { color: colors.muted }]}>{market.quotes[0]?.source ?? 'Yahoo Finance'}</Text>
          <Text style={[styles.source, { color: colors.muted }]}>Daily change %</Text>
        </View>
        {market.is_stale ? <Text style={[styles.stale, { color: colors.red }]}>Cached quotes. The provider is temporarily unavailable.</Text> : null}
        <Text style={[styles.disclaimer, { color: colors.muted }]}>{expanded
          ? 'Quotes may be delayed. Gold and silver are COMEX futures estimates in INR, not local retail rates.'
          : 'Quotes may be delayed.'}</Text>
        {quotes.length > 1 ? <Pressable accessibilityRole="button"
          accessibilityLabel={expanded ? 'Collapse market watch' : 'Expand market watch'} accessibilityState={{ expanded }} aria-expanded={expanded}
          onPress={() => setExpanded((current) => !current)}
          style={({ pressed }) => [styles.expandButton, { borderTopColor: colors.border }, pressed && styles.pressed]}>
          <Text style={[styles.expandText, { color: colors.primary }]}>{expanded ? 'Show less' : 'Show more'}</Text>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.primary} />
        </Pressable> : null}
      </View> : null}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  section: { marginTop: 25 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  headerCopy: { flex: 1, minWidth: 0 },
  heading: { fontSize: 19, fontWeight: '600', letterSpacing: -0.5 },
  subtitle: { fontSize: 11, marginTop: 4 },
  refresh: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, borderWidth: 1 },
  panel: { borderRadius: 22, borderWidth: 1, paddingHorizontal: 16 },
  quote: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 20 },
  quoteBorder: { borderTopWidth: 1 },
  stackedQuote: { flexDirection: 'column', alignItems: 'stretch', gap: 14 },
  instrument: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 11 },
  icon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  instrumentCopy: { flex: 1, minWidth: 0 },
  name: { fontSize: 14, fontWeight: '600' },
  detail: { fontSize: 10, lineHeight: 15, marginTop: 3 },
  timestamp: { fontSize: 10, marginTop: 3 },
  pricing: { maxWidth: '50%', alignItems: 'flex-end', gap: 7 },
  stackedPricing: { maxWidth: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  longPricing: { flexDirection: 'column', alignItems: 'flex-start' },
  value: { flexShrink: 1, fontWeight: '600', letterSpacing: -0.4, fontVariant: ['tabular-nums'] },
  changeBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 5, borderRadius: 7, flexShrink: 0 },
  change: { fontSize: 11, fontWeight: '600', fontVariant: ['tabular-nums'] },
  footer: { borderTopWidth: 1, paddingTop: 13, paddingBottom: 16 },
  sourceRow: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  source: { fontSize: 10, fontWeight: '500' },
  disclaimer: { fontSize: 10, lineHeight: 16, marginTop: 8 },
  expandButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderTopWidth: 1, marginTop: 12, marginBottom: -8 },
  expandText: { fontSize: 12, fontWeight: '600' },
  stale: { fontSize: 11, lineHeight: 17, marginTop: 8 },
  empty: { minHeight: 150, alignItems: 'center', justifyContent: 'center', gap: 14, paddingVertical: 24 },
  emptyCopy: { fontSize: 12, lineHeight: 19, textAlign: 'center' },
  error: { alignItems: 'center', paddingVertical: 24, gap: 9 },
  errorTitle: { fontSize: 15, fontWeight: '600', textAlign: 'center' },
  retry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 },
  retryText: { fontSize: 13, fontWeight: '600' },
  pressed: { opacity: 0.65 },
});
