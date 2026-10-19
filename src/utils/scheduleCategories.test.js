const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeCategoryNames, normalizeCategoryName, categoryKey } = require('./scheduleCategories.ts');
const { toScheduleListItem, defaultScheduleCategories } = require('../types/schedule.ts');

test('saved categories and categories from activities merge without case or whitespace duplicates', () => {
  assert.deepEqual(mergeCategoryNames(defaultScheduleCategories, [' Family   time ', 'work', 'family TIME'], ['Travel', 'Family time']),
    [...defaultScheduleCategories, 'Family time', 'Travel']);
  assert.equal(normalizeCategoryName('  Family\n time  '), 'Family time');
  assert.equal(categoryKey(' FAMILY  time '), 'family time');
});

test('custom categories render safely in both agenda and shared Home rows', () => {
  for (const category of ['Family', '__proto__', 'constructor']) {
    const item = toScheduleListItem({ id: 'a', title: 'Visit', category, starts_at: '2026-10-19T10:00:00Z' });
    assert.equal(item.icon, 'pricetag-outline');
    assert.equal(item.iconBackground, '#DDE8FF');
  }
  const item = toScheduleListItem({ id: 'a', title: 'Visit', category: 'Family', starts_at: '2026-10-19T10:00:00Z', icon: 'heart-outline', color: '#123456' });
  assert.equal(item.icon, 'heart-outline');
  assert.equal(item.iconBackground, '#123456');
});
