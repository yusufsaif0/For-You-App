import { apiRequest } from '@/services/api/client';

export type ApplicationService = 'unknown' | 'ews' | 'residence' | 'examination' | 'other';
export type ApplicationFieldKind = 'field' | 'document';

export interface ApplicationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ApplicationScope {
  service: ApplicationService;
  state: string;
  district: string;
  institution: string;
  session: string;
}

export interface ApplicationRequirement {
  key: string;
  label: string;
  kind: ApplicationFieldKind;
  required: boolean;
  description: string;
  source_url: string;
}

export interface ApplicationFact {
  value: string;
  source_url: string;
}

export interface ApplicationSource {
  url: string;
  title: string;
  checked_at: string;
}

export interface ApplicationPlan {
  title: string;
  scope: ApplicationScope;
  portal_url: string;
  requirements: ApplicationRequirement[];
  fee: ApplicationFact;
  deadline: ApplicationFact;
  sources: ApplicationSource[];
  research_id: string;
}

export interface ApplicationChatResponse {
  reply: string;
  plan: ApplicationPlan;
  suggested_values: Record<string, string>;
  questions: string[];
  submission_mode: 'guided';
}

export interface ApplicationCapabilities {
  processing_enabled: boolean;
  submission_mode: 'guided';
  automated_submission_available: false;
  message: string;
}

export interface ApplicationExtractedField {
  label: string;
  value: string;
}

export interface ApplicationExtraction {
  document_type: string;
  fields: ApplicationExtractedField[];
}

export async function getApplicationCapabilities(): Promise<ApplicationCapabilities> {
  const value = await apiRequest<unknown>('/applications/capabilities');
  if (
    typeof value !== 'object' || value === null ||
    !('processing_enabled' in value) || typeof value.processing_enabled !== 'boolean' ||
    !('submission_mode' in value) || value.submission_mode !== 'guided' ||
    !('automated_submission_available' in value) || value.automated_submission_available !== false ||
    !('message' in value) || typeof value.message !== 'string'
  ) {
    throw new Error('The application assistant returned an invalid configuration.');
  }
  return value as ApplicationCapabilities;
}

export async function chatAboutApplication(input: {
  messages: ApplicationMessage[];
  plan: ApplicationPlan;
  confirmed_fields: Record<string, string>;
  verify_requirements: boolean;
}): Promise<ApplicationChatResponse> {
  const value = await apiRequest<unknown>('/applications/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, processing_consent: true }),
    timeoutMs: 120_000,
  });
  if (
    typeof value !== 'object' || value === null ||
    !('reply' in value) || typeof value.reply !== 'string' ||
    !('plan' in value) || typeof value.plan !== 'object' || value.plan === null ||
    !('suggested_values' in value) || typeof value.suggested_values !== 'object' || value.suggested_values === null ||
    !('questions' in value) || !Array.isArray(value.questions) ||
    !('submission_mode' in value) || value.submission_mode !== 'guided'
  ) {
    throw new Error('The application assistant returned an invalid response.');
  }
  return value as ApplicationChatResponse;
}

export async function extractApplicationDocument(
  fileBase64: string,
  mimeType: string,
): Promise<ApplicationExtraction> {
  const value = await apiRequest<unknown>('/applications/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_base64: fileBase64, mime_type: mimeType, processing_consent: true }),
    timeoutMs: 120_000,
  });
  if (
    typeof value !== 'object' || value === null ||
    !('document_type' in value) || typeof value.document_type !== 'string' ||
    !('fields' in value) || !Array.isArray(value.fields) ||
    !value.fields.every((field: unknown) =>
      typeof field === 'object' && field !== null &&
      'label' in field && typeof field.label === 'string' &&
      'value' in field && typeof field.value === 'string')
  ) {
    throw new Error('Document extraction returned an invalid response.');
  }
  return value as ApplicationExtraction;
}
