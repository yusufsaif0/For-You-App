import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { decryptVaultData, deriveWebVaultKey, encryptVaultData } from '@/utils/vaultCrypto';

export type VaultRecordType = 'login' | 'pin' | 'bank' | 'card' | 'document';

export interface VaultDocumentField {
  label: string;
  value: string;
}

export interface VaultRecord {
  id: string;
  type: VaultRecordType;
  title: string;
  username?: string;
  password?: string;
  website?: string;
  pin?: string;
  bankName?: string;
  accountHolder?: string;
  accountNumber?: string;
  ifsc?: string;
  issuer?: string;
  lastFour?: string;
  expiry?: string;
  documentCategory?: string;
  documentFilename?: string;
  documentMimeType?: string;
  documentStorageId?: string;
  documentSize?: number;
  extractedDocumentType?: string;
  extractedFields?: VaultDocumentField[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

interface VaultEnvelope {
  version: 1;
  nonce: string;
  ciphertext: string;
  salt?: string;
}

export type VaultUnlockResult = { records: VaultRecord[]; key: string; isNew: boolean };

const ENVELOPE_KEY = 'daily-life-vault-v1';
const NATIVE_KEY = 'daily-life-vault-key-v1';
const secureStoreOptions: SecureStore.SecureStoreOptions = {
  requireAuthentication: true,
  authenticationPrompt: 'Unlock your Daily Life vault',
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

function parseEnvelope(value: string | null): VaultEnvelope | null {
  if (!value) return null;
  const parsed: unknown = JSON.parse(value);
  if (
    typeof parsed !== 'object' || parsed === null ||
    !('version' in parsed) || parsed.version !== 1 ||
    !('nonce' in parsed) || typeof parsed.nonce !== 'string' ||
    !('ciphertext' in parsed) || typeof parsed.ciphertext !== 'string' ||
    ('salt' in parsed && typeof parsed.salt !== 'string')
  ) {
    throw new Error('The encrypted vault file is invalid. It was not changed.');
  }
  return parsed as VaultEnvelope;
}

function validateRecords(value: unknown): VaultRecord[] {
  if (!Array.isArray(value) || value.some((item) =>
    typeof item !== 'object' || item === null ||
    !('id' in item) || typeof item.id !== 'string' ||
    !('type' in item) || !['login', 'pin', 'bank', 'card', 'document'].includes(String(item.type)) ||
    !('title' in item) || typeof item.title !== 'string' ||
    !('createdAt' in item) || typeof item.createdAt !== 'string' ||
    !('updatedAt' in item) || typeof item.updatedAt !== 'string' ||
    ('type' in item && item.type === 'document' && (
      !('documentCategory' in item) || typeof item.documentCategory !== 'string' || !item.documentCategory.trim() ||
      !('documentFilename' in item) || typeof item.documentFilename !== 'string' || !item.documentFilename.trim() ||
      !('documentMimeType' in item) || !['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(String(item.documentMimeType)) ||
      !('documentStorageId' in item) || typeof item.documentStorageId !== 'string' || !/^[0-9a-f]{32}$/i.test(item.documentStorageId) ||
      !('documentSize' in item) || typeof item.documentSize !== 'number' || !Number.isInteger(item.documentSize) || item.documentSize < 1 || item.documentSize > 20 * 1024 * 1024 ||
      ('extractedFields' in item && (!Array.isArray(item.extractedFields) || item.extractedFields.some((field: unknown) =>
        typeof field !== 'object' || field === null ||
        !('label' in field) || typeof field.label !== 'string' ||
        !('value' in field) || typeof field.value !== 'string')))
    )) ||
    ('type' in item && item.type === 'card' && ['cardNumber', 'fullCardNumber', 'cvv', 'cvc', 'securityCode', 'photo', 'cardPhoto', 'photoUri'].some((field) => field in item))
  )) {
    throw new Error('The vault contents are invalid. The encrypted data was not changed.');
  }
  return value as VaultRecord[];
}

async function readEnvelope(): Promise<VaultEnvelope | null> {
  return parseEnvelope(await AsyncStorage.getItem(ENVELOPE_KEY));
}

async function saveEnvelope(records: VaultRecord[], key: string, salt?: string): Promise<void> {
  const nonce = await Crypto.getRandomBytesAsync(12);
  const envelope: VaultEnvelope = {
    version: 1,
    nonce: bytesToHex(nonce),
    ciphertext: encryptVaultData(records, key, nonce),
    ...(salt ? { salt } : {}),
  };
  await AsyncStorage.setItem(ENVELOPE_KEY, JSON.stringify(envelope));
}

export async function isVaultInitialized(): Promise<boolean> {
  return (await readEnvelope()) !== null;
}

export async function unlockNativeVault(): Promise<VaultUnlockResult> {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
    throw new Error('Native biometric unlock is only available in the mobile app.');
  }
  const envelope = await readEnvelope();
  let key = await SecureStore.getItemAsync(NATIVE_KEY, secureStoreOptions);
  if (!key) {
    if (envelope) {
      throw new Error('The vault key is unavailable or was invalidated. Your encrypted vault was left untouched and cannot be recovered without that key.');
    }
    key = bytesToHex(await Crypto.getRandomBytesAsync(32));
    await SecureStore.setItemAsync(NATIVE_KEY, key, secureStoreOptions);
  }
  if (!/^[0-9a-f]{64}$/i.test(key)) {
    throw new Error('The secure vault key is invalid. Your saved vault data was left untouched.');
  }
  if (!envelope) {
    await saveEnvelope([], key);
    return { records: [], key, isNew: true };
  }
  try {
    return {
      records: validateRecords(decryptVaultData(envelope.ciphertext, key, envelope.nonce)),
      key,
      isNew: false,
    };
  } catch {
    throw new Error('The vault could not be decrypted. Check that this is the original device and biometric setup; the saved data was not changed.');
  }
}

export async function unlockWebVault(password: string, isNew: boolean): Promise<VaultUnlockResult> {
  if (Platform.OS !== 'web') throw new Error('Password-based vault unlock is for web browsers only.');
  const envelope = await readEnvelope();
  if (isNew) {
    if (envelope) throw new Error('A vault already exists in this browser. Unlock it instead of creating a new one.');
    const saltBytes = await Crypto.getRandomBytesAsync(16);
    const salt = bytesToHex(saltBytes);
    const key = await deriveWebVaultKey(password, saltBytes);
    await saveEnvelope([], key, salt);
    return { records: [], key, isNew: true };
  }
  if (!envelope?.salt) throw new Error('The web vault is missing its encryption salt. The saved data was not changed.');
  try {
    const key = await deriveWebVaultKey(password, hexToBytes(envelope.salt));
    return {
      records: validateRecords(decryptVaultData(envelope.ciphertext, key, envelope.nonce)),
      key,
      isNew: false,
    };
  } catch {
    throw new Error('Unable to unlock the vault. The password may be incorrect or the encrypted data may be damaged.');
  }
}

export async function saveVaultRecords(records: VaultRecord[], key: string): Promise<void> {
  if (!Array.isArray(records) || !/^[0-9a-f]{64}$/i.test(key)) {
    throw new Error('Vault data is invalid and was not saved.');
  }
  const validatedRecords = validateRecords(records);
  const envelope = await readEnvelope();
  let salt: string | undefined;
  if (Platform.OS === 'web') {
    if (!envelope?.salt) {
      throw new Error('The web vault encryption salt is missing. The saved data was not changed.');
    }
    salt = envelope.salt;
  }
  await saveEnvelope(validatedRecords, key, salt);
}
