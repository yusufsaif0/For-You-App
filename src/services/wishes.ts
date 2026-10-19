import AsyncStorage from '@react-native-async-storage/async-storage';
import { isWishDateKey, localDateKey, type SavingsWish } from '@/utils/wishSavings';
export { getWishProgress, localDateKey } from '@/utils/wishSavings';
export type { SavingsWish, WishContribution } from '@/utils/wishSavings';

const WISHES_KEY = 'daily-life-savings-wishes-v1';

function validateWishes(value: unknown): SavingsWish[] {
  if (!Array.isArray(value) || value.some((wish) =>
    typeof wish !== 'object' || wish === null ||
    !('id' in wish) || typeof wish.id !== 'string' || !wish.id ||
    !('title' in wish) || typeof wish.title !== 'string' || !wish.title.trim() ||
    !('targetAmount' in wish) || typeof wish.targetAmount !== 'number' || !Number.isFinite(wish.targetAmount) || wish.targetAmount <= 0 ||
    !('targetDate' in wish) || !isWishDateKey(wish.targetDate) ||
    !('createdDate' in wish) || !isWishDateKey(wish.createdDate) ||
    ('targetDate' in wish && 'createdDate' in wish && typeof wish.targetDate === 'string' && typeof wish.createdDate === 'string' && wish.targetDate < wish.createdDate) ||
    !('contributions' in wish) || !Array.isArray(wish.contributions) ||
    wish.contributions.some((contribution: unknown) =>
      typeof contribution !== 'object' || contribution === null ||
      !('date' in contribution) || !isWishDateKey(contribution.date) ||
      ('date' in contribution && 'createdDate' in wish && typeof contribution.date === 'string' && typeof wish.createdDate === 'string' && contribution.date < wish.createdDate) ||
      !('amount' in contribution) || typeof contribution.amount !== 'number' ||
      !Number.isFinite(contribution.amount) || contribution.amount <= 0)
  )) {
    throw new Error('Saved wish data is invalid. The data was not changed.');
  }
  return value as SavingsWish[];
}

export async function getWishes(): Promise<SavingsWish[]> {
  const stored = await AsyncStorage.getItem(WISHES_KEY);
  if (stored === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch (error) {
    throw new Error('Saved wish data could not be read. The data was not changed.', { cause: error });
  }
  return validateWishes(parsed);
}

async function saveWishes(wishes: SavingsWish[]): Promise<void> {
  await AsyncStorage.setItem(WISHES_KEY, JSON.stringify(validateWishes(wishes)));
}

export async function createWish(
  wishes: SavingsWish[],
  title: string,
  targetAmount: number,
  targetDate: string,
  today = localDateKey(new Date()),
): Promise<SavingsWish[]> {
  if (!title.trim() || title.trim().length > 80) throw new Error('Enter a wish name up to 80 characters.');
  if (!Number.isFinite(targetAmount) || targetAmount <= 0 || targetAmount > 100_000_000) {
    throw new Error('Enter a target greater than ₹0 and no more than ₹10,00,00,000.');
  }
  if (!isWishDateKey(targetDate) || !isWishDateKey(today) || targetDate < today) {
    throw new Error('Choose a valid target date that is today or later.');
  }
  const wish: SavingsWish = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    title: title.trim(),
    targetAmount,
    targetDate,
    createdDate: today,
    contributions: [],
  };
  const next = [wish, ...wishes];
  await saveWishes(next);
  return next;
}

export async function addWishContribution(
  wishes: SavingsWish[],
  wishId: string,
  amount: number,
  today = localDateKey(new Date()),
): Promise<SavingsWish[]> {
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000_000) {
    throw new Error('Enter a valid savings amount greater than ₹0.');
  }
  const wish = wishes.find((item) => item.id === wishId);
  if (!wish) throw new Error('This wish no longer exists.');
  const saved = wish.contributions.reduce((total, contribution) => total + contribution.amount, 0);
  if (amount > wish.targetAmount - saved + 0.000001) {
    throw new Error('The savings amount cannot exceed the remaining wish target.');
  }
  const next = wishes.map((item) => item.id === wishId
    ? { ...item, contributions: [...item.contributions, { date: today, amount }] }
    : item);
  await saveWishes(next);
  return next;
}

export async function deleteWish(wishes: SavingsWish[], wishId: string): Promise<SavingsWish[]> {
  const next = wishes.filter((wish) => wish.id !== wishId);
  if (next.length === wishes.length) throw new Error('This wish no longer exists.');
  await saveWishes(next);
  return next;
}
