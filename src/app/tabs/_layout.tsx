import { DefaultTheme, ThemeProvider } from 'expo-router';
import { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import AppTabs from '@/components/app-tabs';
import { useAppTheme } from '@/state/ThemeProvider';

export default function TabLayout() {
  const { theme } = useAppTheme();
  useEffect(() => { void SplashScreen.hideAsync(); }, []);
  return (
    <ThemeProvider value={DefaultTheme}>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      <AppTabs />
    </ThemeProvider>
  );
}
