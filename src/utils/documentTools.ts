export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
export const MAX_PDF_PAGES = 60;

export type DocumentOperation = 'compress' | 'resize' | 'pdf-to-jpg' | 'jpg-to-pdf';
export type CompressionMode = 'auto' | 'manual';
export type FileSizeUnit = 'KB' | 'MB';
export interface ProcessingOptions {
  operation: DocumentOperation;
  mode: CompressionMode;
  targetBytes?: number;
  width?: number;
  height?: number;
}
export interface ProcessedDocument {
  bytes: Uint8Array;
  filename: string;
  mimeType: string;
}

export function parseTargetSize(value: string, unit: FileSizeUnit): number {
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value.trim())) throw new Error(`Enter a size in ${unit}, for example ${unit === 'KB' ? '200 or 500' : '0.5 or 2'}.`);
  const bytes = Number(value) * (unit === 'KB' ? 1024 : 1024 * 1024);
  if (!Number.isFinite(bytes) || bytes < 1024 || bytes > MAX_DOCUMENT_BYTES) throw new Error('Choose a target between 1 KB and 20 MB.');
  return Math.floor(bytes);
}

export function parseDimension(value: string): number | undefined {
  if (!value.trim()) return undefined;
  if (!/^\d+$/.test(value) || Number(value) < 16 || Number(value) > 6000) {
    throw new Error('Image dimensions must be whole numbers between 16 and 6000 pixels.');
  }
  return Number(value);
}

export function fitDimensions(width: number, height: number, maxEdge: number, bounds?: { width?: number; height?: number }) {
  const scale = Math.min(1, maxEdge / Math.max(width, height), (bounds?.width ?? width) / width, (bounds?.height ?? height) / height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function outputFilename(filename: string, suffix: string, extension: string): string {
  return `${filename.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_') || 'document'}-${suffix}.${extension}`;
}

export function formatDocumentSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function checkProcessing(signal?: AbortSignal) {
  if (signal?.aborted) throw new Error('Processing stopped because the vault was locked or the tool was closed.');
}

// Check actual encoded bytes. Never pad a file or claim an unreachable target succeeded.
export async function encodeWithinLimit(
  encode: (quality: number, maxEdge: number) => Promise<Uint8Array>,
  targetBytes: number | undefined,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  if (targetBytes !== undefined && (!Number.isInteger(targetBytes) || targetBytes < 1 || targetBytes > MAX_DOCUMENT_BYTES)) {
    throw new Error('The target file size is invalid.');
  }
  const limit = targetBytes ?? MAX_DOCUMENT_BYTES;
  let quality = 0.82;
  let edge = 2400;
  let smallest = Infinity;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    checkProcessing(signal);
    const bytes = await encode(quality, edge);
    checkProcessing(signal);
    if (!bytes.length) throw new Error('The file could not be encoded.');
    smallest = Math.min(smallest, bytes.length);
    if (bytes.length <= limit) return bytes;
    if (quality > 0.4) quality = Math.max(0.4, Math.round((quality - 0.14) * 100) / 100);
    else {
      edge = Math.max(128, Math.floor(edge * Math.max(0.3, Math.min(0.8, Math.sqrt(limit / bytes.length) * 0.9))));
    }
  }
  throw new Error(`Could not reach ${formatDocumentSize(limit)}. Smallest attempt: ${formatDocumentSize(smallest)}. Choose a larger target; the original is safe in your vault.`);
}
