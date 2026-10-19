const test = require('node:test');
const assert = require('node:assert/strict');

const { parseTransactionMessage, summarizeByDay, summarizeTransactions } = require('./transactionParser.js');

test('parseTransactionMessage detects debited message and amount', () => {
  const result = parseTransactionMessage({
    body: 'Your A/c XXXX debited by Rs.500',
    address: 'HDFCBK',
    date: Date.now().toString(),
  });

  assert.ok(result);
  assert.equal(result.type, 'expense');
  assert.equal(result.amount, 500);
});

test('summarizeTransactions groups today and month totals', () => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0, 0);
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const sameMonth = new Date(today.getFullYear(), today.getMonth(), 5, 8, 0, 0);

  const summary = summarizeTransactions([
    { body: 'Your A/c debited by Rs.500', date: today.getTime().toString(), address: 'HDFCBK' },
    { body: 'Your A/c credited by Rs.2000', date: today.getTime().toString(), address: 'HDFCBK' },
    { body: 'Your A/c debited by Rs.100', date: yesterday.getTime().toString(), address: 'HDFCBK' },
    { body: 'Your A/c debited by Rs.75', date: sameMonth.getTime().toString(), address: 'HDFCBK' },
  ]);

  assert.equal(summary.today.expense, 500);
  assert.equal(summary.today.income, 2000);
  assert.equal(summary.thisMonth.expense, 675);
  assert.equal(summary.thisMonth.income, 2000);
});

test('manual entries contribute to daily and monthly summaries', () => {
  const now = new Date(2026, 9, 18, 12, 0, 0);
  const summary = summarizeTransactions([
    { source: 'manual', type: 'expense', amount: 250, date: new Date(2026, 9, 18, 9).toISOString() },
    { source: 'manual', type: 'income', amount: 1000, date: new Date(2026, 9, 3, 9).toISOString() },
    { source: 'manual', type: 'expense', amount: 99, date: new Date(2026, 8, 18, 9).toISOString() },
  ], now);

  assert.equal(summary.today.expense, 250);
  assert.equal(summary.today.income, 0);
  assert.equal(summary.thisMonth.expense, 250);
  assert.equal(summary.thisMonth.income, 1000);
});

test('summarizeByDay returns seven local-day totals in date order', () => {
  const now = new Date(2026, 9, 18, 12, 0, 0);
  const days = summarizeByDay([
    { source: 'manual', type: 'expense', amount: 80, date: new Date(2026, 9, 18, 9).toISOString() },
    { source: 'manual', type: 'expense', amount: 20, date: new Date(2026, 9, 17, 9).toISOString() },
  ], 7, now);

  assert.equal(days.length, 7);
  assert.equal(days.at(-1).key, '2026-10-18');
  assert.equal(days.at(-1).expense, 80);
  assert.equal(days.at(-2).expense, 20);
});
