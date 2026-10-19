import { PermissionsAndroid, Platform } from 'react-native';

export const requestSMSPermission = async () => {
  if (Platform.OS !== 'android') {
    return false;
  }

  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.READ_SMS,
    {
      title: 'Allow bank transaction SMS access?',
      message: 'Daily Life reads transaction alerts on this device to calculate spending. Message contents are not uploaded.',
      buttonPositive: 'Allow',
      buttonNegative: 'Not now',
    },
  );
  return result === PermissionsAndroid.RESULTS.GRANTED;
};

export const hasSMSPermission = async () => {
  if (Platform.OS !== 'android') return false;
  return PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS);
};
