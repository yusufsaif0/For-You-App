import { gcm } from '@noble/ciphers/aes.js';
import { hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';

const DOCUMENT_AAD = utf8ToBytes('daily-life-document:v1');

export function bytesToBase64(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const hasSecond = index + 1 < bytes.length;
    const hasThird = index + 2 < bytes.length;
    const second = hasSecond ? bytes[index + 1] : 0;
    const third = hasThird ? bytes[index + 2] : 0;
    result += alphabet[first >> 2];
    result += alphabet[((first & 3) << 4) | (second >> 4)];
    result += hasSecond ? alphabet[((second & 15) << 2) | (third >> 6)] : '=';
    result += hasThird ? alphabet[third & 63] : '=';
  }
  return result;
}

export function base64ToBytes(value: string): Uint8Array {
  if (value.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error('The selected document data is invalid.');
  }
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  const result = new Uint8Array((value.length / 4) * 3 - padding);
  let offset = 0;
  for (let index = 0; index < value.length; index += 4) {
    const first = alphabet.indexOf(value[index]);
    const second = alphabet.indexOf(value[index + 1]);
    const third = value[index + 2] === '=' ? 0 : alphabet.indexOf(value[index + 2]);
    const fourth = value[index + 3] === '=' ? 0 : alphabet.indexOf(value[index + 3]);
    const group = (first << 18) | (second << 12) | (third << 6) | fourth;
    if (offset < result.length) result[offset++] = (group >> 16) & 255;
    if (offset < result.length) result[offset++] = (group >> 8) & 255;
    if (offset < result.length) result[offset++] = group & 255;
  }
  return result;
}

export function documentBytesMatchMimeType(bytes: Uint8Array, mimeType: string): boolean {
  if (mimeType === 'application/pdf') return bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
  if (mimeType === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === 'image/png') return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  if (mimeType === 'image/webp') return bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  return false;
}

export function encryptDocumentBytes(bytes: Uint8Array, key: string, nonce: Uint8Array): Uint8Array {
  const ciphertext = gcm(hexToBytes(key), nonce, DOCUMENT_AAD).encrypt(bytes);
  const envelope = new Uint8Array(nonce.length + ciphertext.length);
  envelope.set(nonce);
  envelope.set(ciphertext, nonce.length);
  return envelope;
}

export function decryptDocumentBytes(envelope: Uint8Array, key: string): Uint8Array {
  if (envelope.length < 29) throw new Error('The encrypted document file is incomplete.');
  return gcm(hexToBytes(key), envelope.slice(0, 12), DOCUMENT_AAD).decrypt(envelope.slice(12));
}
