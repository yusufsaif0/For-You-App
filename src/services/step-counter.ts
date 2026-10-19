import { NativeModules, Platform } from 'react-native';

export interface StepDay {
  date: string;
  steps: number;
}

export interface StepCounterStatus {
  available: boolean;
  tracking: boolean;
  todaySteps: number;
  lastSevenDays: StepDay[];
}

interface NativeStepCounter {
  getStatus(): Promise<StepCounterStatus>;
  startTracking(): Promise<void>;
  stopTracking(): Promise<void>;
}

const nativeModule = NativeModules.StepCounter as NativeStepCounter | undefined;

export function isStepCounterAvailable() {
  return Platform.OS === 'android' && nativeModule !== undefined;
}

export async function getStepCounterStatus() {
  if (!isStepCounterAvailable() || !nativeModule) {
    throw new Error('Step tracking requires the installed Android app and is not available in Expo Go.');
  }
  return nativeModule.getStatus();
}

export async function startStepTracking() {
  if (!isStepCounterAvailable() || !nativeModule) {
    throw new Error('Step tracking requires the installed Android app and is not available in Expo Go.');
  }
  return nativeModule.startTracking();
}

export async function stopStepTracking() {
  if (!isStepCounterAvailable() || !nativeModule) {
    throw new Error('Step tracking requires the installed Android app and is not available in Expo Go.');
  }
  return nativeModule.stopTracking();
}
