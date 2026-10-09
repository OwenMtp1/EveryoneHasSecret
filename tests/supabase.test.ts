/**
 * Mode production (Supabase) : un vrai Postgres (PGlite, en mémoire) avec un schéma `auth` minimal
 * reproduisant celui de Supabase (auth.users, auth.uid(), rôles anon/authenticated), la migration
 * réelle du dépôt, et des jetons d'accès JWT signés comme ceux de Supabase Auth.
 *
 * Vérifie : persistance des profils, restauration de session, pseudos en double, jetons expirés,
 * falsifiés ou anonymes refusés, historique limité à ses propres parties, et politiques RLS
 * (un utilisateur ne lit que ses données ; un anonyme ne lit rien).
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { PGlite } from '@electric-sql/pglite';
import { SignJWT } from 'jose';
import { io as ioc, type Socket } from 'socket.io-client';
import { createApp, type AppContext } from '../src/server/app';
import { PostgresStore } from '../src/server/meta/store';

const URL_ = 'https://projet-test.supabase.co';
const SECRET = 'secret-de-test-hs256-au-moins-32-caracteres!!';
let db: PGlite;
let ctx: AppContext;
let base = '';

const FAKE_SUPABASE = `
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key, email text unique);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;
-- privilèges par défaut larges, comme sur Supabase : la migration doit les restreindre elle-même
alter default privileges in schema public grant all on tables to anon, authenticated;
`;

before(async () => {
  process.env.EHAS_AUTH_RATE_PER_MIN = '10000';
  db = new PGlite();
  await db.exec(FAKE_SUPABASE);
  for (const f of readdirSync('supabase/migrations').sort()) await db.exec(readFileSync(`supabase/migrations/${f}`, 'utf8'));
  ctx = createApp({ store: new PostgresStore(db), auth: { mode: 'supabase', supabaseUrl: URL_, supabaseAnonKey: 'cle-anon-publique', supabaseJwtSecret: SECRET } });
  ctx.lobbies.transitionMs = 50;
  ctx.lobbies.loadTimeoutMs = 50;
  await new Promise<void>((r) => ctx.http.listen(0, r));
  base = `http://127.0.0.1:${(ctx.http.address() as AddressInfo).port}`;
});

after(async () => {
  await ctx.close();
});

async function newAuthUser(email: string) {
  const id = randomUUID();
  await db.query('insert into auth.users (id, email) values ($1, $2)', [id, email]);
  return id;
}

/** Jeton d'accès au format Supabase Auth. */
function token(sub: string, opts: { username?: string; exp?: number; role?: string; secret?: string; iss?: string } = {}) {
  return new SignJWT({ role: opts.role ?? 'authenticated', email: `${sub.slice(0, 4)}@test.fr`, user_metadata: opts.username ? { username: opts.username } : {} })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuer(opts.iss ?? `${URL_}/auth/v1`)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? Math.floor(Date.now() / 1000) + 3600)
    .sign(new TextEncoder().encode(opts.secret ?? SECRET));
}

async function http<T>(method: string, path: string, body?: unknown, tok?: string): Promise<{ status: number; data: T }> {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: (await res.json()) as T };
}

function connect(tok: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = ioc(base, { auth: { token: tok }, transports: ['websocket'], forceNew: true });
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
}

function call<T>(s: Socket, event: string, ...args: unknown[]): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`pas de réponse : ${event}`)), 3000);
    s.emit(event, ...args, (r: { ok: boolean; data: T; error: string }) => {
      clearTimeout(t);
      if (r.ok) resolve(r.data);
      else reject(new Error(r.error));
    });
  });
}

/** Exécute une requête comme le ferait PostgREST avec la clé anon et le jeton d'un utilisateur. */
async function asUser<T>(sub: string | null, sql: string): Promise<T[]> {
  await db.exec(`set role ${sub ? 'authenticated' : 'anon'}`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [sub ?? '']);
  try {
    return (await db.query(sql)).rows as T[];
  } finally {
    await db.exec('reset role');
  }
}

test('configuration publique : seulement l’URL et la clé anon, jamais de secret', async () => {
  const cfg = await http<Record<string, string>>('GET', '/api/config');
  assert.deepEqual(Object.keys(cfg.data).sort(), ['auth', 'supabaseAnonKey', 'supabaseUrl']);
  assert.ok(!JSON.stringify(cfg.data).includes(SECRET));
});

test('première connexion : le profil est créé avec le pseudo de l’inscription, puis retrouvé', async () => {
  const id = await newAuthUser('owen@test.fr');
  const t = await token(id, { username: 'Owen_MB' });
  const me = await http<{ user: { id: string; username: string } }>('GET', '/api/me', undefined, t);
  assert.equal(me.status, 200);
  assert.deepEqual(me.data.user, { id, username: 'Owen_MB' });
  // « rechargement » / « autre navigateur » : nouveau jeton, même compte, aucun doublon
  const again = await http<{ user: { username: string } }>('GET', '/api/me', undefined, await token(id));
  assert.equal(again.data.user.username, 'Owen_MB');
  const count = await db.query<{ n: number }>('select count(*)::int as n from public.profiles where id = $1', [id]);
  assert.equal(count.rows[0].n, 1);
  const avail = await http<{ available: boolean }>('GET', '/api/auth/username-available?u=owen_mb');
  assert.equal(avail.data.available, false, 'pseudo insensible à la casse');
});

test('pseudo déjà pris à l’inscription : le compte choisit un autre pseudo', async () => {
  const id = await newAuthUser('autre@test.fr');
  const t = await token(id, { username: 'OWEN_mb' });
  const me = await http<{ needsUsername: boolean; suggested: string }>('GET', '/api/me', undefined, t);
  assert.equal(me.data.needsUsername, true);
  const taken = await http<{ error: string }>('POST', '/api/profile/username', { username: 'owen_MB' }, t);
  assert.match(taken.data.error, /déjà pris/);
  const bad = await http<{ error: string }>('POST', '/api/profile/username', { username: 'x' }, t);
  assert.equal(bad.status, 400);
  const ok = await http<{ user: { username: string } }>('POST', '/api/profile/username', { username: 'Ines_2' }, t);
  assert.equal(ok.data.user.username, 'Ines_2');
  const twice = await http<{ error: string }>('POST', '/api/profile/username', { username: 'Encore' }, t);
  assert.match(twice.data.error, /déjà défini/);
  // tant qu'il n'a pas de profil, un compte ne peut pas ouvrir de connexion temps réel
  const id2 = await newAuthUser('sanspseudo@test.fr');
  await assert.rejects(connect(await token(id2)), /unauthorized/);
});

test('jetons expirés, falsifiés, anonymes ou d’un autre projet : refusés', async () => {
  const id = await newAuthUser('jetons@test.fr');
  await http('GET', '/api/me', undefined, await token(id, { username: 'jetons' }));
  const cases = [
    await token(id, { exp: Math.floor(Date.now() / 1000) - 10 }),
    await token(id, { secret: 'un-autre-secret-de-signature-tout-aussi-long!!' }),
    await token(id, { role: 'anon' }),
    await token(id, { iss: 'https://pirate.supabase.co/auth/v1' }),
    'abc.def.ghi',
  ];
  for (const t of cases) {
    const r = await http('GET', '/api/me', undefined, t);
    assert.equal(r.status, 401);
    await assert.rejects(connect(t), /unauthorized/);
  }
});

test('amis, notifications et historique persistés dans Postgres ; historique limité à ses parties', async () => {
  const [a, b, c] = await Promise.all(['a@t.fr', 'b@t.fr', 'c@t.fr'].map(newAuthUser));
  const [ta, tb, tc] = await Promise.all([token(a, { username: 'alice_pg' }), token(b, { username: 'bruno_pg' }), token(c, { username: 'chloe_pg' })]);
  for (const t of [ta, tb, tc]) await http('GET', '/api/me', undefined, t);
  const [sa, sb] = await Promise.all([connect(ta), connect(tb)]);
  await call(sa, 'friends:request', 'BRUNO_pg');
  await call(sb, 'friends:respond', { userId: a, accept: true });
  const list = await call<{ username: string; relation: string }[]>(sa, 'friends:list');
  assert.deepEqual(list.map((f) => [f.username, f.relation]), [['bruno_pg', 'accepted']]);
  const notes = await call<{ type: string }[]>(sa, 'notifications:list');
  assert.ok(notes.some((n) => n.type === 'FRIEND_ACCEPTED'), 'notification persistée');

  await ctx.store.insertGame({ id: 'partie-ab', lobbyName: 'Chez Alice', caseType: 'murder', summary: 'Résumé', players: ['A', 'B'], endedAt: Date.now() }, [a, b]);
  await ctx.store.recordGame(a, true);
  const ha = await http<{ lobby_name: string }[]>('GET', '/api/history', undefined, ta);
  assert.equal(ha.data.length, 1);
  const hc = await http<unknown[]>('GET', '/api/history', undefined, tc);
  assert.equal(hc.data.length, 0, 'une partie à laquelle on n’a pas participé reste invisible');
  const prof = await http<{ gamesPlayed: number; gamesWon: number }>('GET', `/api/profile/${a}`, undefined, tc);
  assert.deepEqual([prof.data.gamesPlayed, prof.data.gamesWon], [1, 1]);
  sa.disconnect();
  sb.disconnect();
});

test('RLS : avec la clé publique, chacun ne lit que ses propres données ; un anonyme rien', async () => {
  const [a, b] = await Promise.all(['rls-a@t.fr', 'rls-b@t.fr'].map(newAuthUser));
  for (const [id, u] of [[a, 'rls_a'], [b, 'rls_b']] as const) await http('GET', '/api/me', undefined, await token(id, { username: u }));
  await ctx.store.insertNotification(b, { id: 'n-b', type: 'SYSTEM', title: 'Privé', body: 'pour B', read: false, createdAt: Date.now() });
  await ctx.store.insertGame({ id: 'partie-b', lobbyName: 'Secrète', caseType: 'murder', summary: 'x', players: ['B'], endedAt: Date.now() }, [b]);

  const profilesA = await asUser<{ id: string }>(a, 'select id from public.profiles');
  assert.deepEqual(profilesA.map((r) => r.id), [a], 'un utilisateur ne lit que son profil');
  assert.equal((await asUser(a, "select * from public.notifications where id = 'n-b'")).length, 0);
  assert.equal((await asUser(b, "select * from public.notifications where id = 'n-b'")).length, 1);
  assert.equal((await asUser(a, "select * from public.game_history where id = 'partie-b'")).length, 0);
  assert.equal((await asUser(b, "select * from public.game_history where id = 'partie-b'")).length, 1);
  // écritures interdites depuis le navigateur (statistiques, pseudo d'un autre…)
  await assert.rejects(asUser(a, `update public.profiles set games_won = 999 where id = '${a}'`), /permission denied/);
  await assert.rejects(asUser(a, `insert into public.notifications (id, user_id, type, title, body, created_at) values ('x', '${b}', 'SYSTEM', 'x', 'x', 0)`), /permission denied/);
  // marquer « lu » ses propres notifications seulement
  await asUser(b, "update public.notifications set read = true where id = 'n-b'");
  await asUser(a, "update public.notifications set read = false where id = 'n-b'");
  const stillRead = await db.query<{ read: boolean }>("select read from public.notifications where id = 'n-b'");
  assert.equal(stillRead.rows[0].read, true);
  // anonyme : aucun accès
  await assert.rejects(asUser(null, 'select * from public.profiles'), /permission denied/);
});
