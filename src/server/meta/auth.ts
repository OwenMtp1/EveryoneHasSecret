/**
 * Authentification. Deux fournisseurs, même interface pour le reste du serveur :
 *
 *  - Supabase Auth (production) : le navigateur s'inscrit / se connecte / récupère son mot de passe
 *    auprès de Supabase ; le serveur vérifie seulement le jeton d'accès (JWT) à chaque requête et
 *    à chaque connexion temps réel, puis crée le profil de jeu lié à l'identifiant Supabase.
 *  - Local (développement, tests, auto-hébergement) : comptes SQLite, scrypt + sel, jetons opaques.
 *
 * Aucun mot de passe n'est jamais stocké en clair ni journalisé.
 */
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { META_CONFIG } from '@shared/config';
import { DuplicateUsernameError, type MetaStore, type UserRecord } from './store';
import { newId, UserError } from '../util';

export type { UserRecord };

export interface AuthConfig {
  mode: 'local' | 'supabase';
  supabaseUrl?: string;
  /** clé publique « anon » : transmise au navigateur, protégée par la RLS */
  supabaseAnonKey?: string;
  /** secret HS256 (anciens projets Supabase) ; sinon vérification par JWKS (clés asymétriques) */
  supabaseJwtSecret?: string;
}

/** Résultat de la vérification d'un jeton : utilisateur, ou compte Supabase sans profil de jeu. */
export type Resolved = { user: UserRecord } | { pending: { id: string; email?: string; suggested?: string } } | null;

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

export function validateUsername(username: unknown): string {
  if (typeof username !== 'string') throw new UserError('Pseudo manquant.');
  const u = username.trim();
  const { min, max, pattern } = META_CONFIG.username;
  if (u.length < min || u.length > max) throw new UserError(`Le pseudo doit faire entre ${min} et ${max} caractères.`);
  if (!pattern.test(u)) throw new UserError('Le pseudo ne peut contenir que lettres, chiffres, « _ », « . » et « - ».');
  return u;
}

export class AuthService {
  private attempts = new Map<string, { count: number; until: number }>();
  private jwks?: ReturnType<typeof createRemoteJWKSet>;
  /** cache court des jetons déjà vérifiés (évite une vérification par requête) */
  private verified = new Map<string, { user: UserRecord; until: number }>();

  constructor(
    private store: MetaStore,
    readonly config: AuthConfig = { mode: 'local' },
  ) {
    if (config.mode === 'supabase') {
      if (!config.supabaseUrl || !config.supabaseAnonKey) throw new Error('SUPABASE_URL et SUPABASE_ANON_KEY sont requis.');
      if (!config.supabaseJwtSecret) this.jwks = createRemoteJWKSet(new URL(`${config.supabaseUrl}/auth/v1/.well-known/jwks.json`));
    }
  }

  get mode() {
    return this.config.mode;
  }

  /** Configuration publique transmise au navigateur (jamais de secret). */
  publicConfig() {
    return this.config.mode === 'supabase'
      ? { auth: 'supabase' as const, supabaseUrl: this.config.supabaseUrl!, supabaseAnonKey: this.config.supabaseAnonKey! }
      : { auth: 'local' as const };
  }

  // ───────────── local ─────────────

  private requireLocal() {
    if (this.config.mode !== 'local') throw new UserError('Utilisez la connexion par e-mail.');
  }

  private throttle(key: string) {
    const att = this.attempts.get(key);
    if (att && att.count >= 5 && att.until > Date.now()) throw new UserError('Trop de tentatives. Réessayez dans une minute.');
  }

  private fail(key: string) {
    const att = this.attempts.get(key);
    const a = att && att.until > Date.now() ? att : { count: 0, until: Date.now() + 60_000 };
    a.count++;
    this.attempts.set(key, a);
    if (this.attempts.size > 10_000) for (const [k, v] of this.attempts) if (v.until < Date.now()) this.attempts.delete(k);
  }

  private validatePassword(password: unknown): string {
    if (typeof password !== 'string') throw new UserError('Mot de passe manquant.');
    if (password.length < META_CONFIG.password.min) throw new UserError(`Le mot de passe doit faire au moins ${META_CONFIG.password.min} caractères.`);
    if (password.length > META_CONFIG.password.max) throw new UserError('Mot de passe trop long.');
    return password;
  }

  async register(usernameIn: unknown, passwordIn: unknown): Promise<{ token: string; user: UserRecord }> {
    this.requireLocal();
    const username = validateUsername(usernameIn);
    const password = this.validatePassword(passwordIn);
    if (await this.store.findByUsername(username)) throw new UserError('Ce pseudo est déjà pris.');
    const id = newId();
    const now = Date.now();
    try {
      await this.store.createProfile(id, username, now, hashPassword(password));
    } catch (e) {
      if (e instanceof DuplicateUsernameError) throw new UserError('Ce pseudo est déjà pris.');
      throw e;
    }
    return { token: await this.createSession(id), user: { id, username, createdAt: now } };
  }

  async login(usernameIn: unknown, passwordIn: unknown): Promise<{ token: string; user: UserRecord }> {
    this.requireLocal();
    if (typeof usernameIn !== 'string' || typeof passwordIn !== 'string') throw new UserError('Identifiants manquants.');
    const key = usernameIn.trim().toLowerCase();
    this.throttle(key);
    const row = await this.store.getCredentials(usernameIn);
    if (!row || !verifyPassword(passwordIn, row.passwordHash)) {
      this.fail(key);
      throw new UserError('Pseudo ou mot de passe incorrect.');
    }
    this.attempts.delete(key);
    return { token: await this.createSession(row.id), user: { id: row.id, username: row.username, createdAt: row.createdAt } };
  }

  async logout(token: string) {
    this.verified.delete(token);
    if (this.config.mode === 'local' && token) await this.store.deleteSession(token);
  }

  private async createSession(userId: string): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const now = Date.now();
    await this.store.createSession(token, userId, now, now + META_CONFIG.sessionDays * 86_400_000);
    return token;
  }

  // ───────────── vérification (les deux modes) ─────────────

  async resolve(token: unknown): Promise<Resolved> {
    if (typeof token !== 'string' || token.length < 10 || token.length > 4096) return null;
    const hit = this.verified.get(token);
    if (hit && hit.until > Date.now()) return { user: hit.user };
    if (this.config.mode === 'local') {
      const s = await this.store.getSession(token);
      if (!s) return null;
      if (s.expiresAt < Date.now()) {
        await this.store.deleteSession(token);
        return null;
      }
      const user = await this.store.getUser(s.userId);
      if (!user) return null;
      this.remember(token, user, Math.min(s.expiresAt, Date.now() + 60_000));
      return { user };
    }
    const claims = await this.verifyJwt(token);
    if (!claims?.sub) return null;
    const user = await this.store.getUser(claims.sub);
    const exp = (claims.exp ?? 0) * 1000;
    if (user) {
      this.remember(token, user, Math.min(exp, Date.now() + 60_000));
      return { user };
    }
    // Premier passage : création du profil de jeu avec le pseudo choisi à l'inscription
    const meta = (claims as JWTPayload & { user_metadata?: { username?: unknown }; email?: string }).user_metadata;
    const suggested = typeof meta?.username === 'string' ? meta.username : undefined;
    if (suggested) {
      try {
        const created = await this.claimUsername(claims.sub, suggested);
        this.remember(token, created, Math.min(exp, Date.now() + 60_000));
        return { user: created };
      } catch {
        /* pseudo invalide ou déjà pris : l'utilisateur en choisira un autre */
      }
    }
    return { pending: { id: claims.sub, email: (claims as { email?: string }).email, suggested } };
  }

  /** Utilisateur authentifié ET doté d'un profil de jeu (sinon null). */
  async resolveUser(token: unknown): Promise<UserRecord | null> {
    const r = await this.resolve(token);
    return r && 'user' in r ? r.user : null;
  }

  /** Associe un pseudo au compte Supabase (première connexion, ou pseudo déjà pris à l'inscription). */
  async claimUsername(id: string, usernameIn: unknown): Promise<UserRecord> {
    const username = validateUsername(usernameIn);
    const existing = await this.store.getUser(id);
    if (existing) return existing;
    const now = Date.now();
    try {
      await this.store.createProfile(id, username, now);
    } catch (e) {
      if (e instanceof DuplicateUsernameError) throw new UserError('Ce pseudo est déjà pris.');
      throw e;
    }
    return (await this.store.getUser(id)) ?? { id, username, createdAt: now };
  }

  async usernameAvailable(usernameIn: unknown): Promise<boolean> {
    const username = validateUsername(usernameIn);
    return !(await this.store.findByUsername(username));
  }

  private remember(token: string, user: UserRecord, until: number) {
    this.verified.set(token, { user, until });
    if (this.verified.size > 5000) for (const [k, v] of this.verified) if (v.until < Date.now()) this.verified.delete(k);
  }

  private async verifyJwt(token: string): Promise<JWTPayload | null> {
    const { supabaseUrl, supabaseJwtSecret } = this.config;
    const opts = { issuer: `${supabaseUrl}/auth/v1`, audience: 'authenticated' };
    try {
      const { payload } = supabaseJwtSecret
        ? await jwtVerify(token, new TextEncoder().encode(supabaseJwtSecret), { ...opts, algorithms: ['HS256'] })
        : await jwtVerify(token, this.jwks!, opts);
      if (payload.role && payload.role !== 'authenticated') return null;
      return payload;
    } catch {
      return null;
    }
  }

  // ───────────── lectures ─────────────

  getUser(id: string) {
    return this.store.getUser(id);
  }

  findByUsername(username: string) {
    return this.store.findByUsername(username);
  }

  search(q: string, excludeId: string, limit = 10): Promise<UserRecord[]> {
    const term = q.trim();
    if (term.length < 2 || term.length > 40) return Promise.resolve([]);
    return this.store.searchUsers(term, excludeId, limit);
  }
}

/** Configuration d'authentification d'après l'environnement. */
export function authConfigFromEnv(env = process.env): AuthConfig {
  const url = env.SUPABASE_URL?.replace(/\/+$/, '');
  if (url && env.SUPABASE_ANON_KEY) return { mode: 'supabase', supabaseUrl: url, supabaseAnonKey: env.SUPABASE_ANON_KEY, supabaseJwtSecret: env.SUPABASE_JWT_SECRET || undefined };
  return { mode: 'local' };
}
