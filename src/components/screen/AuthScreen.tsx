import { Ionicons } from '@expo/vector-icons';
import {
  createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail,
  signInWithEmailAndPassword, signOut,
} from 'firebase/auth';
import { useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth, isFirebaseConfigured } from '@/config/firebase';
import { useAppTheme } from '@/state/ThemeProvider';

function friendlyAuthError(error: unknown) {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) {
    return 'Email or password is incorrect.';
  }
  if (code.includes('email-already-in-use')) return 'An account already exists for this email.';
  if (code.includes('weak-password')) return 'Choose a stronger password (at least 8 characters).';
  if (code.includes('invalid-email')) return 'Enter a valid email address.';
  if (code.includes('too-many-requests')) return 'Too many attempts. Wait a while and try again.';
  return error instanceof Error ? error.message : 'Unable to complete sign-in. Try again.';
}

export default function AuthScreen() {
  const { colors } = useAppTheme();
  const [mode, setMode] = useState<'sign-in' | 'sign-up' | 'reset'>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const submit = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    setMessage('');
    setError('');
    if (!normalizedEmail || (mode !== 'reset' && password.length < 8)) {
      setError(mode === 'reset' ? 'Enter your account email.' : 'Enter your email and a password with at least 8 characters.');
      return;
    }
    if (!auth) {
      setError('Firebase Authentication is not configured. Set the public Firebase values in Hello-app/.env and restart Expo.');
      return;
    }

    setBusy(true);
    try {
      if (mode === 'reset') {
        await sendPasswordResetEmail(auth, normalizedEmail);
        setMessage('If an account exists for that email, a password reset message has been sent.');
      } else if (mode === 'sign-up') {
        const credential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
        try {
          await sendEmailVerification(credential.user);
        } finally {
          await signOut(auth);
        }
        setMessage('Check your inbox to verify your email, then sign in.');
        setMode('sign-in');
        setPassword('');
      } else {
        const credential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
        if (!credential.user.emailVerified) {
          await sendEmailVerification(credential.user);
          await signOut(auth);
          setError('Verify your email first. We sent a new verification link.');
          return;
        }
      }
    } catch (failure) {
      setError(friendlyAuthError(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={[styles.brandIcon, { backgroundColor: colors.primarySoft }]}>
            <Ionicons name="leaf-outline" size={30} color={colors.primary} />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>Daily Life</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>
            {isFirebaseConfigured ? 'Sign in to keep your planner private and in sync.' : 'Account sign-in must be configured before using the app.'}
          </Text>
          {!isFirebaseConfigured ? (
            <View style={[styles.configCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.label, { color: colors.text }]}>Firebase setup required</Text>
              <Text style={[styles.configText, { color: colors.muted }]}>
                Create a Firebase project, enable Email/Password Authentication, add an Android/iOS app as needed, then copy the Firebase web app configuration to the EXPO_PUBLIC_FIREBASE_* values in Hello-app/.env. The server also needs a Firebase Admin service account.
              </Text>
              <Text style={[styles.configText, { color: colors.muted }]}>These Firebase client settings identify the project; never put a service-account private key in the app.</Text>
            </View>
          ) : (
            <View style={[styles.form, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.formTitle, { color: colors.text }]}>
                {mode === 'sign-up' ? 'Create your account' : mode === 'reset' ? 'Reset password' : 'Welcome back'}
              </Text>
              <Text style={[styles.label, { color: colors.text }]}>Email</Text>
              <TextInput accessibilityLabel="Email" value={email} onChangeText={setEmail} autoCapitalize="none"
                autoComplete="email" keyboardType="email-address" textContentType="emailAddress"
                placeholder="you@example.com" placeholderTextColor={colors.muted}
                style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceAlt, borderColor: colors.border }]} />
              {mode !== 'reset' ? (
                <>
                  <Text style={[styles.label, { color: colors.text }]}>Password</Text>
                  <TextInput accessibilityLabel="Password" value={password} onChangeText={setPassword} secureTextEntry
                    autoComplete={mode === 'sign-up' ? 'new-password' : 'password'}
                    textContentType={mode === 'sign-up' ? 'newPassword' : 'password'}
                    placeholder="At least 8 characters" placeholderTextColor={colors.muted}
                    style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceAlt, borderColor: colors.border }]} />
                </>
              ) : null}
              {error ? <Text accessibilityRole="alert" style={[styles.feedback, { color: colors.red }]}>{error}</Text> : null}
              {message ? <Text accessibilityRole="alert" style={[styles.feedback, { color: colors.green }]}>{message}</Text> : null}
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => void submit()}
                style={[styles.submitButton, { backgroundColor: colors.primary, opacity: busy ? 0.7 : 1 }]}>
                {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitText}>{mode === 'sign-up' ? 'Create account' : mode === 'reset' ? 'Send reset email' : 'Sign in'}</Text>}
              </Pressable>
              {mode === 'sign-in' ? (
                <Pressable accessibilityRole="button" onPress={() => { setMode('reset'); setError(''); setMessage(''); }}>
                  <Text style={[styles.link, { color: colors.primary }]}>Forgot password?</Text>
                </Pressable>
              ) : null}
              <Pressable accessibilityRole="button" onPress={() => { setMode(mode === 'sign-up' ? 'sign-in' : 'sign-up'); setError(''); setMessage(''); }}>
                <Text style={[styles.link, { color: colors.primary }]}>{mode === 'sign-up' ? 'Already have an account? Sign in' : 'New here? Create an account'}</Text>
              </Pressable>
              {mode === 'reset' ? (
                <Pressable accessibilityRole="button" onPress={() => { setMode('sign-in'); setError(''); setMessage(''); }}>
                  <Text style={[styles.link, { color: colors.muted }]}>Back to sign in</Text>
                </Pressable>
              ) : null}
            </View>
          )}
          <Text style={[styles.privacy, { color: colors.muted }]}>Account credentials are handled by Firebase Authentication. Planner data is scoped to your account. Your Private Vault stays only on this device.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24, maxWidth: 520, width: '100%', alignSelf: 'center' },
  brandIcon: { width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 14 },
  title: { fontSize: 30, fontWeight: '900', textAlign: 'center', letterSpacing: -0.7 },
  subtitle: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 7, marginBottom: 22 },
  form: { padding: 19, borderWidth: 1, borderRadius: 20 },
  formTitle: { fontSize: 19, fontWeight: '800', marginBottom: 16 },
  label: { fontSize: 12, fontWeight: '700', marginBottom: 6 },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, marginBottom: 14 },
  feedback: { fontSize: 12, lineHeight: 17, marginBottom: 10 },
  submitButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 13, marginTop: 4 },
  submitText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  link: { fontSize: 12, fontWeight: '700', textAlign: 'center', paddingTop: 16 },
  privacy: { fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 20 },
  configCard: { padding: 18, borderWidth: 1, borderRadius: 18 },
  configText: { fontSize: 12, lineHeight: 18, marginTop: 9 },
});
