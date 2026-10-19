import { apiRequest } from './client';
import type { LifeItem, LifeItemInput, LifeItemKind, LifeItemUpdate } from '@/types/life-item';

export function getLifeItems(kind: LifeItemKind): Promise<LifeItem[]> {
  return apiRequest<LifeItem[]>(`/life-items?kind=${kind}`);
}

export function createLifeItem(input: LifeItemInput): Promise<LifeItem> {
  return apiRequest<LifeItem>('/life-items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function updateLifeItem(id: string, input: LifeItemUpdate): Promise<LifeItem> {
  return apiRequest<LifeItem>(`/life-items/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function deleteLifeItem(id: string): Promise<void> {
  return apiRequest<void>(`/life-items/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
