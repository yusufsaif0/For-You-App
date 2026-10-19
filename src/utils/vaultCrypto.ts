import { gcm } from '@noble/ciphers/aes.js';
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';

const VAULT_AAD = utf8ToBytes('daily-life-vault:v1');
const WEB_KDF_ITERATIONS = 600_000;

export async function deriveWebVaultKey(password: string, salt: Uint8Array): Promise<string> {
  const key = await pbkdf2Async(sha256, password, salt, {
    c: WEB_KDF_ITERATIONS,
    dkLen: 32,
    asyncTick: 50,
  });
  return bytesToHex(key);
}

export function encryptVaultData<T>(data: T, keyHex: string, nonce: Uint8Array): string {
  const encrypted = gcm(hexToBytes(keyHex), nonce, VAULT_AAD)
    .encrypt(utf8ToBytes(JSON.stringify(data)));
  return bytesToHex(encrypted);
}

export function decryptVaultData<T>(ciphertextHex: string, keyHex: string, nonceHex: string): T {
  const decrypted = gcm(hexToBytes(keyHex), hexToBytes(nonceHex), VAULT_AAD)
    .decrypt(hexToBytes(ciphertextHex));
  const encoded = Array.from(decrypted, (byte) => `%${byte.toString(16).padStart(2, '0')}`).join('');
  return JSON.parse(decodeURIComponent(encoded)) as T;
}
