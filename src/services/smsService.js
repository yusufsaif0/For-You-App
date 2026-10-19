import SmsAndroid from 'react-native-get-sms-android';

export const readSMS = () => {
  return new Promise((resolve, reject) => {
    const now = new Date();
    const historyStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
    const filter = {
      box: 'inbox',
      minDate: historyStart,
      maxCount: 1000,
    };

    SmsAndroid.list(
      JSON.stringify(filter),
      (fail) => {
        reject(new Error(typeof fail === 'string' ? fail : 'Unable to read bank transaction messages.'));
      },
      (_count, smsList) => {
        try {
          const messages = JSON.parse(smsList || '[]');
          if (!Array.isArray(messages)) throw new Error('SMS reader returned an invalid message list.');
          resolve(messages);
        } catch (error) {
          reject(error instanceof Error ? error : new Error('Unable to parse bank transaction messages.'));
        }
      }
    );
  });
};
