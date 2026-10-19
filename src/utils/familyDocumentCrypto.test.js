const assert = require('node:assert/strict');
const { Buffer } = require('node:buffer');
const { randomBytes } = require('node:crypto');
const test = require('node:test');
const { bytesToHex } = require('@noble/hashes/utils.js');

test('only the intended family private key unwraps the document key', async () => {
  const { bytesToBase64, decryptDocumentBytes, encryptDocumentBytes } = await import('./documentCrypto.ts');
  const { familyPublicKey, unwrapFamilyDocumentKey, wrapFamilyDocumentKey } = await import('./familyDocumentCrypto.ts');
  const ownerUid = 'owner-user';
  const memberUid = 'member-user';
  const documentId = '0123456789abcdef01234567';
  const ownerPrivate = randomBytes(32);
  const memberPrivate = randomBytes(32);
  const documentKey = randomBytes(32);
  const envelope = wrapFamilyDocumentKey(
    documentKey,
    bytesToBase64(familyPublicKey(memberPrivate)),
    documentId,
    memberUid,
    randomBytes(32),
    randomBytes(16),
    randomBytes(12),
  );

  const unwrapped = unwrapFamilyDocumentKey(envelope, memberPrivate, documentId, memberUid);
  assert.deepEqual(Buffer.from(unwrapped), documentKey);
  const content = randomBytes(32);
  const encryptedContent = encryptDocumentBytes(content, documentKey.toString('hex'), randomBytes(12));
  assert.deepEqual(Buffer.from(decryptDocumentBytes(encryptedContent, bytesToHex(unwrapped))), content);
  assert.throws(() => unwrapFamilyDocumentKey(envelope, ownerPrivate, documentId, memberUid));
  assert.throws(() => unwrapFamilyDocumentKey(envelope, memberPrivate, `${documentId}0`, memberUid));
  assert.throws(() => unwrapFamilyDocumentKey(envelope, memberPrivate, documentId, ownerUid));
});

test('tampering with the wrapped key is rejected', async () => {
  const { bytesToBase64 } = await import('./documentCrypto.ts');
  const { familyPublicKey, unwrapFamilyDocumentKey, wrapFamilyDocumentKey } = await import('./familyDocumentCrypto.ts');
  const memberUid = 'member-user';
  const documentId = '0123456789abcdef01234567';
  const memberPrivate = randomBytes(32);
  const documentKey = randomBytes(32);
  const envelope = wrapFamilyDocumentKey(
    documentKey,
    bytesToBase64(familyPublicKey(memberPrivate)),
    documentId,
    memberUid,
    randomBytes(32),
    randomBytes(16),
    randomBytes(12),
  );
  const decoded = Buffer.from(envelope, 'base64');
  decoded[decoded.length - 1] ^= 1;

  assert.throws(() => unwrapFamilyDocumentKey(decoded.toString('base64'), memberPrivate, documentId, memberUid));
});
