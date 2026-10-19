import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { base64ToBytes, bytesToBase64, decryptDocumentBytes, encryptDocumentBytes } from '@/utils/documentCrypto';
import { familyPublicKey, unwrapFamilyDocumentKey, wrapFamilyDocumentKey } from '@/utils/familyDocumentCrypto';

const KEY_PREFIX = 'daily-life-family-encryption-key-v1:';
const NATIVE_KEY_OPTIONS: SecureStore.SecureStoreOptions = {
  requireAuthentication: true,
  authenticationPrompt: 'Unlock family document sharing',
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};
const privateKeyCache = new Map<string, string>();

function keyStorageKey(uid: string): string {
  if (!uid || uid.length > 128) throw new Error('The signed-in family account is invalid.');
  return `${KEY_PREFIX}${uid}`;
}

function validatePrivateKey(value: string): Uint8Array {
  if (!/^[0-9a-f]{64}$/i.test(value)) throw new Error('Enter the 64-character family recovery key.');
  return hexToBytes(value);
}

async function getPrivateKey(uid: string): Promise<string | null> {
  const cached = privateKeyCache.get(uid);
  if (cached) return cached;
  if (Platform.OS === 'web') return null;
  const stored = await SecureStore.getItemAsync(keyStorageKey(uid), NATIVE_KEY_OPTIONS);
  if (stored) privateKeyCache.set(uid, stored);
  return stored;
}

async function storePrivateKey(uid: string, privateKey: string): Promise<void> {
  validatePrivateKey(privateKey);
  if (Platform.OS === 'web') {
    privateKeyCache.set(uid, privateKey);
    return;
  }
  await SecureStore.setItemAsync(keyStorageKey(uid), privateKey, NATIVE_KEY_OPTIONS);
  privateKeyCache.set(uid, privateKey);
}

export function clearFamilyPrivateKeyCache(uid?: string): void {
  if (uid) privateKeyCache.delete(uid);
  else privateKeyCache.clear();
}

export async function getLocalFamilyPublicKey(uid: string): Promise<string | null> {
  const privateKey = await getPrivateKey(uid);
  if (!privateKey) return null;
  const privateBytes = validatePrivateKey(privateKey);
  try {
    return bytesToBase64(familyPublicKey(privateBytes));
  } finally {
    privateBytes.fill(0);
  }
}

export async function createFamilyRecoveryKey(): Promise<{ recoveryKey: string; publicKey: string }> {
  const privateBytes = await Crypto.getRandomBytesAsync(32);
  try {
    return {
      recoveryKey: bytesToHex(privateBytes),
      publicKey: bytesToBase64(familyPublicKey(privateBytes)),
    };
  } finally {
    privateBytes.fill(0);
  }
}

export async function activateFamilyRecoveryKey(
  uid: string,
  recoveryKey: string,
  expectedPublicKey?: string,
): Promise<string> {
  const privateBytes = validatePrivateKey(recoveryKey);
  try {
    const publicKey = bytesToBase64(familyPublicKey(privateBytes));
    if (expectedPublicKey && publicKey !== expectedPublicKey) {
      throw new Error('That recovery key does not match this account’s registered family key.');
    }
    await storePrivateKey(uid, recoveryKey.toLowerCase());
    return publicKey;
  } finally {
    privateBytes.fill(0);
  }
}

export function wrapDocumentKey(
  documentKey: Uint8Array,
  recipientPublicKey: string,
  documentId: string,
  recipientUid: string,
): string {
  const ephemeralPrivate = Crypto.getRandomBytes(32);
  const salt = Crypto.getRandomBytes(16);
  const nonce = Crypto.getRandomBytes(12);
  return wrapFamilyDocumentKey(documentKey, recipientPublicKey, documentId, recipientUid, ephemeralPrivate, salt, nonce);
}

export async function unwrapDocumentKey(
  wrappedKey: string,
  uid: string,
  documentId: string,
): Promise<Uint8Array> {
  const privateKey = await getPrivateKey(uid);
  if (!privateKey) throw new Error('Unlock family sharing with your recovery key before opening this document.');
  return unwrapFamilyDocumentKey(wrappedKey, validatePrivateKey(privateKey), documentId, uid);
}

export async function encryptFamilyDocument(
  bytes: Uint8Array,
  ownerUid: string,
  ownerPublicKey: string,
  documentId: string,
): Promise<{ encryptedContent: string; ownerWrappedKey: string }> {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0 || bytes.length > 10 * 1024 * 1024) {
    throw new Error('Choose a document smaller than 10 MB for family sharing.');
  }
  const documentKey = await Crypto.getRandomBytesAsync(32);
  const nonce = await Crypto.getRandomBytesAsync(12);
  const encrypted = encryptDocumentBytes(bytes, bytesToHex(documentKey), nonce);
  const ownerWrappedKey = wrapDocumentKey(documentKey, ownerPublicKey, documentId, ownerUid);
  documentKey.fill(0);
  return {
    encryptedContent: bytesToBase64(encrypted),
    ownerWrappedKey,
  };
}

export async function decryptFamilyDocument(
  encryptedContent: string,
  wrappedKey: string,
  uid: string,
  documentId: string,
): Promise<Uint8Array> {
  const documentKey = await unwrapDocumentKey(wrappedKey, uid, documentId);
  try {
    return decryptDocumentBytes(base64ToBytes(encryptedContent), bytesToHex(documentKey));
  } finally {
    documentKey.fill(0);
  }
}

export async function rewrapFamilyDocumentKey(
  wrappedKey: string,
  ownerUid: string,
  documentId: string,
  requesterUid: string,
  requesterPublicKey: string,
): Promise<string> {
  const documentKey = await unwrapDocumentKey(wrappedKey, ownerUid, documentId);
  try {
    return wrapDocumentKey(documentKey, requesterPublicKey, documentId, requesterUid);
  } finally {
    documentKey.fill(0);
  }
}
