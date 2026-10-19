import { API_URL } from '@/config/api';
import { auth } from '@/config/firebase';

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiRequestOptions extends RequestInit {
  timeoutMs?: number;
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { timeoutMs = 10_000, ...requestOptions } = options;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    if (!auth?.currentUser || !auth.currentUser.emailVerified) {
      throw new ApiError('Sign in with a verified email address to continue.', 401);
    }
    const idToken = await auth.currentUser.getIdToken();
    const response = await fetch(`${API_URL}${path}`, {
      ...requestOptions,
      signal: controller.signal,
      headers: { Accept: 'application/json', Authorization: `Bearer ${idToken}`, ...options.headers },
    });
    // Keep the timeout active until the body has finished downloading.
    const text = response.status === 204 ? '' : await response.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      if (response.ok) throw new ApiError('The server returned an unexpected response. Please try again.', response.status);
    }
    if (!response.ok) {
      if (response.status === 401) await auth.signOut();
      const detail = Array.isArray(body?.detail)
        ? body.detail.map((item: { msg?: string }) => item.msg).join(', ')
        : body?.detail;
      throw new ApiError(
        typeof detail === 'string' ? detail : 'Unable to save or load schedules. Please try again.',
        response.status,
      );
    }
    return body as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const reason = error instanceof Error && error.name === 'AbortError'
      ? 'The request timed out. Please try again.'
      : 'Could not connect. Check your connection and try again.';
    throw new ApiError(reason, 0);
  } finally {
    clearTimeout(timeout);
  }
}
