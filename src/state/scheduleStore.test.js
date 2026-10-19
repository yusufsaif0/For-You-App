const test = require('node:test');
const assert = require('node:assert/strict');
const { ScheduleStore } = require('./scheduleStore.ts');

const item = (id, changes = {}) => ({ id, title: 'Walk', category: 'Workout', starts_at: '2026-10-18T02:00:00Z', completed: false, created_at: '2026-10-18T01:00:00Z', updated_at: '2026-10-18T01:00:00Z', ...changes });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

test('a slow refresh cannot undo a saved edit or completion', async () => {
  const request = deferred();
  let count = 0;
  const store = new ScheduleStore({ getSchedules: () => ++count === 1 ? Promise.resolve([item('a')]) : request.promise,
    updateSchedule: async (id, input) => item(id, input) });
  await store.refresh();
  const pending = store.refresh();
  await store.update('a', { title: 'Updated', completed: true });
  request.resolve([item('a')]);
  await pending;
  assert.equal(store.getSnapshot().schedules[0].title, 'Updated');
  assert.equal(store.getSnapshot().schedules[0].completed, true);
});

test('failed mutations preserve data and release the item for retry', async () => {
  let fail = true;
  const store = new ScheduleStore({ getSchedules: async () => [item('a')], deleteSchedule: async () => {
    if (fail) throw new Error('Offline');
  } });
  await store.refresh();
  await assert.rejects(store.remove('a'), /Offline/);
  assert.equal(store.getSnapshot().schedules.length, 1);
  assert.deepEqual(store.getSnapshot().busyIds, []);
  fail = false;
  await store.remove('a');
  assert.equal(store.getSnapshot().schedules.length, 0);
});

test('duplicate mutations are blocked and refresh callers share one request', async () => {
  const read = deferred();
  const write = deferred();
  let requests = 0;
  const store = new ScheduleStore({ getSchedules: () => { requests++; return read.promise; }, updateSchedule: () => write.promise });
  const first = store.refresh();
  const second = store.refresh();
  assert.equal(requests, 1);
  read.resolve([item('a')]);
  await Promise.all([first, second]);
  const pending = store.update('a', { completed: true });
  await assert.rejects(store.update('a', { completed: false }), /wait/);
  write.resolve(item('a', { completed: true }));
  await pending;
  assert.equal(store.getSnapshot().schedules[0].completed, true);
});

test('an unavailable backend keeps loaded data and a successful retry clears the error', async () => {
  let fail = false;
  const store = new ScheduleStore({ getSchedules: async () => { if (fail) throw new Error('Offline'); return [item('a')]; } });
  await store.refresh();
  fail = true;
  await store.refresh();
  assert.equal(store.getSnapshot().schedules.length, 1);
  assert.equal(store.getSnapshot().error, 'Offline');
  fail = false;
  await store.refresh();
  assert.equal(store.getSnapshot().error, '');
});

test('server-rendered snapshot stays stable after client data loads', async () => {
  const store = new ScheduleStore({ getSchedules: async () => [item('a')] });
  const server = store.getServerSnapshot();
  await store.refresh();
  assert.equal(store.getSnapshot().schedules.length, 1);
  assert.equal(store.getServerSnapshot(), server);
  assert.deepEqual(server.schedules, []);
  assert.equal(server.isLoading, true);
});

test('creating during the initial load retains both the new and previously saved activities', async () => {
  const read = deferred();
  const store = new ScheduleStore({ getSchedules: () => read.promise, createSchedule: async () => item('new') });
  const loading = store.refresh();
  await store.create({ title: 'Walk', category: 'Workout', starts_at: '2026-10-18T02:00:00Z' });
  read.resolve([item('old')]);
  await loading;
  assert.deepEqual(new Set(store.getSnapshot().schedules.map(item => item.id)), new Set(['old', 'new']));
});

test('a delayed read never resurrects a deleted activity', async () => {
  const read = deferred();
  let reads = 0;
  const store = new ScheduleStore({ getSchedules: () => ++reads === 1 ? Promise.resolve([item('a')]) : read.promise,
    deleteSchedule: async () => {} });
  await store.refresh();
  const loading = store.refresh();
  await store.remove('a');
  read.resolve([item('a')]);
  await loading;
  assert.deepEqual(store.getSnapshot().schedules, []);
});

test('a failed write during a failed initial load does not hide the loading error', async () => {
  const read = deferred();
  const store = new ScheduleStore({ getSchedules: () => read.promise, createSchedule: async () => { throw new Error('Offline'); } });
  const loading = store.refresh();
  await assert.rejects(store.create({ title: 'Walk' }), /Offline/);
  read.reject(new Error('Offline'));
  await loading;
  assert.equal(store.getSnapshot().error, 'Offline');
});
