import { NativeModules, Platform } from 'react-native';

export interface AppUsageEntry {
  packageName: string;
  appName: string;
  foregroundTimeMs: number;
}

interface NativeAppUsage {
  hasUsageAccess(): Promise<boolean>;
  openUsageAccessSettings(): Promise<void>;
  queryUsageStats(startTime: number, endTime: number): Promise<AppUsageEntry[]>;
}

const nativeUsage = NativeModules.AppUsage as NativeAppUsage | undefined;

export function isUsageTrackingAvailable() {
  return Platform.OS === 'android' && nativeUsage !== undefined;
}

export async function hasUsageAccess() {
  if (!isUsageTrackingAvailable() || !nativeUsage) return false;
  return nativeUsage.hasUsageAccess();
}

export async function openUsageAccessSettings() {
  if (!isUsageTrackingAvailable() || !nativeUsage) {
    throw new Error('App usage tracking requires the installed Android development build, not Expo Go.');
  }
  await nativeUsage.openUsageAccessSettings();
}

export async function getAppUsage(start: Date, end: Date) {
  if (!isUsageTrackingAvailable() || !nativeUsage) {
    throw new Error('App usage tracking requires the installed Android development build, not Expo Go.');
  }
  return nativeUsage.queryUsageStats(start.getTime(), end.getTime());
}
