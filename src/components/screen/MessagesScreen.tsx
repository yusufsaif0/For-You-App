import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator, AppState, Modal, Platform, Pressable,
  RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  clearCapturedMessages, deleteCapturedMessage, getCapturedMessages,
  hasMessageNotificationAccess, isMessageCaptureAvailable, openMessageNotificationSettings,
  type CapturedMessage,
} from '@/services/message-capture';
import { useAppTheme } from '@/state/ThemeProvider';

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  });
}

function appIcon(appName: string): keyof typeof Ionicons.glyphMap {
  if (appName === 'WhatsApp') return 'logo-whatsapp';
  if (appName === 'Instagram') return 'logo-instagram';
  if (appName === 'Facebook') return 'logo-facebook';
  return 'chatbubble-ellipses-outline';
}

export default function MessagesScreen() {
  const { colors } = useAppTheme();
  const [messages, setMessages] = useState<CapturedMessage[]>([]);
  const [accessEnabled, setAccessEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<CapturedMessage | 'all' | null>(null);
  const available = isMessageCaptureAvailable();

  const refresh = useCallback(async (isPull = false) => {
    if (isPull) setRefreshing(true);
    setError('');
    try {
      if (!available) {
        setAccessEnabled(false);
        setMessages([]);
        return;
      }
      const [hasAccess, saved] = await Promise.all([
        hasMessageNotificationAccess(),
        getCapturedMessages(),
      ]);
      setAccessEnabled(hasAccess);
      setMessages(saved);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not load saved message notifications.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [available]);

  useFocusEffect(useCallback(() => {
    void refresh();
    if (!available) return undefined;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    const interval = setInterval(() => void refresh(), 5_000);
    return () => {
      subscription.remove();
      clearInterval(interval);
    };
  }, [available, refresh]));

  const enableAccess = async () => {
    setError('');
    try {
      await openMessageNotificationSettings();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not open Android Notification Access settings.');
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    setError('');
    try {
      if (deleteTarget === 'all') {
        await clearCapturedMessages();
        setMessages([]);
      } else {
        await deleteCapturedMessage(deleteTarget.id);
        setMessages((previous) => previous.filter((message) => message.id !== deleteTarget.id));
      }
      setDeleteTarget(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not delete the saved message.');
    } finally {
      setBusy(false);
    }
  };

  const renderMessage = (item: CapturedMessage) => (
    <View key={item.id} style={[styles.messageCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.messageHeading}>
        <View style={[styles.appIcon, { backgroundColor: colors.primarySoft }]}>
          <Ionicons name={appIcon(item.appName)} size={19} color={colors.primary} />
        </View>
        <View style={styles.messageHeadingCopy}>
          <Text style={[styles.appName, { color: colors.text }]}>{item.appName}</Text>
          <Text style={[styles.messageDate, { color: colors.muted }]}>{formatDate(item.postedAt)}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Delete message from ${item.appName}`}
          onPress={() => setDeleteTarget(item)} hitSlop={8} style={styles.deleteButton}>
          <Ionicons name="trash-outline" size={19} color={colors.muted} />
        </Pressable>
      </View>
      <Text style={[styles.sender, { color: colors.text }]}>{item.title}</Text>
      <Text selectable style={[styles.messageBody, { color: colors.muted }]}>{item.message}</Text>
    </View>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={[styles.headerIcon, { backgroundColor: colors.primarySoft }]}>
          <Ionicons name="chatbubble-ellipses" size={22} color={colors.primary} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: colors.text }]}>Messages</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>Notification previews saved on this device</Text>
        </View>
        {messages.length > 0 ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Delete all saved message notifications"
            onPress={() => setDeleteTarget('all')} style={styles.headerAction}>
            <Ionicons name="trash-outline" size={20} color={colors.red} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh(true)} tintColor={colors.primary} />}
      >
        <View style={[styles.privacyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="lock-closed-outline" size={19} color={colors.primary} />
          <Text style={[styles.privacyText, { color: colors.muted }]}>
            Captures are stored locally in this app’s private Android storage and are not uploaded. Notification Access can expose notification previews from any app to this app; Daily Life only saves previews from WhatsApp, Instagram, Facebook, and Messenger. Turn access off in Android Settings whenever you like.
          </Text>
        </View>

        {Platform.OS !== 'android' ? (
          <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="phone-portrait-outline" size={26} color={colors.primary} />
            <Text style={[styles.infoTitle, { color: colors.text }]}>Android only</Text>
            <Text style={[styles.infoBody, { color: colors.muted }]}>iOS does not allow apps to read other apps’ notifications.</Text>
          </View>
        ) : !available ? (
          <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="construct-outline" size={26} color={colors.primary} />
            <Text style={[styles.infoTitle, { color: colors.text }]}>Android app build required</Text>
            <Text style={[styles.infoBody, { color: colors.muted }]}>Notification capture uses a native Android service and is not available in Expo Go. Build and install the Daily Life development app to use this feature.</Text>
          </View>
        ) : !accessEnabled ? (
          <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.infoIcon, { backgroundColor: colors.primarySoft }]}>
              <Ionicons name="notifications-outline" size={28} color={colors.primary} />
            </View>
            <Text style={[styles.infoTitle, { color: colors.text }]}>Allow notification access</Text>
            <Text style={[styles.infoBody, { color: colors.muted }]}>
              Android requires you to grant Notification Access in Settings. Daily Life will start capturing new message previews only after access is enabled. It cannot retrieve older notifications or full chat histories.
            </Text>
            <Pressable accessibilityRole="button" onPress={() => void enableAccess()}
              style={[styles.enableButton, { backgroundColor: colors.primary }]}>
              <Text style={styles.enableButtonText}>Open Notification Access settings</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={[styles.accessBanner, { backgroundColor: colors.primarySoft }]}>
              <Ionicons name="radio-button-on" size={16} color={colors.green} />
              <Text style={[styles.accessText, { color: colors.text }]}>Notification capture is enabled</Text>
              <Pressable accessibilityRole="button" onPress={() => void enableAccess()}>
                <Text style={[styles.settingsLink, { color: colors.primary }]}>Settings</Text>
              </Pressable>
            </View>
            {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.red }]}>{error}</Text> : null}
            {loading ? <ActivityIndicator style={styles.loader} color={colors.primary} /> : messages.length > 0 ? (
              <View style={styles.messageList}>{messages.map(renderMessage)}</View>
            ) : (
              <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={[styles.infoIcon, { backgroundColor: colors.primarySoft }]}>
                  <Ionicons name="chatbubbles-outline" size={28} color={colors.primary} />
                </View>
                <Text style={[styles.infoTitle, { color: colors.text }]}>No captured messages yet</Text>
                <Text style={[styles.infoBody, { color: colors.muted }]}>New notifications from WhatsApp, Instagram, Facebook, and Messenger will appear here if message previews are enabled in those apps.</Text>
              </View>
            )}
          </>
        )}
        {error && (!available || !accessEnabled) ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.red }]}>{error}</Text> : null}
      </ScrollView>

      <Modal transparent visible={deleteTarget !== null} animationType="fade" onRequestClose={() => !busy && setDeleteTarget(null)}>
        <View style={styles.modalShade}>
          <View style={[styles.confirmCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.confirmTitle, { color: colors.text }]}>
              {deleteTarget === 'all' ? 'Delete all saved previews?' : 'Delete this saved preview?'}
            </Text>
            <Text style={[styles.confirmBody, { color: colors.muted }]}>
              This removes the captured notification from this device. It will not delete the original message in its app.
            </Text>
            <View style={styles.confirmActions}>
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => setDeleteTarget(null)}
                style={[styles.cancelButton, { borderColor: colors.border }]}>
                <Text style={[styles.cancelText, { color: colors.text }]}>Cancel</Text>
              </Pressable>
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => void confirmDelete()}
                style={[styles.deleteConfirm, { backgroundColor: colors.red }]}>
                {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.deleteText}>Delete</Text>}
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
  header: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 18, paddingVertical: 13 },
  headerIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, minWidth: 0 },
  title: { fontSize: 22, fontWeight: '800' },
  subtitle: { fontSize: 11, marginTop: 3 },
  headerAction: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 16, paddingBottom: 30, gap: 13 },
  privacyCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 13, borderRadius: 15, borderWidth: 1 },
  privacyText: { flex: 1, fontSize: 11, lineHeight: 17 },
  infoCard: { alignItems: 'center', padding: 22, borderRadius: 18, borderWidth: 1, gap: 10 },
  infoIcon: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
  infoTitle: { fontSize: 17, fontWeight: '800', textAlign: 'center' },
  infoBody: { fontSize: 12, lineHeight: 18, textAlign: 'center' },
  enableButton: { minHeight: 46, borderRadius: 13, paddingHorizontal: 17, alignItems: 'center', justifyContent: 'center', marginTop: 3 },
  enableButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  accessBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 13 },
  accessText: { flex: 1, fontSize: 12, fontWeight: '700' },
  settingsLink: { fontSize: 12, fontWeight: '700', padding: 4 },
  error: { fontSize: 12, lineHeight: 18 },
  loader: { marginTop: 30 },
  messageList: { gap: 10 },
  messageCard: { borderWidth: 1, borderRadius: 16, padding: 14 },
  messageHeading: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  appIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  messageHeadingCopy: { flex: 1, minWidth: 0 },
  appName: { fontSize: 12, fontWeight: '800' },
  messageDate: { fontSize: 10, marginTop: 2 },
  deleteButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  sender: { fontSize: 14, fontWeight: '700', marginTop: 12 },
  messageBody: { fontSize: 13, lineHeight: 19, marginTop: 5 },
  modalShade: { flex: 1, backgroundColor: '#00000066', justifyContent: 'center', padding: 20 },
  confirmCard: { borderRadius: 18, padding: 20, gap: 11 },
  confirmTitle: { fontSize: 18, fontWeight: '800' },
  confirmBody: { fontSize: 13, lineHeight: 19 },
  confirmActions: { flexDirection: 'row', gap: 10, marginTop: 5 },
  cancelButton: { flex: 1, minHeight: 44, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 13, fontWeight: '700' },
  deleteConfirm: { flex: 1, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  deleteText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
});
