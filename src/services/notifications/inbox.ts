import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const INBOX_KEY = 'daily-life-notification-inbox';
const MAX_HISTORY_ITEMS = 100;
let updateQueue: Promise<void> = Promise.resolve();

export interface NotificationInboxItem {
  id: string;
  title: string;
  body: string;
  receivedAt: string;
  isRead: boolean;
  isScheduled: boolean;
  owner?: string;
  key?: string;
}

function parseInbox(value: string | null): NotificationInboxItem[] {
  if (!value) return [];
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || parsed.some((item) =>
    typeof item !== 'object' || item === null ||
    !('id' in item) || typeof item.id !== 'string' ||
    !('title' in item) || typeof item.title !== 'string' ||
    !('body' in item) || typeof item.body !== 'string' ||
    !('receivedAt' in item) || typeof item.receivedAt !== 'string' ||
    !('isRead' in item) || typeof item.isRead !== 'boolean' ||
    !('isScheduled' in item) || typeof item.isScheduled !== 'boolean'
  )) {
    throw new Error('Saved notification inbox data is invalid.');
  }
  return parsed as NotificationInboxItem[];
}

function notificationItem(notification: Notifications.Notification): NotificationInboxItem {
  const content = notification.request.content;
  const data = content.data ?? {};
  return {
    id: notification.request.identifier,
    title: content.title ?? 'Daily Life notification',
    body: content.body ?? '',
    receivedAt: notification.date ? new Date(notification.date).toISOString() : new Date().toISOString(),
    isRead: false,
    isScheduled: false,
    ...(typeof data.owner === 'string' ? { owner: data.owner } : {}),
    ...(typeof data.key === 'string' ? { key: data.key } : {}),
  };
}

async function updateHistory(update: (items: NotificationInboxItem[]) => NotificationInboxItem[]) {
  const next = updateQueue.then(async () => {
    const items = parseInbox(await AsyncStorage.getItem(INBOX_KEY));
    await AsyncStorage.setItem(INBOX_KEY, JSON.stringify(update(items).slice(0, MAX_HISTORY_ITEMS)));
  });
  updateQueue = next.catch((failure: unknown) => {
    console.error('Unable to update notification inbox:', failure);
  });
  return next;
}

export function recordNotification(notification: Notifications.Notification) {
  const item = notificationItem(notification);
  return updateHistory((items) => [
    { ...item, isRead: items.find((saved) => saved.id === item.id)?.isRead ?? false },
    ...items.filter((saved) => saved.id !== item.id),
  ]);
}

export async function markNotificationRead(id: string) {
  await updateHistory((items) => items.map((item) => item.id === id ? { ...item, isRead: true } : item));
}

export async function markAllNotificationsRead() {
  await updateHistory((items) => items.map((item) => ({ ...item, isRead: true })));
}

function scheduledItem(notification: Notifications.NotificationRequest): NotificationInboxItem {
  const content = notification.content;
  const data = content.data ?? {};
  return {
    id: `scheduled:${notification.identifier}`,
    title: content.title ?? 'Daily Life reminder',
    body: content.body ?? '',
    receivedAt: '',
    isRead: true,
    isScheduled: true,
    ...(typeof data.owner === 'string' ? { owner: data.owner } : {}),
    ...(typeof data.key === 'string' ? { key: data.key } : {}),
  };
}

export async function getNotificationInbox(): Promise<NotificationInboxItem[]> {
  await updateQueue;
  const history = parseInbox(await AsyncStorage.getItem(INBOX_KEY));
  if (Platform.OS === 'web') return history;
  const [presented, scheduled] = await Promise.all([
    Notifications.getPresentedNotificationsAsync(),
    Notifications.getAllScheduledNotificationsAsync(),
  ]);
  const recent = presented.map(notificationItem);
  const merged = new Map<string, NotificationInboxItem>();
  for (const item of [...recent, ...history]) {
    const saved = history.find((entry) => entry.id === item.id);
    merged.set(item.id, { ...item, isRead: saved?.isRead ?? item.isRead });
  }
  const historyItems = [...merged.values()].sort((left, right) =>
    Date.parse(right.receivedAt) - Date.parse(left.receivedAt),
  );
  return [...historyItems, ...scheduled.map(scheduledItem)];
}
