/**
 * Persistance META (comptes, profils, amis, notifications, historique) derrière une interface asynchrone.
 *
 *  - SqliteStore   : développement, tests, auto-hébergement avec disque persistant (node:sqlite).
 *  - PostgresStore : production avec Supabase Postgres (DATABASE_URL). Les comptes et mots de passe
 *                    sont alors gérés par Supabase Auth : la table `profiles` est liée à auth.users.
 *
 * L'état d'une partie en cours reste en mémoire (serveur autoritaire) ; seul son résumé est persisté.
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AppNotification, NotificationType } from '@shared/types';

export interface UserRecord {
  id: string;
  username: string;
  createdAt: number;
}

export interface FriendshipRecord {
  userA: string;
  userB: string;
  status: 'pending' | 'accepted';
  requestedBy: string;
}

export interface HistoryRecord {
  id: string;
  lobbyName: string;
  caseType: string;
  summary: string;
  players: string[];
  endedAt: number;
}

/** Le pseudo existe déjà (contrainte d'unicité insensible à la casse). */
export class DuplicateUsernameError extends Error {}

export interface MetaStore {
  readonly kind: 'sqlite' | 'postgres';
  // ── comptes / profils ──
  getUser(id: string): Promise<UserRecord | null>;
  getUsers(ids: string[]): Promise<Map<string, UserRecord>>;
  findByUsername(username: string): Promise<UserRecord | null>;
  searchUsers(term: string, excludeId: string, limit: number): Promise<UserRecord[]>;
  /** Crée le profil d'un compte (Supabase) ou le compte local complet (SQLite, avec mot de passe). */
  createProfile(id: string, username: string, createdAt: number, passwordHash?: string): Promise<void>;
  getStats(id: string): Promise<{ gamesPlayed: number; gamesWon: number }>;
  recordGame(id: string, won: boolean): Promise<void>;
  // ── authentification locale (SQLite uniquement) ──
  getCredentials(username: string): Promise<(UserRecord & { passwordHash: string }) | null>;
  createSession(token: string, userId: string, createdAt: number, expiresAt: number): Promise<void>;
  getSession(token: string): Promise<{ userId: string; expiresAt: number } | null>;
  deleteSession(token: string): Promise<void>;
  // ── amis ──
  getFriendship(a: string, b: string): Promise<FriendshipRecord | null>;
  listFriendships(userId: string): Promise<FriendshipRecord[]>;
  insertFriendship(a: string, b: string, requestedBy: string, createdAt: number): Promise<void>;
  acceptFriendship(a: string, b: string): Promise<void>;
  deleteFriendship(a: string, b: string): Promise<void>;
  // ── notifications ──
  insertNotification(userId: string, n: AppNotification): Promise<void>;
  listNotifications(userId: string, limit: number): Promise<AppNotification[]>;
  markRead(userId: string, ids: string[]): Promise<void>;
  // ── historique (seulement les parties auxquelles l'utilisateur a participé) ──
  insertGame(h: HistoryRecord, participantIds: string[]): Promise<void>;
  listHistory(userId: string, limit: number): Promise<HistoryRecord[]>;
  close(): Promise<void>;
}

const num = (v: unknown) => (typeof v === 'string' ? Number(v) : (v as number));

interface NotificationRow {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  payload: string | Record<string, unknown> | null;
  read: number | boolean;
  created_at: number | string;
}
const toNotification = (r: NotificationRow): AppNotification => ({
  id: r.id,
  type: r.type,
  title: r.title,
  body: r.body,
  payload: r.payload == null ? undefined : typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload,
  read: !!r.read,
  createdAt: num(r.created_at),
});
const toFriendship = (r: { user_a: string; user_b: string; status: string; requested_by: string }): FriendshipRecord => ({
  userA: r.user_a,
  userB: r.user_b,
  status: r.status as FriendshipRecord['status'],
  requestedBy: r.requested_by,
});
const toHistory = (r: { id: string; lobby_name: string; case_type: string; summary: string; players: string | string[]; ended_at: number | string }): HistoryRecord => ({
  id: r.id,
  lobbyName: r.lobby_name,
  caseType: r.case_type,
  summary: r.summary,
  players: typeof r.players === 'string' ? JSON.parse(r.players) : r.players,
  endedAt: num(r.ended_at),
});
/** Échappe les jokers LIKE d'un terme de recherche. */
const likeTerm = (t: string) => `%${t.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

// ─────────────────────────────── SQLite ───────────────────────────────

const SQLITE_SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  games_played INTEGER NOT NULL DEFAULT 0,
  games_won INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS friendships (
  user_a TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_a, user_b)
);
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  payload TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at);
CREATE TABLE IF NOT EXISTS game_history (
  id TEXT PRIMARY KEY,
  lobby_name TEXT NOT NULL,
  case_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  players TEXT NOT NULL,
  ended_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS game_participants (
  game_id TEXT NOT NULL REFERENCES game_history(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (game_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
`;

export class SqliteStore implements MetaStore {
  readonly kind = 'sqlite' as const;
  readonly db: DatabaseSync;

  constructor(path = 'data/ehas.sqlite') {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    this.db.exec(SQLITE_SCHEMA);
    // sessions expirées : purge au démarrage
    this.db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  }

  private one<T>(sql: string, ...params: (string | number | null)[]): T | null {
    return (this.db.prepare(sql).get(...params) as T | undefined) ?? null;
  }
  private all<T>(sql: string, ...params: (string | number | null)[]): T[] {
    return this.db.prepare(sql).all(...params) as unknown as T[];
  }
  private user(r: { id: string; username: string; created_at: number } | null): UserRecord | null {
    return r ? { id: r.id, username: r.username, createdAt: r.created_at } : null;
  }

  async getUser(id: string) {
    return this.user(this.one('SELECT id, username, created_at FROM users WHERE id = ?', id));
  }
  async getUsers(ids: string[]) {
    const out = new Map<string, UserRecord>();
    for (const id of new Set(ids)) {
      const u = await this.getUser(id);
      if (u) out.set(id, u);
    }
    return out;
  }
  async findByUsername(username: string) {
    return this.user(this.one('SELECT id, username, created_at FROM users WHERE username = ?', username.trim()));
  }
  async searchUsers(term: string, excludeId: string, limit: number) {
    return this.all<{ id: string; username: string; created_at: number }>(
      "SELECT id, username, created_at FROM users WHERE lower(username) LIKE ? ESCAPE '\\' AND id != ? ORDER BY username LIMIT ?",
      likeTerm(term),
      excludeId,
      limit,
    ).map((r) => this.user(r)!);
  }
  async createProfile(id: string, username: string, createdAt: number, passwordHash?: string) {
    if (!passwordHash) throw new Error('SQLite : un compte local exige un mot de passe.');
    try {
      this.db.prepare('INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)').run(id, username, passwordHash, createdAt);
    } catch (e) {
      if (String((e as Error).message).includes('UNIQUE')) throw new DuplicateUsernameError();
      throw e;
    }
    this.db.prepare('INSERT INTO profiles (user_id) VALUES (?)').run(id);
  }
  async getStats(id: string) {
    const r = this.one<{ games_played: number; games_won: number }>('SELECT games_played, games_won FROM profiles WHERE user_id = ?', id);
    return { gamesPlayed: r?.games_played ?? 0, gamesWon: r?.games_won ?? 0 };
  }
  async recordGame(id: string, won: boolean) {
    this.db.prepare('UPDATE profiles SET games_played = games_played + 1, games_won = games_won + ? WHERE user_id = ?').run(won ? 1 : 0, id);
  }
  async getCredentials(username: string) {
    const r = this.one<{ id: string; username: string; created_at: number; password_hash: string }>(
      'SELECT id, username, created_at, password_hash FROM users WHERE username = ?',
      username.trim(),
    );
    return r ? { id: r.id, username: r.username, createdAt: r.created_at, passwordHash: r.password_hash } : null;
  }
  async createSession(token: string, userId: string, createdAt: number, expiresAt: number) {
    this.db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(token, userId, createdAt, expiresAt);
  }
  async getSession(token: string) {
    const r = this.one<{ user_id: string; expires_at: number }>('SELECT user_id, expires_at FROM sessions WHERE token = ?', token);
    return r ? { userId: r.user_id, expiresAt: r.expires_at } : null;
  }
  async deleteSession(token: string) {
    this.db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  }
  async getFriendship(a: string, b: string) {
    const r = this.one<Parameters<typeof toFriendship>[0]>('SELECT * FROM friendships WHERE user_a = ? AND user_b = ?', a, b);
    return r ? toFriendship(r) : null;
  }
  async listFriendships(userId: string) {
    return this.all<Parameters<typeof toFriendship>[0]>('SELECT * FROM friendships WHERE user_a = ? OR user_b = ?', userId, userId).map(toFriendship);
  }
  async insertFriendship(a: string, b: string, requestedBy: string, createdAt: number) {
    this.db.prepare("INSERT INTO friendships (user_a, user_b, status, requested_by, created_at) VALUES (?, ?, 'pending', ?, ?)").run(a, b, requestedBy, createdAt);
  }
  async acceptFriendship(a: string, b: string) {
    this.db.prepare("UPDATE friendships SET status = 'accepted' WHERE user_a = ? AND user_b = ?").run(a, b);
  }
  async deleteFriendship(a: string, b: string) {
    this.db.prepare('DELETE FROM friendships WHERE user_a = ? AND user_b = ?').run(a, b);
  }
  async insertNotification(userId: string, n: AppNotification) {
    this.db
      .prepare('INSERT INTO notifications (id, user_id, type, title, body, payload, read, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)')
      .run(n.id, userId, n.type, n.title, n.body, n.payload ? JSON.stringify(n.payload) : null, n.createdAt);
  }
  async listNotifications(userId: string, limit: number) {
    return this.all<NotificationRow>('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?', userId, limit).map(toNotification);
  }
  async markRead(userId: string, ids: string[]) {
    const stmt = this.db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ? AND id = ?');
    for (const id of ids) stmt.run(userId, id);
  }
  async insertGame(h: HistoryRecord, participantIds: string[]) {
    this.db
      .prepare('INSERT INTO game_history (id, lobby_name, case_type, summary, players, ended_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(h.id, h.lobbyName, h.caseType, h.summary, JSON.stringify(h.players), h.endedAt);
    const stmt = this.db.prepare('INSERT OR IGNORE INTO game_participants (game_id, user_id) VALUES (?, ?)');
    for (const u of participantIds) {
      try {
        stmt.run(h.id, u);
      } catch {
        /* compte supprimé entre-temps */
      }
    }
  }
  async listHistory(userId: string, limit: number) {
    return this.all<Parameters<typeof toHistory>[0]>(
      'SELECT h.* FROM game_history h JOIN game_participants p ON p.game_id = h.id WHERE p.user_id = ? ORDER BY h.ended_at DESC LIMIT ?',
      userId,
      limit,
    ).map(toHistory);
  }
  async close() {
    try {
      this.db.close();
    } catch {
      /* déjà fermée */
    }
  }
}

// ─────────────────────────────── Postgres (Supabase) ───────────────────────────────

/** Sous-ensemble de `pg.Pool` (aussi implémenté par PGlite dans les tests). */
export interface PgQueryable {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  end?(): Promise<void>;
  close?(): Promise<void>;
}

export class PostgresStore implements MetaStore {
  readonly kind = 'postgres' as const;

  constructor(private pg: PgQueryable) {}

  private async rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return (await this.pg.query(sql, params)).rows as T[];
  }
  private user(r: { id: string; username: string; created_at: number | string } | undefined): UserRecord | null {
    return r ? { id: r.id, username: r.username, createdAt: num(r.created_at) } : null;
  }

  async getUser(id: string) {
    if (!isUuid(id)) return null;
    return this.user((await this.rows<{ id: string; username: string; created_at: string }>('SELECT id, username, created_at FROM public.profiles WHERE id = $1', [id]))[0]);
  }
  async getUsers(ids: string[]) {
    const valid = [...new Set(ids)].filter(isUuid);
    const out = new Map<string, UserRecord>();
    if (!valid.length) return out;
    for (const r of await this.rows<{ id: string; username: string; created_at: string }>('SELECT id, username, created_at FROM public.profiles WHERE id = ANY($1::uuid[])', [valid]))
      out.set(r.id, this.user(r)!);
    return out;
  }
  async findByUsername(username: string) {
    return this.user((await this.rows<{ id: string; username: string; created_at: string }>('SELECT id, username, created_at FROM public.profiles WHERE lower(username) = lower($1)', [username.trim()]))[0]);
  }
  async searchUsers(term: string, excludeId: string, limit: number) {
    return (
      await this.rows<{ id: string; username: string; created_at: string }>(
        "SELECT id, username, created_at FROM public.profiles WHERE lower(username) LIKE $1 ESCAPE '\\' AND id <> $2::uuid ORDER BY username LIMIT $3",
        [likeTerm(term), excludeId, limit],
      )
    ).map((r) => this.user(r)!);
  }
  async createProfile(id: string, username: string, createdAt: number) {
    try {
      await this.pg.query('INSERT INTO public.profiles (id, username, created_at) VALUES ($1, $2, $3)', [id, username, createdAt]);
    } catch (e) {
      const err = e as { code?: string; message?: string };
      if (err.code === '23505' && /username/.test(err.message ?? '')) throw new DuplicateUsernameError();
      if (err.code === '23505') return; // profil déjà créé (requêtes concurrentes)
      throw e;
    }
  }
  async getStats(id: string) {
    const r = (await this.rows<{ games_played: number; games_won: number }>('SELECT games_played, games_won FROM public.profiles WHERE id = $1', [id]))[0];
    return { gamesPlayed: r?.games_played ?? 0, gamesWon: r?.games_won ?? 0 };
  }
  async recordGame(id: string, won: boolean) {
    if (!isUuid(id)) return;
    await this.pg.query('UPDATE public.profiles SET games_played = games_played + 1, games_won = games_won + $1 WHERE id = $2', [won ? 1 : 0, id]);
  }
  async getCredentials(): Promise<null> {
    return null; // Supabase Auth gère les mots de passe
  }
  async createSession(): Promise<void> {
    throw new Error('Sessions gérées par Supabase Auth.');
  }
  async getSession(): Promise<null> {
    return null;
  }
  async deleteSession(): Promise<void> {}
  async getFriendship(a: string, b: string) {
    if (!isUuid(a) || !isUuid(b)) return null;
    const r = (await this.rows<Parameters<typeof toFriendship>[0]>('SELECT * FROM public.friendships WHERE user_a = $1 AND user_b = $2', [a, b]))[0];
    return r ? toFriendship(r) : null;
  }
  async listFriendships(userId: string) {
    if (!isUuid(userId)) return [];
    return (await this.rows<Parameters<typeof toFriendship>[0]>('SELECT * FROM public.friendships WHERE user_a = $1 OR user_b = $1', [userId])).map(toFriendship);
  }
  async insertFriendship(a: string, b: string, requestedBy: string, createdAt: number) {
    await this.pg.query("INSERT INTO public.friendships (user_a, user_b, status, requested_by, created_at) VALUES ($1, $2, 'pending', $3, $4)", [a, b, requestedBy, createdAt]);
  }
  async acceptFriendship(a: string, b: string) {
    await this.pg.query("UPDATE public.friendships SET status = 'accepted' WHERE user_a = $1 AND user_b = $2", [a, b]);
  }
  async deleteFriendship(a: string, b: string) {
    await this.pg.query('DELETE FROM public.friendships WHERE user_a = $1 AND user_b = $2', [a, b]);
  }
  async insertNotification(userId: string, n: AppNotification) {
    await this.pg.query(
      'INSERT INTO public.notifications (id, user_id, type, title, body, payload, read, created_at) VALUES ($1, $2, $3, $4, $5, $6, false, $7)',
      [n.id, userId, n.type, n.title, n.body, n.payload ? JSON.stringify(n.payload) : null, n.createdAt],
    );
  }
  async listNotifications(userId: string, limit: number) {
    if (!isUuid(userId)) return [];
    return (await this.rows<NotificationRow>('SELECT * FROM public.notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2', [userId, limit])).map(toNotification);
  }
  async markRead(userId: string, ids: string[]) {
    if (!ids.length) return;
    await this.pg.query('UPDATE public.notifications SET read = true WHERE user_id = $1 AND id = ANY($2::text[])', [userId, ids]);
  }
  async insertGame(h: HistoryRecord, participantIds: string[]) {
    await this.pg.query('INSERT INTO public.game_history (id, lobby_name, case_type, summary, players, ended_at) VALUES ($1, $2, $3, $4, $5, $6)', [
      h.id,
      h.lobbyName,
      h.caseType,
      h.summary,
      JSON.stringify(h.players),
      h.endedAt,
    ]);
    const ids = participantIds.filter(isUuid);
    if (ids.length)
      await this.pg.query(
        'INSERT INTO public.game_participants (game_id, user_id) SELECT $1, u FROM unnest($2::uuid[]) AS u WHERE EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u) ON CONFLICT DO NOTHING',
        [h.id, ids],
      );
  }
  async listHistory(userId: string, limit: number) {
    if (!isUuid(userId)) return [];
    return (
      await this.rows<Parameters<typeof toHistory>[0]>(
        'SELECT h.* FROM public.game_history h JOIN public.game_participants p ON p.game_id = h.id WHERE p.user_id = $1 ORDER BY h.ended_at DESC LIMIT $2',
        [userId, limit],
      )
    ).map(toHistory);
  }
  async close() {
    await (this.pg.end?.() ?? this.pg.close?.());
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: unknown): s is string => typeof s === 'string' && UUID.test(s);
