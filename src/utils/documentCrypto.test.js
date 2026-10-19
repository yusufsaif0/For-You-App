const test = require('node:test');
const assert = require('node:assert/strict');

const { base64ToBytes, bytesToBase64, decryptDocumentBytes, documentBytesMatchMimeType, encryptDocumentBytes } = require('./documentCrypto.ts');

test('encrypted document bytes round-trip and reject changed ciphertext', () => {
  const key = 'ab'.repeat(32);
  const nonce = new Uint8Array(12).fill(3);
  const original = new Uint8Array([0, 1, 2, 127, 128, 255]);
  const encrypted = encryptDocumentBytes(original, key, nonce);

  assert.notDeepEqual(encrypted, original);
  assert.deepEqual(decryptDocumentBytes(encrypted, key), original);
  const modified = encrypted.slice();
  modified[modified.length - 1] ^= 1;
  assert.throws(() => decryptDocumentBytes(modified, key));
});

test('binary content is encoded as standard base64 for the OCR request', () => {
  assert.equal(bytesToBase64(new Uint8Array([0, 1, 2, 127, 128, 255])), 'AAECf4D/');
  assert.equal(bytesToBase64(new Uint8Array()), '');
  assert.deepEqual(base64ToBytes('AAECf4D/'), new Uint8Array([0, 1, 2, 127, 128, 255]));
  assert.throws(() => base64ToBytes('not base64!'));
});

test('document MIME validation checks the actual file signature', () => {
  assert.equal(documentBytesMatchMimeType(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]), 'application/pdf'), true);
  assert.equal(documentBytesMatchMimeType(new Uint8Array([0xff, 0xd8, 0xff]), 'image/jpeg'), true);
  assert.equal(documentBytesMatchMimeType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'image/png'), true);
  assert.equal(documentBytesMatchMimeType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]), 'image/webp'), true);
  assert.equal(documentBytesMatchMimeType(new Uint8Array([0, 1, 2]), 'image/jpeg'), false);
});
