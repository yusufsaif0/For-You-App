import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  getAuth, getReactNativePersistence, initializeAuth, type Auth,
} from 'firebase/auth';
import { Platform } from 'react-native';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
};

export const isFirebaseConfigured = Object.values(firebaseConfig).every(
  (value) => typeof value === 'string' && value.length > 0 && !value.startsWith('YOUR_'),
);

let firebaseAuth: Auth | null = null;
if (isFirebaseConfigured) {
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  if (Platform.OS === 'web') {
    firebaseAuth = getAuth(app);
  } else {
    try {
      firebaseAuth = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
    } catch (error) {
      if (error instanceof Error && error.message.includes('already')) firebaseAuth = getAuth(app);
      else throw error;
    }
  }
}

export const auth = firebaseAuth;
