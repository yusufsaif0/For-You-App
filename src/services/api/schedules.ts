import { apiRequest } from './client';
import type { Schedule, ScheduleCreateInput, ScheduleUpdateInput } from '@/types/schedule';

export function getScheduleCategories(): Promise<string[]> {
  return apiRequest<string[]>('/schedules/categories');
}

export function createScheduleCategory(name: string): Promise<string> {
  return apiRequest<string>('/schedules/categories', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
  });
}

export function getSchedules(): Promise<Schedule[]> {
  return apiRequest<Schedule[]>('/schedules');
}

export function updateSchedule(id: string, input: ScheduleUpdateInput): Promise<Schedule> {
  return apiRequest<Schedule>(`/schedules/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function deleteSchedule(id: string): Promise<void> {
  return apiRequest<void>(`/schedules/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function createSchedule(input: ScheduleCreateInput): Promise<Schedule> {
  return apiRequest<Schedule>('/schedules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}
