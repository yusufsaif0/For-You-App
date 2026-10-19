import { apiRequest } from './client';

export interface FamilyMember {
  uid: string;
  email: string;
  display_name: string;
  connected_at: string;
}

export interface FamilyRequest {
  id: string;
  direction: 'incoming' | 'outgoing';
  email: string;
  created_at: string;
}

export interface FamilyOverview {
  members: FamilyMember[];
  requests: FamilyRequest[];
  public_keys: Record<string, string>;
}

export interface FamilyTask {
  id: string;
  creator_uid: string;
  assignee_uid: string;
  title: string;
  notes?: string | null;
  due_at: string;
  reminder_at?: string | null;
  completed: boolean;
  created_at: string;
}

export interface FamilyWishContribution {
  contributor_uid: string;
  contributor_name: string;
  amount: number;
  created_at: string;
}

export interface FamilyWish {
  id: string;
  creator_uid: string;
  creator_name: string;
  member_uids: string[];
  title: string;
  target_amount: number;
  target_date: string;
  contributions: FamilyWishContribution[];
  created_at: string;
}

export interface FamilyDocument {
  id: string;
  owner_uid: string;
  owner_name: string;
  title: string;
  category: string;
  filename: string;
  mime_type: string;
  created_at: string;
  access_status: 'owner' | 'none' | 'pending' | 'approved';
}

export interface FamilyDocumentRequest {
  id: string;
  document_id: string;
  requester_uid: string;
  requester_name: string;
  owner_uid: string;
  document_title: string;
  status: 'pending' | 'approved' | 'declined';
  created_at: string;
}

export interface FamilyDocumentContent {
  encrypted_content: string;
  wrapped_key: string;
  mime_type: string;
  filename: string;
}

export function getFamilyOverview(): Promise<FamilyOverview> {
  return apiRequest<FamilyOverview>('/family');
}

export function inviteFamilyMember(email: string): Promise<FamilyRequest> {
  return apiRequest<FamilyRequest>('/family/invitations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
}

export function respondToFamilyInvitation(id: string, accept: boolean): Promise<void> {
  return apiRequest<void>(`/family/invitations/${encodeURIComponent(id)}/${accept ? 'accept' : 'decline'}`, {
    method: 'POST',
  });
}

export function removeFamilyMember(uid: string): Promise<void> {
  return apiRequest<void>(`/family/members/${encodeURIComponent(uid)}`, { method: 'DELETE' });
}

export function registerFamilyPublicKey(public_key: string): Promise<void> {
  return apiRequest<void>('/family/public-key', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ public_key }),
  });
}

export function getOwnFamilyPublicKey(): Promise<{ public_key: string | null }> {
  return apiRequest<{ public_key: string | null }>('/family/public-key');
}

export function getFamilyTasks(): Promise<FamilyTask[]> {
  return apiRequest<FamilyTask[]>('/family/tasks');
}

export function createFamilyTask(input: {
  assignee_uid: string;
  title: string;
  notes?: string;
  due_at: string;
  reminder_at?: string | null;
}): Promise<FamilyTask> {
  return apiRequest<FamilyTask>('/family/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function updateFamilyTask(id: string, completed: boolean): Promise<FamilyTask> {
  return apiRequest<FamilyTask>(`/family/tasks/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ completed }),
  });
}

export function deleteFamilyTask(id: string): Promise<void> {
  return apiRequest<void>(`/family/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function getFamilyWishes(): Promise<FamilyWish[]> {
  return apiRequest<FamilyWish[]>('/family/wishes');
}

export function createFamilyWish(input: {
  title: string;
  target_amount: number;
  target_date: string;
  member_uids: string[];
}): Promise<FamilyWish> {
  return apiRequest<FamilyWish>('/family/wishes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function updateFamilyWish(id: string, input: {
  title?: string;
  target_amount?: number;
  target_date?: string;
}): Promise<FamilyWish> {
  return apiRequest<FamilyWish>(`/family/wishes/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function contributeToFamilyWish(id: string, amount: number): Promise<FamilyWish> {
  return apiRequest<FamilyWish>(`/family/wishes/${encodeURIComponent(id)}/contributions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount }),
  });
}

export function deleteFamilyWish(id: string): Promise<void> {
  return apiRequest<void>(`/family/wishes/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function getFamilyDocuments(): Promise<FamilyDocument[]> {
  return apiRequest<FamilyDocument[]>('/family/documents');
}

export function publishFamilyDocument(input: {
  id: string;
  title: string;
  category: string;
  filename: string;
  mime_type: string;
  encrypted_content: string;
  owner_wrapped_key: string;
}): Promise<FamilyDocument> {
  return apiRequest<FamilyDocument>('/family/documents', {
    method: 'POST',
    timeoutMs: 60_000,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function requestFamilyDocumentAccess(id: string): Promise<FamilyDocumentRequest> {
  return apiRequest<FamilyDocumentRequest>(`/family/documents/${encodeURIComponent(id)}/requests`, {
    method: 'POST',
  });
}

export function getFamilyDocumentRequests(): Promise<{ incoming: FamilyDocumentRequest[]; outgoing: FamilyDocumentRequest[] }> {
  return apiRequest<{ incoming: FamilyDocumentRequest[]; outgoing: FamilyDocumentRequest[] }>('/family/document-requests');
}

export function respondToDocumentRequest(id: string, wrapped_key?: string): Promise<void> {
  return apiRequest<void>(`/family/document-requests/${encodeURIComponent(id)}/${wrapped_key ? 'approve' : 'decline'}`, {
    method: 'POST',
    ...(wrapped_key ? {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wrapped_key }),
    } : {}),
  });
}

export function getFamilyDocumentContent(id: string): Promise<FamilyDocumentContent> {
  return apiRequest<FamilyDocumentContent>(`/family/documents/${encodeURIComponent(id)}/content`, {
    timeoutMs: 60_000,
  });
}

export function deleteFamilyDocument(id: string): Promise<void> {
  return apiRequest<void>(`/family/documents/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
