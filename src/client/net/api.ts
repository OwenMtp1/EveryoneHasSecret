import type { AuthResponse, MeResponse } from '@shared/protocol';
import type { Character, Profile } from '@shared/types';

const TOKEN_KEY = 'ehas.token';

export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(t: string | null) {
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* stockage indisponible : session limitée à l'onglet */
    }
  },
};

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = tokenStore.get();
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
  if (!res.ok) throw new ApiError(data.error ?? `Erreur ${res.status}`, res.status);
  return data as T;
}

export const api = {
  register: (username: string, password: string) => request<AuthResponse>('POST', '/api/auth/register', { username, password }),
  login: (username: string, password: string) => request<AuthResponse>('POST', '/api/auth/login', { username, password }),
  logout: () => request<{ ok: true }>('POST', '/api/auth/logout'),
  me: () => request<MeResponse>('GET', '/api/me'),
  saveCharacter: (c: Character) => request<{ character: Character }>('PUT', '/api/character', c),
  profile: (id: string) => request<Profile>('GET', `/api/profile/${id}`),
  history: () => request<{ lobby_name: string; case_type: string; summary: string; players: string; ended_at: number }[]>('GET', '/api/history'),
};
