import { gcm } from '@noble/ciphers/aes.js';
import { x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToBase64, base64ToBytes } from './documentCrypto.ts';
import { utf8ToBytes } from '@noble/hashes/utils.js';

function deriveWrappingKey(sharedSecret: Uint8Array, salt: Uint8Array, documentId: string, recipientUid: string): Uint8Array {
  return hkdf(
    sha256,
    sharedSecret,
    salt,
    utf8ToBytes(`daily-life-family-document-key:v1:${documentId}:${recipientUid}`),
    32,
  );
}

export function familyPublicKey(privateKey: Uint8Array): Uint8Array {
  if (privateKey.length !== 32) throw new Error('The family private key is invalid.');
  return x25519.getPublicKey(privateKey);
}

export function wrapFamilyDocumentKey(
  documentKey: Uint8Array,
  recipientPublicKey: string,
  documentId: string,
  recipientUid: string,
  ephemeralPrivate: Uint8Array,
  salt: Uint8Array,
  nonce: Uint8Array,
): string {
  const recipient = base64ToBytes(recipientPublicKey);
  if (recipient.length !== 32 || documentKey.length !== 32 || ephemeralPrivate.length !== 32 || salt.length !== 16 || nonce.length !== 12) {
    throw new Error('The family encryption key is invalid.');
  }
  const ephemeralPublic = familyPublicKey(ephemeralPrivate);
  const sharedSecret = x25519.getSharedSecret(ephemeralPrivate, recipient);
  const wrappingKey = deriveWrappingKey(sharedSecret, salt, documentId, recipientUid);
  const aad = utf8ToBytes(`daily-life-family-document-envelope:v1:${documentId}:${recipientUid}`);
  try {
    const wrappedKey = gcm(wrappingKey, nonce, aad).encrypt(documentKey);
    const envelope = new Uint8Array(ephemeralPublic.length + salt.length + nonce.length + wrappedKey.length);
    let offset = 0;
    for (const part of [ephemeralPublic, salt, nonce, wrappedKey]) {
      envelope.set(part, offset);
      offset += part.length;
    }
    return bytesToBase64(envelope);
  } finally {
    ephemeralPrivate.fill(0);
    sharedSecret.fill(0);
    wrappingKey.fill(0);
  }
}

export function unwrapFamilyDocumentKey(
  wrappedKey: string,
  privateKey: Uint8Array,
  documentId: string,
  recipientUid: string,
): Uint8Array {
  const envelope = base64ToBytes(wrappedKey);
  if (envelope.length !== 108 || privateKey.length !== 32) {
    throw new Error('The encrypted document access key is invalid.');
  }
  const ephemeralPublic = envelope.slice(0, 32);
  const salt = envelope.slice(32, 48);
  const nonce = envelope.slice(48, 60);
  const ciphertext = envelope.slice(60);
  const sharedSecret = x25519.getSharedSecret(privateKey, ephemeralPublic);
  const wrappingKey = deriveWrappingKey(sharedSecret, salt, documentId, recipientUid);
  const aad = utf8ToBytes(`daily-life-family-document-envelope:v1:${documentId}:${recipientUid}`);
  try {
    return gcm(wrappingKey, nonce, aad).decrypt(ciphertext);
  } catch {
    throw new Error('This account cannot decrypt the document access key.');
  } finally {
    sharedSecret.fill(0);
    wrappingKey.fill(0);
    privateKey.fill(0);
  }
}
