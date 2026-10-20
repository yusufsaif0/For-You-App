import type { VaultRecord } from '../services/vault.ts';
import type { ProcessedDocument } from './documentTools.ts';

interface BatchStorage {
  assertActive: () => void;
  saveFile: (bytes: Uint8Array) => Promise<string>;
  deleteFile: (id: string) => Promise<void>;
  readRecords: () => VaultRecord[];
  commitRecords: (records: VaultRecord[]) => Promise<void>;
}

/** Commit the encrypted index once, after every file is written. Roll back unindexed files. */
export async function saveDocumentBatch(files: ProcessedDocument[], category: string, storage: BatchStorage): Promise<VaultRecord[]> {
  const saved: VaultRecord[] = [];
  let committed = false;
  try {
    storage.assertActive();
    for (const file of files) {
      storage.assertActive();
      const storageId = await storage.saveFile(file.bytes);
      const timestamp = new Date().toISOString();
      saved.push({
        id: storageId, type: 'document', title: file.filename.replace(/\.[^.]+$/, ''),
        documentCategory: category, documentFilename: file.filename, documentMimeType: file.mimeType,
        documentStorageId: storageId, documentSize: file.bytes.length, createdAt: timestamp, updatedAt: timestamp,
      });
    }
    storage.assertActive();
    await storage.commitRecords([...saved, ...storage.readRecords()]);
    committed = true;
    return saved;
  } catch (failure) {
    if (!committed) {
      const cleanup = await Promise.allSettled(saved.map((record) => storage.deleteFile(record.documentStorageId!)));
      if (cleanup.some((result) => result.status === 'rejected')) throw new Error('The files could not be saved. An encrypted temporary file may remain in local storage; your originals are unchanged.');
    }
    throw failure;
  }
}
