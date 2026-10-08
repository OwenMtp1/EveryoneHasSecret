/**
 * Authentification : comptes, mots de passe (scrypt + sel), sessions par jeton opaque.
 */
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { META_CONFIG } from '@shared/config';
import type { DB } from './db';
import { newId, UserError } from '../util';

export interface UserRow {
  id: string;
  username: string;
  created_at: number;
}

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [algo, saltHex, hashHex] = stored.split('$');
  if (algo !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(expected, actual);
}

export class AuthService {
  private attempts = new Map<string, { count: number; until: number }>();

  constructor(private db: DB) {}

  validateCredentials(username: unknown, password: unknown): { username: string; password: string } {
    if (typeof username !== 'string' || typeof password !== 'string') throw new UserError('Identifiants manquants.');
    const u = username.trim();
    const { min, max, pattern } = META_CONFIG.username;
    if (u.length < min || u.length > max) throw new UserError(`Le pseudo doit faire entre ${min} et ${max} caractères.`);
    if (!pattern.test(u)) throw new UserError('Le pseudo ne peut contenir que lettres, chiffres, « _ », « . » et « - ».');
    if (password.length < META_CONFIG.password.min) throw new UserError(`Le mot de passe doit faire au moins ${META_CONFIG.password.min} caractères.`);
    if (password.length > META_CONFIG.password.max) throw new UserError('Mot de passe trop long.');
    return { username: u, password };
  }

  register(usernameIn: unknown, passwordIn: unknown): { token: string; user: UserRow } {
    const { username, password } = this.validateCredentials(usernameIn, passwordIn);
    const exists = this.db.prepare('SELECT 1 FROM users WHERE username = ?').get(username);
    if (exists) throw new UserError('Ce pseudo est déjà pris.');
    const id = newId();
    const now = Date.now();
    this.db.prepare('INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)').run(id, username, hashPassword(password), now);
    this.db.prepare('INSERT INTO profiles (user_id) VALUES (?)').run(id);
    return { token: this.createSession(id), user: { id, username, created_at: now } };
  }

  login(usernameIn: unknown, passwordIn: unknown): { token: string; user: UserRow } {
    if (typeof usernameIn !== 'string' || typeof passwordIn !== 'string') throw new UserError('Identifiants manquants.');
    const key = usernameIn.trim().toLowerCase();
    const att = this.attempts.get(key);
    if (att && att.count >= 5 && att.until > Date.now()) throw new UserError('Trop de tentatives. Réessayez dans une minute.');
    const row = this.db.prepare('SELECT id, username, password_hash, created_at FROM users WHERE username = ?').get(usernameIn.trim()) as
      | (UserRow & { password_hash: string })
      | undefined;
    if (!row || !verifyPassword(passwordIn, row.password_hash)) {
      const a = att && att.until > Date.now() ? att : { count: 0, until: Date.now() + 60_000 };
      a.count++;
      this.attempts.set(key, a);
      throw new UserError('Pseudo ou mot de passe incorrect.');
    }
    this.attempts.delete(key);
    return { token: this.createSession(row.id), user: { id: row.id, username: row.username, created_at: row.created_at } };
  }

  logout(token: string) {
    this.db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  }

  private createSession(userId: string): string {
    const token = randomBytes(32).toString('base64url');
    const now = Date.now();
    this.db
      .prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
      .run(token, userId, now, now + META_CONFIG.sessionDays * 86_400_000);
    return token;
  }

  resolveToken(token: unknown): UserRow | null {
    if (typeof token !== 'string' || token.length < 10) return null;
    const row = this.db
      .prepare('SELECT u.id, u.username, u.created_at, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?')
      .get(token) as (UserRow & { expires_at: number }) | undefined;
    if (!row) return null;
    if (row.expires_at < Date.now()) {
      this.logout(token);
      return null;
    }
    return { id: row.id, username: row.username, created_at: row.created_at };
  }

  getUser(id: string): UserRow | null {
    return (this.db.prepare('SELECT id, username, created_at FROM users WHERE id = ?').get(id) as UserRow | undefined) ?? null;
  }

  findByUsername(username: string): UserRow | null {
    return (this.db.prepare('SELECT id, username, created_at FROM users WHERE username = ?').get(username.trim()) as UserRow | undefined) ?? null;
  }

  search(q: string, excludeId: string, limit = 10): UserRow[] {
    const term = q.trim().replace(/[%_]/g, '');
    if (term.length < 2) return [];
    return this.db
      .prepare('SELECT id, username, created_at FROM users WHERE username LIKE ? AND id != ? ORDER BY username LIMIT ?')
      .all(`%${term}%`, excludeId, limit) as unknown as UserRow[];
  }
}
