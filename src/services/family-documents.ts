import * as Crypto from 'expo-crypto';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { bytesToHex } from '@noble/hashes/utils.js';
import { Platform } from 'react-native';
import {
  getFamilyDocumentContent,
  getOwnFamilyPublicKey,
  publishFamilyDocument,
  registerFamilyPublicKey,
  respondToDocumentRequest,
  type FamilyDocumentRequest,
} from '@/services/api/family';
import {
  activateFamilyRecoveryKey,
  decryptFamilyDocument,
  encryptFamilyDocument,
  getLocalFamilyPublicKey,
  rewrapFamilyDocumentKey,
} from '@/services/family-encryption';

export async function publishVaultDocument(input: {
  bytes: Uint8Array;
  ownerUid: string;
  title: string;
  category: string;
  filename: string;
  mimeType: string;
}) {
  const { public_key: serverPublicKey } = await getOwnFamilyPublicKey();
  const localPublicKey = await getLocalFamilyPublicKey(input.ownerUid);
  if (!serverPublicKey || !localPublicKey || serverPublicKey !== localPublicKey) {
    throw new Error('Set up or unlock your family document recovery key on the Family screen before sharing.');
  }

  const id = bytesToHex(await Crypto.getRandomBytesAsync(12));
  const { encryptedContent, ownerWrappedKey } = await encryptFamilyDocument(
    input.bytes,
    input.ownerUid,
    serverPublicKey,
    id,
  );
  return publishFamilyDocument({
    id,
    title: input.title,
    category: input.category,
    filename: input.filename,
    mime_type: input.mimeType,
    encrypted_content: encryptedContent,
    owner_wrapped_key: ownerWrappedKey,
  });
}

export async function approveFamilyDocumentRequest(
  request: FamilyDocumentRequest,
  ownerUid: string,
  requesterPublicKey: string,
): Promise<void> {
  const content = await getFamilyDocumentContent(request.document_id);
  const { public_key: serverPublicKey } = await getOwnFamilyPublicKey();
  const localPublicKey = await getLocalFamilyPublicKey(ownerUid);
  if (!serverPublicKey || localPublicKey !== serverPublicKey) {
    throw new Error('Restore your family recovery key before approving document access.');
  }
  const wrappedKey = await rewrapFamilyDocumentKey(
    content.wrapped_key,
    ownerUid,
    request.document_id,
    request.requester_uid,
    requesterPublicKey,
  );
  await respondToDocumentRequest(request.id, wrappedKey);
}

export async function restoreFamilyPublicKey(uid: string, recoveryKey: string, expectedPublicKey?: string): Promise<void> {
  const publicKey = await activateFamilyRecoveryKey(uid, recoveryKey, expectedPublicKey);
  await registerFamilyPublicKey(publicKey);
}

export async function openSharedFamilyDocument(
  encryptedContent: string,
  wrappedKey: string,
  uid: string,
  documentId: string,
  filename: string,
  mimeType: string,
): Promise<void> {
  const bytes = await decryptFamilyDocument(encryptedContent, wrappedKey, uid, documentId);
  if (Platform.OS === 'web') {
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    const url = URL.createObjectURL(new Blob([buffer], { type: mimeType }));
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
  const extension = filename.split('.').pop() || (mimeType === 'application/pdf' ? 'pdf' : 'bin');
  const temporaryFile = new File(Paths.cache, `family-document-${Date.now()}.${extension}`);
  temporaryFile.create({ intermediates: true, overwrite: true });
  try {
    temporaryFile.write(bytes);
    await Sharing.shareAsync(temporaryFile.uri, { dialogTitle: 'Open shared family document', mimeType });
  } finally {
    if (temporaryFile.exists) temporaryFile.delete();
  }
}
