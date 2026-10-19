import { NativeModules, Platform } from 'react-native';

export interface CapturedMessage {
  id: string;
  packageName: string;
  appName: string;
  title: string;
  message: string;
  postedAt: number;
}

interface MessageCaptureNativeModule {
  isNotificationAccessEnabled(): Promise<boolean>;
  openNotificationAccessSettings(): Promise<void>;
  getCapturedMessages(): Promise<CapturedMessage[]>;
  deleteCapturedMessage(id: string): Promise<void>;
  clearCapturedMessages(): Promise<void>;
}

function getNativeModule(): MessageCaptureNativeModule {
  if (Platform.OS !== 'android') {
    throw new Error('Notification message capture is supported on Android only.');
  }
  const module = NativeModules.MessageCapture as MessageCaptureNativeModule | undefined;
  if (!module) {
    throw new Error('Message capture needs the Daily Life Android development app; it is not available in Expo Go.');
  }
  return module;
}

export function isMessageCaptureAvailable(): boolean {
  return Platform.OS === 'android' && Boolean(NativeModules.MessageCapture);
}

export function hasMessageNotificationAccess(): Promise<boolean> {
  return getNativeModule().isNotificationAccessEnabled();
}

export function openMessageNotificationSettings(): Promise<void> {
  return getNativeModule().openNotificationAccessSettings();
}

export function getCapturedMessages(): Promise<CapturedMessage[]> {
  return getNativeModule().getCapturedMessages();
}

export function deleteCapturedMessage(id: string): Promise<void> {
  if (!id) throw new Error('Choose a saved message to delete.');
  return getNativeModule().deleteCapturedMessage(id);
}

export function clearCapturedMessages(): Promise<void> {
  return getNativeModule().clearCapturedMessages();
}
