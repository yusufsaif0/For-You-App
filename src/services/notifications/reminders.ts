import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { getWishProgress, localDateKey, type SavingsWish } from '@/services/wishes';

export interface ReminderItem {
  id: string;
  title: string;
  reminder_at?: string | null;
  starts_at?: string | null;
  due_at?: string | null;
  completed?: boolean;
}

const reminderKey = (owner: string, id: string) => `${owner}:${id}`;
let reconciliation: Promise<void> = Promise.resolve();

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

async function reconcile(owner: string, items: ReminderItem[]) {
  const reminders = items.filter((item) =>
    item.reminder_at && !item.completed && Number.isFinite(Date.parse(item.reminder_at)) &&
    Date.parse(item.reminder_at) > Date.now(),
  );
  if (Platform.OS === 'web') return reminders.length === 0;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const owned = scheduled.filter((notification) => notification.content.data?.owner === owner);
  const desired = new Map(reminders.map((item) => [reminderKey(owner, item.id), item]));

  for (const notification of owned) {
    const key = notification.content.data?.key;
    const item = typeof key === 'string' ? desired.get(key) : undefined;
    const trigger = notification.trigger;
    const triggerDate = trigger && 'type' in trigger && trigger.type === 'date' && 'date' in trigger
      ? trigger.date
      : undefined;
    if (!item || notification.content.body !== item.title ||
      !triggerDate ||
      new Date(triggerDate).getTime() !== Date.parse(item.reminder_at!)) {
      await Notifications.cancelScheduledNotificationAsync(notification.identifier);
    } else {
      desired.delete(key as string);
    }
  }

  if (desired.size === 0) return true;
  await Notifications.setNotificationChannelAsync('reminders', {
    name: 'Reminders',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
  });
  let permissions = await Notifications.getPermissionsAsync();
  if (permissions.status !== 'granted') permissions = await Notifications.requestPermissionsAsync();
  if (permissions.status !== 'granted') return false;

  for (const [key, item] of desired) {
    const message = item.title;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Daily Life reminder',
        body: message,
        sound: 'default',
        data: { owner, key },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(item.reminder_at!),
        channelId: 'reminders',
      },
    });
  }
  return true;
}

export function syncReminderNotifications(owner: string, items: ReminderItem[]) {
  const current = reconciliation.then(() => reconcile(owner, items));
  reconciliation = current.then(
    () => undefined,
    (error: unknown) => { console.error('Unable to synchronize local reminders:', error); },
  );
  return current;
}

async function reconcileWishNotifications(wishes: SavingsWish[]) {
  const today = localDateKey(new Date());
  const activeWishes = wishes.filter((wish) =>
    wish.targetDate >= today && !getWishProgress(wish, today).isComplete,
  );
  if (Platform.OS === 'web') return activeWishes.length === 0;

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const owned = scheduled.filter((notification) => notification.content.data?.owner === 'wishes');
  const reminderId = reminderKey('wishes', 'daily');
  const reminderBody = activeWishes.length === 1
    ? 'Review today’s savings due, including any missed days, in Wishes.'
    : `Review today’s savings due for ${activeWishes.length} wishes, including any missed days, in Wishes.`;
  let needsReminder = activeWishes.length > 0;
  for (const notification of owned) {
    const key = notification.content.data?.key;
    const trigger = notification.trigger;
    const isDailyAtNine = trigger && 'type' in trigger && trigger.type === 'daily' &&
      'hour' in trigger && trigger.hour === 9 && 'minute' in trigger && trigger.minute === 0;
    if (!needsReminder || key !== reminderId || notification.content.body !== reminderBody || !isDailyAtNine) {
      await Notifications.cancelScheduledNotificationAsync(notification.identifier);
    } else {
      needsReminder = false;
    }
  }

  if (!needsReminder) return true;
  await Notifications.setNotificationChannelAsync('reminders', {
    name: 'Reminders',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
  });
  let permissions = await Notifications.getPermissionsAsync();
  if (permissions.status !== 'granted') permissions = await Notifications.requestPermissionsAsync();
  if (permissions.status !== 'granted') return false;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Savings reminder',
      body: reminderBody,
      sound: 'default',
      data: { owner: 'wishes', key: reminderId },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: 9,
      minute: 0,
      channelId: 'reminders',
    },
  });
  return true;
}

export function syncWishNotifications(wishes: SavingsWish[]) {
  const current = reconciliation.then(() => reconcileWishNotifications(wishes));
  reconciliation = current.then(
    () => undefined,
    (error: unknown) => { console.error('Unable to synchronize wish reminders:', error); },
  );
  return current;
}
