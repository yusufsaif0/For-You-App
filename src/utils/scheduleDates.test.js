const test = require('node:test');
const assert = require('node:assert/strict');
const { isInSelectedPeriod, mergeDatePart, mergeTimePart, localDateInput } = require('./scheduleDates.ts');

test('Today uses the local day on each side of UTC midnight', () => {
  const previous = process.env.TZ;
  process.env.TZ = 'Asia/Kolkata';
  try {
    const now = new Date('2026-10-18T12:00:00+05:30');
    assert.equal(isInSelectedPeriod('2026-10-17T18:29:59Z', 'Today', now), false);
    assert.equal(isInSelectedPeriod('2026-10-17T18:30:00Z', 'Today', now), true);
    assert.equal(isInSelectedPeriod('2026-10-18T18:29:59Z', 'Today', now), true);
    assert.equal(isInSelectedPeriod('2026-10-18T18:30:00Z', 'Today', now), false);
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});

test('Week starts Monday and handles Sunday across a year boundary', () => {
  const now = new Date(2027, 0, 3, 12);
  assert.equal(isInSelectedPeriod(new Date(2026, 11, 28).toISOString(), 'Week', now), true);
  assert.equal(isInSelectedPeriod(new Date(2027, 0, 4).toISOString(), 'Week', now), false);
  assert.equal(isInSelectedPeriod(new Date(2026, 11, 27, 23, 59).toISOString(), 'Week', now), false);
});

test('Month respects year, month end, leap days, and All includes future dates', () => {
  const now = new Date(2028, 1, 15);
  assert.equal(isInSelectedPeriod(new Date(2028, 1, 29, 23, 59).toISOString(), 'Month', now), true);
  assert.equal(isInSelectedPeriod(new Date(2027, 1, 15).toISOString(), 'Month', now), false);
  assert.equal(isInSelectedPeriod(new Date(2028, 2, 1).toISOString(), 'Month', now), false);
  assert.equal(isInSelectedPeriod('2030-01-01T00:00:00Z', 'All', now), true);
  assert.equal(isInSelectedPeriod('invalid', 'All', now), false);
});

test('Date and time pickers preserve the other field including month-end changes', () => {
  const original = new Date(2026, 0, 31, 9, 45);
  const changedDate = mergeDatePart(original, new Date(2028, 1, 29));
  assert.equal(localDateInput(changedDate), '2028-02-29');
  assert.equal(changedDate.getHours(), 9);
  assert.equal(changedDate.getMinutes(), 45);
  const changedTime = mergeTimePart(changedDate, new Date(2026, 9, 18, 23, 10));
  assert.equal(localDateInput(changedTime), '2028-02-29');
  assert.equal(changedTime.getHours(), 23);
  assert.equal(changedTime.getMinutes(), 10);
  assert.equal(original.getMonth(), 0);
});

test('Week includes seven calendar days over a daylight-saving change', () => {
  const previous = process.env.TZ;
  process.env.TZ = 'America/New_York';
  try {
    const now = new Date(2026, 2, 8, 12);
    assert.equal(isInSelectedPeriod(new Date(2026, 2, 8, 23, 59).toISOString(), 'Week', now), true);
    assert.equal(isInSelectedPeriod(new Date(2026, 2, 9, 0, 0).toISOString(), 'Week', now), false);
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});
