import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/state/AuthProvider';
import { useAppTheme } from '@/state/ThemeProvider';
import { goBackOrHome } from '@/services/navigation';

export default function AccountScreen() {
  const { colors } = useAppTheme();
  const { user, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const leaveAccount = async () => {
    setBusy(true);
    setError('');
    try {
      await signOut();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to sign out.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={goBackOrHome} style={[styles.back, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="arrow-back" size={21} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Account</Text>
      </View>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.avatar, { backgroundColor: colors.primarySoft }]}>
          <Ionicons name="person-outline" size={28} color={colors.primary} />
        </View>
        <Text style={[styles.email, { color: colors.text }]}>{user?.email ?? 'Signed in'}</Text>
        <Text style={[styles.caption, { color: colors.muted }]}>Email verified · planner data is scoped to this account.</Text>
        {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.red }]}>{error}</Text> : null}
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => void leaveAccount()} style={[styles.signOut, { backgroundColor: colors.primary }]}>
          {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.signOutText}>Sign out</Text>}
        </Pressable>
      </View>
      <Text style={[styles.privacy, { color: colors.muted }]}>Signing out locks the Private Vault. Its contents stay encrypted and stored only on this device.</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 10 },
  back: { width: 42, height: 42, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 21, fontWeight: '800' },
  card: { margin: 20, borderWidth: 1, borderRadius: 22, padding: 22, alignItems: 'center' },
  avatar: { width: 60, height: 60, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  email: { fontSize: 17, fontWeight: '800', textAlign: 'center' },
  caption: { fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 5 },
  signOut: { minHeight: 46, alignSelf: 'stretch', borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  signOutText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  error: { fontSize: 12, marginTop: 12 },
  privacy: { fontSize: 11, lineHeight: 16, textAlign: 'center', marginHorizontal: 24 },
});
