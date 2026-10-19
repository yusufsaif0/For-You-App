import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { bytesToHex } from '@noble/hashes/utils.js';
import { Platform } from 'react-native';
import { decryptDocumentBytes, encryptDocumentBytes } from '@/utils/documentCrypto';

const MAX_STORED_DOCUMENT_BYTES = 20 * 1024 * 1024;
const DATABASE_NAME = 'daily-life-private-documents-v1';
const OBJECT_STORE = 'encrypted-files';
const DOCUMENT_DIRECTORY = 'daily-life-private-documents';

function fileForDocument(storageId: string) {
  return new File(new Directory(Paths.document, DOCUMENT_DIRECTORY), `${storageId}.enc`);
}

function openDocumentDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    throw new Error('Encrypted document storage is unavailable in this browser.');
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(OBJECT_STORE)) {
        request.result.createObjectStore(OBJECT_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open encrypted document storage.'));
    request.onblocked = () => reject(new Error('Encrypted document storage is blocked by another open app tab.'));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Encrypted document storage failed.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Encrypted document storage was interrupted.'));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Encrypted document storage failed.'));
  });
}

async function writeEncrypted(storageId: string, encrypted: Uint8Array): Promise<void> {
  if (Platform.OS === 'web') {
    const database = await openDocumentDatabase();
    try {
      const transaction = database.transaction(OBJECT_STORE, 'readwrite');
      const completed = transactionComplete(transaction);
      transaction.objectStore(OBJECT_STORE).put(encrypted.slice().buffer, storageId);
      await completed;
    } finally {
      database.close();
    }
    return;
  }

  const directory = new Directory(Paths.document, DOCUMENT_DIRECTORY);
  if (!directory.exists) directory.create({ intermediates: true, idempotent: true });
  const file = fileForDocument(storageId);
  file.create({ intermediates: true, overwrite: true });
  file.write(encrypted);
}

async function readEncrypted(storageId: string): Promise<Uint8Array> {
  if (Platform.OS === 'web') {
    const database = await openDocumentDatabase();
    try {
      const transaction = database.transaction(OBJECT_STORE, 'readonly');
      const completed = transactionComplete(transaction);
      const result = await requestResult(transaction.objectStore(OBJECT_STORE).get(storageId) as IDBRequest<ArrayBuffer | undefined>);
      await completed;
      if (!result) throw new Error('This encrypted document file is missing from this browser.');
      return new Uint8Array(result);
    } finally {
      database.close();
    }
  }

  const file = fileForDocument(storageId);
  if (!file.exists) throw new Error('This encrypted document file is missing from this device.');
  return file.bytes();
}

function encryptDocument(bytes: Uint8Array, key: string): Uint8Array {
  const nonce = Crypto.getRandomBytes(12);
  return encryptDocumentBytes(bytes, key, nonce);
}

export async function saveEncryptedDocument(bytes: Uint8Array, key: string): Promise<string> {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0 || bytes.length > MAX_STORED_DOCUMENT_BYTES) {
    throw new Error('Choose a document smaller than 20 MB.');
  }
  if (!/^[0-9a-f]{64}$/i.test(key)) throw new Error('The vault is locked. Unlock it before saving documents.');
  const storageId = bytesToHex(await Crypto.getRandomBytesAsync(16));
  await writeEncrypted(storageId, encryptDocument(bytes, key));
  return storageId;
}

export async function decryptDocument(storageId: string, key: string): Promise<Uint8Array> {
  if (!/^[0-9a-f]{32}$/i.test(storageId) || !/^[0-9a-f]{64}$/i.test(key)) {
    throw new Error('The document reference or vault key is invalid.');
  }
  const envelope = await readEncrypted(storageId);
  try {
    return decryptDocumentBytes(envelope, key);
  } catch {
    throw new Error('This document could not be decrypted. The encrypted file was not changed.');
  }
}

export async function deleteEncryptedDocument(storageId: string): Promise<void> {
  if (!/^[0-9a-f]{32}$/i.test(storageId)) throw new Error('The document reference is invalid.');
  if (Platform.OS === 'web') {
    const database = await openDocumentDatabase();
    try {
      const transaction = database.transaction(OBJECT_STORE, 'readwrite');
      const completed = transactionComplete(transaction);
      transaction.objectStore(OBJECT_STORE).delete(storageId);
      await completed;
    } finally {
      database.close();
    }
    return;
  }
  const file = fileForDocument(storageId);
  if (file.exists) file.delete();
}

export async function exportDecryptedDocument(
  storageId: string,
  key: string,
  filename: string,
  mimeType: string,
): Promise<void> {
  const bytes = await decryptDocument(storageId, key);
  if (Platform.OS === 'web') {
    const blobBuffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(blobBuffer).set(bytes);
    const blob = new Blob([blobBuffer], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename.replace(/[\\/:*?"<>|]/g, '_');
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('File viewing or sharing is not available on this device.');
  }
  const extension = mimeType === 'application/pdf' ? 'pdf' : mimeType.split('/')[1] || 'bin';
  const temporaryFile = new File(Paths.cache, `private-document-${Date.now()}.${extension}`);
  temporaryFile.create({ intermediates: true, overwrite: true });
  try {
    temporaryFile.write(bytes);
    await Sharing.shareAsync(temporaryFile.uri, { dialogTitle: 'Open or share document', mimeType });
  } finally {
    if (temporaryFile.exists) temporaryFile.delete();
  }
}
