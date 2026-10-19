const test = require('node:test');
const assert = require('node:assert/strict');

const { decryptVaultData, deriveWebVaultKey, encryptVaultData } = require('./vaultCrypto.ts');

test('vault encryption round-trips unicode data and authenticates ciphertext', () => {
  const key = '11'.repeat(32);
  const nonce = new Uint8Array(12).fill(7);
  const data = [{ title: 'Bank 🔐', accountNumber: '1234567890' }];
  const ciphertext = encryptVaultData(data, key, nonce);

  assert.notEqual(ciphertext, JSON.stringify(data));
  assert.deepEqual(decryptVaultData(ciphertext, key, '07'.repeat(12)), data);
  assert.throws(() => decryptVaultData(ciphertext, '22'.repeat(32), '07'.repeat(12)));
});

test('web vault key derivation returns a 256-bit key', async () => {
  const key = await deriveWebVaultKey('a long unique vault password', new Uint8Array(16).fill(3));

  assert.match(key, /^[0-9a-f]{64}$/);
});
