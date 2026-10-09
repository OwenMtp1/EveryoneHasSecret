import type { AuthResponse, MeResponse, PendingProfileResponse } from '@shared/protocol';
import type { Profile } from '@shared/types';
import { getAccessToken, refreshAccessToken } from './auth';

export { tokenStore } from './auth';

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown, retried = false): Promise<T> {
  const token = await getAccessToken();
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Serveur injoignable. Vérifiez votre connexion.', 0);
  }
  const data = await res.json().catch(() => ({}));
  // Jeton expiré entre deux renouvellements automatiques : un essai de plus avec un jeton neuf
  if (res.status === 401 && !retried && token && (await refreshAccessToken())) return request<T>(method, path, body, true);
  if (!res.ok) throw new ApiError(data.error ?? `Erreur ${res.status}`, res.status);
  return data as T;
}

export const api = {
  register: (username: string, password: string) => request<AuthResponse>('POST', '/api/auth/register', { username, password }),
  login: (username: string, password: string) => request<AuthResponse>('POST', '/api/auth/login', { username, password }),
  logout: () => request<{ ok: true }>('POST', '/api/auth/logout'),
  me: () => request<MeResponse | PendingProfileResponse>('GET', '/api/me'),
  claimUsername: (username: string) => request<{ user: { id: string; username: string } }>('POST', '/api/profile/username', { username }),
  usernameAvailable: (u: string) => request<{ available: boolean }>('GET', `/api/auth/username-available?u=${encodeURIComponent(u)}`),
  profile: (id: string) => request<Profile>('GET', `/api/profile/${id}`),
  history: () => request<{ lobby_name: string; case_type: string; summary: string; players: string; ended_at: number }[]>('GET', '/api/history'),
};
