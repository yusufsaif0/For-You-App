const test = require('node:test');
const assert = require('node:assert/strict');
const { saveDocumentBatch } = require('./vaultDocumentBatch.ts');

const files = [1, 2].map((index) => ({ bytes: new Uint8Array([index]), filename: `page-${index}.jpg`, mimeType: 'image/jpeg' }));
function storage() {
  const original = { id: 'original', type: 'document', title: 'Original' };
  const state = { files: new Set(), records: [original], writes: 0, active: true };
  return {
    state,
    assertActive: () => { if (!state.active) throw new Error('Vault locked'); },
    saveFile: async () => { const id = String(++state.writes); state.files.add(id); return id; },
    deleteFile: async (id) => { state.files.delete(id); },
    readRecords: () => state.records,
    commitRecords: async (records) => { state.records = records; },
  };
}

test('a page batch is indexed together in page order and preserves originals and category', async () => {
  const store = storage();
  const saved = await saveDocumentBatch(files, 'Bank document', store);
  assert.deepEqual(store.state.records.map((record) => record.id), ['1', '2', 'original']);
  assert.deepEqual(saved.map((record) => record.documentFilename), ['page-1.jpg', 'page-2.jpg']);
  assert.ok(saved.every((record) => record.documentCategory === 'Bank document'));
});

test('a failed page write removes earlier files and leaves the index untouched', async () => {
  const store = storage();
  const save = store.saveFile;
  store.saveFile = async (bytes) => { if (store.state.writes === 1) throw new Error('Storage full'); return save(bytes); };
  await assert.rejects(saveDocumentBatch(files, 'Other', store), /Storage full/);
  assert.equal(store.state.files.size, 0);
  assert.deepEqual(store.state.records.map((record) => record.id), ['original']);
});

test('a failed index write rolls back every newly encrypted file', async () => {
  const store = storage();
  store.commitRecords = async () => { throw new Error('Index write failed'); };
  await assert.rejects(saveDocumentBatch(files, 'Other', store), /Index write failed/);
  assert.equal(store.state.files.size, 0);
  assert.equal(store.state.records.length, 1);
});

test('locking after an in-flight file write prevents commit and cleans that file', async () => {
  const store = storage();
  const save = store.saveFile;
  store.saveFile = async (bytes) => { const id = await save(bytes); store.state.active = false; return id; };
  await assert.rejects(saveDocumentBatch(files, 'Other', store), /Vault locked/);
  assert.equal(store.state.files.size, 0);
  assert.equal(store.state.records.length, 1);
});

test('a lock during the committed index write does not delete files referenced by that index', async () => {
  const store = storage();
  store.commitRecords = async (records) => { store.state.active = false; store.state.records = records; };
  await saveDocumentBatch(files, 'Other', store);
  assert.equal(store.state.records.length, 3);
  assert.equal(store.state.files.size, 2);
});

test('a rollback cleanup failure is reported explicitly', async () => {
  const store = storage();
  store.commitRecords = async () => { throw new Error('Index write failed'); };
  store.deleteFile = async () => { throw new Error('Delete failed'); };
  await assert.rejects(saveDocumentBatch(files, 'Other', store), /encrypted temporary file may remain/);
});
