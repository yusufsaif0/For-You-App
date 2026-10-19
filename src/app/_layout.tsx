import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ScheduleProvider } from '@/state/ScheduleProvider';
import { AuthProvider, useAuth } from '@/state/AuthProvider';
import { ThemeProvider, useAppTheme } from '@/state/ThemeProvider';
import AuthScreen from '@/components/screen/AuthScreen';
import ToolkitLayout from '@/components/Layout/ToolkitSidebar';
import { recordNotification } from '@/services/notifications/inbox';

function AppRouter() {
  const { status } = useAuth();
  const { colors } = useAppTheme();
  useEffect(() => {
    if (status !== 'signed-in' || Platform.OS === 'web') return undefined;
    const received = Notifications.addNotificationReceivedListener((notification) => {
      void recordNotification(notification).catch((failure: unknown) => {
        console.error('Unable to record received notification:', failure);
      });
    });
    const response = Notifications.addNotificationResponseReceivedListener(({ notification }) => {
      void recordNotification(notification).catch((failure: unknown) => {
        console.error('Unable to record opened notification:', failure);
      });
    });
    void Notifications.getLastNotificationResponseAsync().then((lastResponse) => {
      if (lastResponse) return recordNotification(lastResponse.notification);
      return undefined;
    }).catch((failure: unknown) => {
      console.error('Unable to load the last notification response:', failure);
    });
    return () => {
      received.remove();
      response.remove();
    };
  }, [status]);
  if (status === 'loading') {
    return <View style={[styles.loading, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.primary} /></View>;
  }
  if (status !== 'signed-in') return <AuthScreen />;
  return <ScheduleProvider><ToolkitLayout><Stack screenOptions={{ headerShown: false }} /></ToolkitLayout></ScheduleProvider>;
}

export default function RootLayout() {
  // Register icon fonts during static rendering as well as on the device.
  useFonts(Ionicons.font);
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider><AppRouter /></AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({ loading: { flex: 1, alignItems: 'center', justifyContent: 'center' } });
