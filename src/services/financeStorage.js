import AsyncStorage from '@react-native-async-storage/async-storage';

const FINANCE_KEY = 'daily-life-finance';

const emptyFinanceData = {
  manualTransactions: [],
  dailyPocketMoney: 0,
  smsEnabled: false,
};

const readData = async () => {
  const saved = await AsyncStorage.getItem(FINANCE_KEY);
  if (!saved) return { ...emptyFinanceData };
  const parsed = JSON.parse(saved);
  if (
    !parsed ||
    !Array.isArray(parsed.manualTransactions) ||
    !Number.isFinite(parsed.dailyPocketMoney) ||
    typeof parsed.smsEnabled !== 'boolean'
  ) {
    throw new Error('Saved money data is invalid. Clear this app’s local storage and try again.');
  }
  return parsed;
};

export async function getFinanceData() {
  return readData();
}

export async function addManualTransaction({ amount, type, note }) {
  if (!Number.isFinite(amount) || amount <= 0 || (type !== 'expense' && type !== 'income')) {
    throw new Error('Enter a valid positive transaction amount.');
  }
  const data = await readData();
  const transaction = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    amount,
    type,
    note,
    source: 'manual',
    date: new Date().toISOString(),
  };
  const next = { ...data, manualTransactions: [transaction, ...data.manualTransactions] };
  await AsyncStorage.setItem(FINANCE_KEY, JSON.stringify(next));
  return transaction;
}

export async function saveDailyPocketMoney(amount) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Enter a valid daily pocket-money amount.');
  }
  const data = await readData();
  await AsyncStorage.setItem(FINANCE_KEY, JSON.stringify({ ...data, dailyPocketMoney: amount }));
}

export async function setSmsSyncEnabled(enabled) {
  if (typeof enabled !== 'boolean') throw new Error('SMS sync setting must be enabled or disabled.');
  const data = await readData();
  await AsyncStorage.setItem(FINANCE_KEY, JSON.stringify({ ...data, smsEnabled: enabled }));
}
