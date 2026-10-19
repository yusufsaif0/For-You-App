import Constants from 'expo-constants';
import { Platform } from 'react-native';

const configuredUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');

function getDevelopmentApiUrl() {
  const devHost = Constants.expoConfig?.hostUri?.split(':')[0];

  // Expo Go on a device can reach the computer running Metro over this LAN host.
  if (devHost && devHost !== 'localhost' && devHost !== '127.0.0.1') {
    return `http://${devHost}:8000/api`;
  }

  // Android emulators map 10.0.2.2 to the computer running the backend.
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:8000/api';
  }

  return 'http://localhost:8000/api';
}

export const API_URL = configuredUrl ?? getDevelopmentApiUrl();
