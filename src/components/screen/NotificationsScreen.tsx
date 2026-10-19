import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  getNotificationInbox, markAllNotificationsRead, markNotificationRead,
  type NotificationInboxItem,
} from '@/services/notifications/inbox';
import { useAppTheme } from '@/state/ThemeProvider';

function destination(item: NotificationInboxItem) {
  if (item.owner === 'schedule') return '/tabs/schedule';
  if (item.owner?.startsWith('family-tasks-')) return '/family';
  if (item.owner === 'wishes') return '/tabs/wishes';
  if (item.owner === 'task') return '/tasks';
  if (item.owner === 'event') return '/events';
  return null;
}

function displayDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Recently received' : date.toLocaleString();
}

export default function NotificationsScreen() {
  const { colors } = useAppTheme();
  const [items, setItems] = useState<NotificationInboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const unreadCount = items.filter((item) => !item.isScheduled && !item.isRead).length;

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setItems(await getNotificationInbox());
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not load notifications.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/tabs');
  };

  const openNotification = async (item: NotificationInboxItem) => {
    try {
      if (!item.isScheduled) {
        await markNotificationRead(item.id);
        setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, isRead: true } : entry));
      }
      const route = destination(item);
      if (route) router.navigate(route);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not update this notification.');
    }
  };

  const markAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setItems((current) => current.map((item) => ({ ...item, isRead: true })));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not mark notifications as read.');
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={goBack}
          style={[styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="arrow-back" size={21} color={colors.text} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>Notifications</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>
            {unreadCount ? `${unreadCount} unread` : 'Your reminders and updates'}
          </Text>
        </View>
        {unreadCount > 0 ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Mark all notifications as read" onPress={() => void markAllRead()}>
            <Text style={[styles.markRead, { color: colors.primary }]}>Mark all read</Text>
          </Pressable>
        ) : null}
      </View>

      {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.red }]}>{error}</Text> : null}
      {loading ? <ActivityIndicator style={styles.loading} color={colors.primary} /> : (
        <ScrollView contentContainerStyle={styles.content}>
          {items.length === 0 ? (
            <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.primarySoft }]}>
                <Ionicons name="notifications-outline" size={28} color={colors.primary} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>You’re all caught up</Text>
              <Text style={[styles.emptyText, { color: colors.muted }]}>Reminders and updates will appear here.</Text>
            </View>
          ) : items.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={`${item.isScheduled ? 'Upcoming' : item.isRead ? 'Read' : 'Unread'} notification: ${item.title}`}
              onPress={() => void openNotification(item)}
              style={({ pressed }) => [
                styles.item,
                { backgroundColor: colors.surface, borderColor: colors.border },
                !item.isRead && { backgroundColor: colors.primarySoft },
                pressed && styles.pressed,
              ]}
            >
              <View style={[styles.itemIcon, { backgroundColor: colors.surfaceAlt }]}>
                <Ionicons name={item.isScheduled ? 'time-outline' : 'notifications-outline'} size={20} color={colors.primary} />
              </View>
              <View style={styles.itemCopy}>
                <View style={styles.itemHeading}>
                  <Text style={[styles.itemTitle, { color: colors.text }]}>{item.title}</Text>
                  {!item.isRead ? <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} /> : null}
                </View>
                <Text style={[styles.itemBody, { color: colors.muted }]}>{item.body}</Text>
                <Text style={[styles.itemDate, { color: colors.muted }]}>
                  {item.isScheduled ? 'Upcoming reminder' : displayDate(item.receivedAt)}
                </Text>
              </View>
              {destination(item) ? <Ionicons name="chevron-forward" size={18} color={colors.muted} /> : null}
            </Pressable>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 10 },
  backButton: { width: 40, height: 40, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, minWidth: 0 },
  title: { fontSize: 22, fontWeight: '800' },
  subtitle: { fontSize: 12, marginTop: 3 },
  markRead: { fontSize: 12, fontWeight: '700' },
  error: { paddingHorizontal: 18, paddingBottom: 8, fontSize: 13 },
  loading: { marginTop: 36 },
  content: { flexGrow: 1, padding: 16, gap: 10 },
  empty: { flex: 1, minHeight: 250, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 18, padding: 24 },
  emptyIcon: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '800', marginTop: 14 },
  emptyText: { fontSize: 13, marginTop: 6, textAlign: 'center' },
  item: { minHeight: 84, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 16, padding: 13 },
  itemIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  itemCopy: { flex: 1, minWidth: 0, gap: 4 },
  itemHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemTitle: { flex: 1, fontSize: 14, fontWeight: '700' },
  itemBody: { fontSize: 12, lineHeight: 17 },
  itemDate: { fontSize: 10, marginTop: 2 },
  unreadDot: { width: 8, height: 8, borderRadius: 4 },
  pressed: { opacity: 0.72 },
});
