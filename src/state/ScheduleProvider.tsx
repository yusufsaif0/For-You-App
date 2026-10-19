import { createContext, useContext, useEffect, useState, useSyncExternalStore, type PropsWithChildren } from 'react';
import { Alert, AppState, Platform } from 'react-native';
import { useRef } from 'react';

import * as api from '@/services/api/schedules';
import { syncReminderNotifications } from '@/services/notifications/reminders';
import { ScheduleStore } from './scheduleStore';

const Context = createContext<ScheduleStore | null>(null);

export function ScheduleProvider({ children }: PropsWithChildren) {
  const [store] = useState(() => new ScheduleStore(api));
  const reminderNoticeShown = useRef(false);
  useEffect(() => {
    void store.refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void store.refresh();
    });
    return () => subscription.remove();
  }, [store]);
  const scheduleState = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  useEffect(() => {
    if (scheduleState.isLoading || scheduleState.error) return;
    syncReminderNotifications('schedule', scheduleState.schedules).then((enabled) => {
      if (!enabled) {
        console.warn('Schedule reminders are not enabled for this device.');
        if (Platform.OS !== 'web' && !reminderNoticeShown.current) {
          reminderNoticeShown.current = true;
          Alert.alert(
            'Notifications are disabled',
            'Your schedule is saved, but this device will not send its reminder. Allow notifications for Daily Life in Android settings.',
          );
        }
      }
    }).catch((error: unknown) => {
      console.error('Unable to update schedule reminders:', error);
    });
  }, [scheduleState]);
  return <Context.Provider value={store}>{children}</Context.Provider>;
}

export function useSchedules() {
  const store = useContext(Context);
  if (!store) throw new Error('useSchedules requires ScheduleProvider');
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  return { ...state, refresh: store.refresh, create: store.create, update: store.update, remove: store.remove };
}
