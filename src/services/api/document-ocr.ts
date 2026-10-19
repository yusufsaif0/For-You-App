import { apiRequest } from '@/services/api/client';

export interface ExtractedDocumentField {
  label: string;
  value: string;
}

export interface DocumentOCRResult {
  document_type: string;
  fields: ExtractedDocumentField[];
}

export async function extractDocumentFields(fileBase64: string, mimeType: string): Promise<DocumentOCRResult> {
  const body = await apiRequest<unknown>('/documents/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_base64: fileBase64, mime_type: mimeType }),
    timeoutMs: 90_000,
  });
  if (
    typeof body !== 'object' || body === null ||
    !('document_type' in body) || typeof body.document_type !== 'string' ||
    !('fields' in body) || !Array.isArray(body.fields) ||
    !body.fields.every((field: unknown) =>
      typeof field === 'object' && field !== null &&
      'label' in field && typeof field.label === 'string' &&
      'value' in field && typeof field.value === 'string')
  ) {
    throw new Error('The document extraction service returned an invalid result.');
  }
  return { document_type: body.document_type, fields: body.fields };
}
