export interface WishContribution {
  date: string;
  amount: number;
}

export interface SavingsWish {
  id: string;
  title: string;
  targetAmount: number;
  targetDate: string;
  createdDate: string;
  contributions: WishContribution[];
}

export function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isWishDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isFinite(parsed.getTime()) && localDateKey(parsed) === value;
}

function daysBetween(start: string, end: string): number {
  const [startYear, startMonth, startDay] = start.split('-').map(Number);
  const [endYear, endMonth, endDay] = end.split('-').map(Number);
  const startUtc = Date.UTC(startYear, startMonth - 1, startDay);
  const endUtc = Date.UTC(endYear, endMonth - 1, endDay);
  return Math.round((endUtc - startUtc) / 86_400_000);
}

export function getWishProgress(wish: SavingsWish, today = localDateKey(new Date())) {
  const totalDays = Math.max(daysBetween(wish.createdDate, wish.targetDate) + 1, 1);
  const elapsedDays = Math.max(0, Math.min(daysBetween(wish.createdDate, today) + 1, totalDays));
  const totalSaved = wish.contributions.reduce((total, contribution) => total + contribution.amount, 0);
  const savedToDate = wish.contributions
    .filter((contribution) => contribution.date <= today)
    .reduce((total, contribution) => total + contribution.amount, 0);
  const targetDueToDate = wish.targetAmount * elapsedDays / totalDays;
  const dueToday = today > wish.targetDate || today < wish.createdDate
    ? 0
    : Math.max(0, Math.round((targetDueToDate - savedToDate) * 100) / 100);
  const daysRemaining = Math.max(daysBetween(today, wish.targetDate) + 1, 0);
  const remaining = Math.max(0, wish.targetAmount - totalSaved);
  const isComplete = remaining <= 0.005;
  const isOverdue = !isComplete && today > wish.targetDate;
  return {
    totalSaved: Math.min(totalSaved, wish.targetAmount),
    remaining,
    dueToday,
    dailyPlan: daysRemaining > 0 ? remaining / daysRemaining : 0,
    progress: Math.min(totalSaved / wish.targetAmount, 1),
    daysRemaining,
    isComplete,
    isOverdue,
  };
}
