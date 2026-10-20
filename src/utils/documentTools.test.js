const test = require('node:test');
const assert = require('node:assert/strict');
const { encodeWithinLimit, fitDimensions, outputFilename, parseDimension, parseTargetSize } = require('./documentTools.ts');

test('manual KB and MB limits accept fractional sizes and reject invalid and out of range values', () => {
  assert.equal(parseTargetSize('0.5', 'MB'), 524288);
  assert.equal(parseTargetSize('.5', 'MB'), 524288);
  assert.equal(parseTargetSize(' 2 ', 'MB'), 2097152);
  assert.equal(parseTargetSize('200', 'KB'), 204800);
  assert.equal(parseTargetSize('512', 'KB'), parseTargetSize('0.5', 'MB'));
  assert.equal(parseTargetSize('1.5', 'KB'), 1536);
  assert.equal(parseTargetSize('1', 'KB'), 1024);
  assert.equal(parseTargetSize('20480', 'KB'), parseTargetSize('20', 'MB'));
  for (const unit of ['KB', 'MB']) {
    for (const value of ['', 'abc', '1e3', '-1', '0', 'Infinity', '1,5']) assert.throws(() => parseTargetSize(value, unit));
  }
  for (const [value, unit] of [['0.9', 'KB'], ['20480.1', 'KB'], ['0.0009', 'MB'], ['20.01', 'MB']]) assert.throws(() => parseTargetSize(value, unit));
  assert.equal(parseDimension(''), undefined);
  assert.equal(parseDimension('1080'), 1080);
  for (const value of ['0', '12.5', '6001', '-1']) assert.throws(() => parseDimension(value));
});

test('resizing fits the requested bounds without stretching or upscaling', () => {
  assert.deepEqual(fitDimensions(4000, 2000, 2400), { width: 2400, height: 1200 });
  assert.deepEqual(fitDimensions(4000, 2000, 2400, { width: 1000, height: 400 }), { width: 800, height: 400 });
  assert.deepEqual(fitDimensions(640, 480, 2400, { width: 1080 }), { width: 640, height: 480 });
});

test('manual compression checks actual bytes and reduces dimensions after quality attempts', async () => {
  const attempts = [];
  const result = await encodeWithinLimit(async (quality, edge) => {
    attempts.push({ quality, edge });
    return new Uint8Array(Math.ceil(edge * quality));
  }, 400);
  assert.ok(result.length <= 400);
  assert.ok(attempts.some((attempt) => attempt.edge < 2400));
  assert.ok(attempts.every((attempt) => attempt.quality >= 0.4));
});

test('already small encoded output is retained without padding or repeated processing', async () => {
  const original = new Uint8Array(50);
  let calls = 0;
  const result = await encodeWithinLimit(async () => { calls += 1; return original; }, 100);
  assert.equal(result, original);
  assert.equal(calls, 1);
});

test('unreachable targets fail instead of returning an oversized output', async () => {
  let attempts = 0;
  await assert.rejects(encodeWithinLimit(async () => { attempts += 1; return new Uint8Array(1000); }, 100), /Could not reach/);
  assert.equal(attempts, 12);
});

test('locking cancels processing before encoding and after an in-flight encoding', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(encodeWithinLimit(async () => { throw new Error('should not run'); }, 100, controller.signal), /Processing stopped/);
  const during = new AbortController();
  await assert.rejects(encodeWithinLimit(async () => { during.abort(); return new Uint8Array(20); }, 100, during.signal), /Processing stopped/);
});

test('outputs use distinct safe filenames and preserve PDF page order in names', () => {
  assert.equal(outputFilename('my.scan.pdf', 'page-2', 'jpg'), 'my.scan-page-2.jpg');
  assert.equal(outputFilename('tax:2026.pdf', 'compressed', 'pdf'), 'tax_2026-compressed.pdf');
});
