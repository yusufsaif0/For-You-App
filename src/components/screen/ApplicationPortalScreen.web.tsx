import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '@/state/ThemeProvider';
import {
  discardApplicationPortalSession,
  getApplicationPortalSession,
} from '@/services/application-portal-session';

export default function ApplicationPortalScreen() {
  const { colors } = useAppTheme();
  const { sessionId } = useLocalSearchParams<{ sessionId?: string }>();
  const [session] = useState(() => getApplicationPortalSession(sessionId ?? '') ?? null);
  const [error, setError] = useState('');

  useEffect(() => () => {
    if (sessionId) discardApplicationPortalSession(sessionId);
  }, [sessionId]);

  const openPortal = async () => {
    if (!session) return;
    try {
      await Linking.openURL(session.url);
    } catch {
      setError('Could not open the portal. Check that a browser is available and try again.');
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to application assistant"
          onPress={() => router.back()} style={[styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </Pressable>
        <View>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>Continue on portal</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>Web guided handoff</Text>
        </View>
      </View>
      <View style={styles.content}>
        <Ionicons name="shield-checkmark-outline" size={32} color={colors.primary} />
        <Text style={[styles.heading, { color: colors.text }]}>Review the official portal yourself</Text>
        <Text style={[styles.body, { color: colors.muted }]}>
          Web browsers cannot safely expose arbitrary portal forms to this assistant. The portal opens in a separate tab; your reviewed draft values are not shared automatically. Enter details, complete any verification, and submit only after checking the portal’s terms and every answer.
        </Text>
        {session ? (
          <Text selectable style={[styles.url, { color: colors.primary }]}>{new URL(session.url).host}</Text>
        ) : (
          <Text style={[styles.body, { color: colors.red }]}>This temporary portal session expired. Return to the assistant and try again.</Text>
        )}
        {error ? <Text accessibilityRole="alert" style={[styles.body, { color: colors.red }]}>{error}</Text> : null}
        {session ? (
          <Pressable accessibilityRole="link" onPress={() => void openPortal()}
            style={[styles.openButton, { backgroundColor: colors.primary }]}>
            <Ionicons name="open-outline" size={18} color="#FFFFFF" />
            <Text style={styles.openText}>Open official portal</Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 15, borderBottomWidth: StyleSheet.hairlineWidth },
  backButton: { width: 38, height: 38, borderWidth: 1, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '800' },
  subtitle: { fontSize: 11, marginTop: 2 },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 14 },
  heading: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  body: { maxWidth: 540, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  url: { fontSize: 15, fontWeight: '700' },
  openButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 14, paddingHorizontal: 20, marginTop: 6 },
  openText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
});
