const test = require('node:test');
const assert = require('node:assert/strict');

const { getWishProgress } = require('./wishSavings.ts');

const baseWish = {
  id: 'car',
  title: 'Car',
  targetAmount: 1200000,
  targetDate: '2027-01-15',
  createdDate: '2026-10-18',
  contributions: [],
};

test('a three-month wish calculates an initial daily savings amount', () => {
  const progress = getWishProgress(baseWish, '2026-10-18');
  assert.equal(progress.dueToday, Math.round((1200000 / 90) * 100) / 100);
  assert.equal(progress.daysRemaining, 90);
  assert.equal(progress.totalSaved, 0);
});

test('saving today covers today and accrues a new installment for tomorrow', () => {
  const dailySave = Math.round((1200000 / 90) * 100) / 100;
  const wish = { ...baseWish, contributions: [{ date: '2026-10-18', amount: dailySave }] };
  assert.equal(getWishProgress(wish, '2026-10-18').dueToday, 0);
  const expectedTomorrowDue = Math.round((1200000 * 2 / 90) * 100) / 100 - dailySave;
  assert.ok(Math.abs(getWishProgress(wish, '2026-10-19').dueToday - expectedTomorrowDue) < 0.01);
});

test('a missed day accumulates into the next due amount', () => {
  const progress = getWishProgress(baseWish, '2026-10-19');
  assert.equal(progress.dueToday, Math.round((1200000 * 2 / 90) * 100) / 100);
});

test('partial contributions reduce the accrued due amount', () => {
  const dailySave = Math.round((1200000 / 90) * 100) / 100;
  const wish = { ...baseWish, contributions: [{ date: '2026-10-18', amount: dailySave / 2 }] };
  const expectedDue = Math.round((1200000 * 2 / 90) * 100) / 100 - dailySave / 2;
  assert.ok(Math.abs(getWishProgress(wish, '2026-10-19').dueToday - expectedDue) < 0.01);
});

test('deadline day is included and completed wishes show zero due', () => {
  const wish = {
    ...baseWish,
    targetDate: '2026-10-19',
    contributions: [{ date: '2026-10-18', amount: 600000 }, { date: '2026-10-19', amount: 600000 }],
  };
  assert.equal(getWishProgress(wish, '2026-10-19').isComplete, true);
  assert.equal(getWishProgress(wish, '2026-10-19').dueToday, 0);
});

test('overdue wishes stop accumulating daily dues', () => {
  const progress = getWishProgress({ ...baseWish, targetDate: '2026-10-18' }, '2026-10-19');
  assert.equal(progress.isOverdue, true);
  assert.equal(progress.dueToday, 0);
});
