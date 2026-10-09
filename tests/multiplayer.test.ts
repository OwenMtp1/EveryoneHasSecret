/**
 * Test d'intégration multijoueur : vrai serveur HTTP + Socket.IO, 4 clients.
 * Compte → personnage → lobby (code privé) → prêts → lancement → villa → synchronisation
 * → déconnexion/reconnexion → amis/invitations.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { io as ioc, type Socket } from 'socket.io-client';
import { createApp, type AppContext } from '../src/server/app';
import type { GameSelfView, LobbyView } from '../src/shared/types';

process.env.EHAS_TRANSITION_MS = '50';
process.env.EHAS_AUTH_RATE_PER_MIN = '10000';

let ctx: AppContext;
let base = '';

before(async () => {
  ctx = createApp({ dbPath: ':memory:' });
  ctx.lobbies.transitionMs = 50;
  ctx.lobbies.loadTimeoutMs = 50;
  await new Promise<void>((r) => ctx.http.listen(0, r));
  base = `http://127.0.0.1:${(ctx.http.address() as AddressInfo).port}`;
});

after(async () => {
  await ctx.close();
});

async function http<T>(method: string, path: string, body?: unknown, token?: string): Promise<{ status: number; data: T }> {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: (await res.json()) as T };
}

interface Client {
  token: string;
  id: string;
  name: string;
  socket: Socket;
  lastFull?: GameSelfView;
  lobby?: LobbyView | null;
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

function waitFor<T>(fn: () => T | undefined | false | null, ms = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      const v = fn();
      if (v) return resolve(v);
      if (Date.now() - start > ms) return reject(new Error('timeout'));
      setTimeout(tick, 20);
    };
    tick();
  });
}

function connect(token: string, setup?: (s: Socket) => void): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = ioc(base, { auth: { token }, transports: ['websocket'], forceNew: true });
    setup?.(s);
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
}

async function makeClient(username: string): Promise<Client> {
  const reg = await http<{ token: string; user: { id: string } }>('POST', '/api/auth/register', { username, password: 'secret123' });
  assert.equal(reg.status, 200);
  const socket = await connect(reg.data.token);
  const client: Client = { token: reg.data.token, id: reg.data.user.id, name: username, socket };
  socket.on('game:full', (v: GameSelfView) => (client.lastFull = v));
  socket.on('game:snapshot', (s: Partial<GameSelfView>) => client.lastFull && (client.lastFull = { ...client.lastFull, ...s }));
  socket.on('lobby:state', (l: LobbyView | null) => (client.lobby = l));
  return client;
}

test('authentification : validations, doublons, mauvais mot de passe, session', async () => {
  const bad = await http<{ error: string }>('POST', '/api/auth/register', { username: 'a', password: 'secret123' });
  assert.equal(bad.status, 400);
  const ok = await http<{ token: string }>('POST', '/api/auth/register', { username: 'solo_user', password: 'secret123' });
  assert.equal(ok.status, 200);
  const dup = await http<{ error: string }>('POST', '/api/auth/register', { username: 'SOLO_USER', password: 'secret123' });
  assert.match(dup.data.error, /déjà pris/);
  const wrong = await http<{ error: string }>('POST', '/api/auth/login', { username: 'solo_user', password: 'nope-nope' });
  assert.equal(wrong.status, 400);
  const me = await http<{ user: { username: string } }>('GET', '/api/me', undefined, ok.data.token);
  assert.equal(me.data.user.username, 'solo_user');
  // Restauration de session : le même jeton reste valide (rechargement, réouverture du navigateur)
  const again = await http<{ user: { username: string } }>('GET', '/api/me', undefined, ok.data.token);
  assert.equal(again.status, 200);
  const relog = await http<{ token: string }>('POST', '/api/auth/login', { username: 'Solo_User', password: 'secret123' });
  assert.equal(relog.status, 200, 'connexion insensible à la casse du pseudo, sans recréer de compte');
  const forged = await http('GET', '/api/me', undefined, 'jeton-invente-0123456789');
  assert.equal(forged.status, 401);
  const avail = await http<{ available: boolean }>('GET', '/api/auth/username-available?u=SOLO_user');
  assert.equal(avail.data.available, false);
  await http('POST', '/api/auth/logout', undefined, ok.data.token);
  const after = await http('GET', '/api/me', undefined, ok.data.token);
  assert.equal(after.status, 401);
});

test('parcours multijoueur complet : lobby privé → 4 joueurs → villa synchronisée → reconnexion', async () => {
  const [host, b, c, d] = await Promise.all(['owen', 'thomas', 'camille', 'ines'].map(makeClient));

  // Création d'une partie privée
  const lobby = await call<LobbyView>(host.socket, 'lobby:create', { name: 'Villa Beaumont', maxPlayers: 6, visibility: 'PRIVATE' });
  assert.equal(lobby.code.length, 6);
  const publicList = await call<unknown[]>(b.socket, 'servers:list', {});
  assert.equal(publicList.length, 0, 'une partie privée n’apparaît pas dans les serveurs');
  await assert.rejects(call(b.socket, 'lobby:join', { lobbyId: lobby.id }), /code/);

  for (const p of [b, c, d]) await call(p.socket, 'lobby:join', { code: lobby.code.toLowerCase() });
  await waitFor(() => host.lobby?.players.length === 4);

  // Sélection des personnages : réservation atomique côté serveur
  await assert.rejects(call(b.socket, 'lobby:ready', true), /personnage/);
  await call(host.socket, 'lobby:pick', 'f01');
  await assert.rejects(call(b.socket, 'lobby:pick', 'f01'), /choisi/);
  await assert.rejects(call(b.socket, 'lobby:pick', 'zz99'), /inconnu/);
  const race = await Promise.allSettled([call(c.socket, 'lobby:pick', 'm05'), call(d.socket, 'lobby:pick', 'm05')]);
  assert.equal(race.filter((r) => r.status === 'fulfilled').length, 1, 'sélection simultanée : un seul gagnant');
  const loser = race[0].status === 'fulfilled' ? d : c;
  await call(loser.socket, 'lobby:pick', 'f07');
  await call(b.socket, 'lobby:pick', 'm02');
  // changement de personnage : l'ancien est libéré
  await call(b.socket, 'lobby:pick', 'm03');
  const winner = loser === c ? d : c;
  await call(winner.socket, 'lobby:pick', 'm02'); // m02 libéré par b, m05 libéré à son tour
  await waitFor(() => host.lobby?.players.every((p) => p.castId));
  const picked = host.lobby!.players.map((p) => p.castId);
  assert.equal(new Set(picked).size, 4, 'aucun personnage attribué deux fois');

  // Permissions : seul l'hôte lance, et seulement quand tout le monde est prêt
  await assert.rejects(call(b.socket, 'lobby:start'), /hôte/);
  await assert.rejects(call(host.socket, 'lobby:start'), /prêts/);
  for (const p of [b, c, d]) await call(p.socket, 'lobby:ready', true);
  await waitFor(() => host.lobby?.canStart);

  // Expulsion vérifiée côté serveur
  await assert.rejects(call(b.socket, 'lobby:kick', c.id), /hôte/);

  const intro = new Promise((r) => b.socket.once('lobby:intro', r));
  await call(host.socket, 'lobby:start');
  await intro;
  await waitFor(() => host.lastFull && b.lastFull && c.lastFull && d.lastFull);

  const hv = host.lastFull!;
  assert.equal(hv.players.length, 4);
  assert.ok(hv.secret.length > 10, 'chacun reçoit son secret');
  assert.notEqual(hv.secret, b.lastFull!.secret, 'secrets différents');
  assert.ok(!JSON.stringify(b.lastFull).includes(hv.secret), 'le secret de l’hôte ne fuit pas');
  assert.equal(new Set([host, b, c, d].map((p) => JSON.stringify(p.lastFull!.players.find((x) => x.id === p.id)!.character))).size, 4, 'personnages distincts');
  // Tous dans le hall au départ : chacun voit les autres
  for (const p of [host, b, c, d]) assert.equal(p.lastFull!.players.filter((x) => x.pos).length, 4);

  // Mouvement serveur-autoritaire
  const start = host.lastFull!.players.find((x) => x.id === host.id)!.pos!;
  host.socket.emit('game:input', { dx: 1, dy: 0 });
  await new Promise((r) => setTimeout(r, 400));
  host.socket.emit('game:input', { dx: 0, dy: 0 });
  const moved = await waitFor(() => {
    const pos = b.lastFull!.players.find((x) => x.id === host.id)?.pos;
    return pos && pos.x > start.x + 0.5 ? pos : null;
  });
  assert.ok(moved.x > start.x, 'les autres voient le déplacement');

  // Chat général + message privé
  await call(b.socket, 'game:chat', { channel: 'general', text: 'Quelqu’un a vu Victor ?' });
  await call(c.socket, 'game:chat', { channel: `dm:${d.id}`, text: 'Méfie-toi de Thomas.' });
  await waitFor(() => host.lastFull!.chat.some((m) => m.text.includes('Victor')));
  await waitFor(() => d.lastFull!.chat.some((m) => m.text.includes('Méfie-toi')));
  assert.ok(!host.lastFull!.chat.some((m) => m.text.includes('Méfie-toi')), 'message privé non diffusé');

  // Action invalide rejetée par le serveur
  await assert.rejects(call(b.socket, 'game:action', { type: 'take', objectId: 'nope' }), /introuvable/);
  await assert.rejects(call(b.socket, 'game:action', { type: 'act', targetId: c.id, objectId: 'x' }), /occasion/);

  // Déconnexion / reconnexion : on retrouve sa partie
  d.socket.disconnect();
  await waitFor(() => host.lastFull!.players.find((x) => x.id === d.id)?.connected === false);
  let session: { inGame: boolean } | undefined;
  let full: GameSelfView | undefined;
  const s2 = await connect(d.token, (s) => {
    s.once('session:state', (v: { inGame: boolean }) => (session = v));
    s.once('game:full', (v: GameSelfView) => (full = v));
  });
  await waitFor(() => session && full);
  assert.equal(session!.inGame, true);
  assert.equal(full!.you, d.id);
  await waitFor(() => host.lastFull!.players.find((x) => x.id === d.id)?.connected === true);

  for (const p of [host, b, c]) p.socket.disconnect();
  s2.disconnect();
});

test('amis : demande, acceptation, invitation à une partie, présence', async () => {
  const [a, b] = await Promise.all(['alice_f', 'bruno_f'].map(makeClient));
  const notified = new Promise<{ type: string }>((r) => b.socket.once('notification', r));
  await call(a.socket, 'friends:request', 'bruno_f');
  assert.equal((await notified).type, 'FRIEND_REQUEST');
  await call(b.socket, 'friends:respond', { userId: a.id, accept: true });
  const list = await call<{ userId: string; status: string; relation: string }[]>(a.socket, 'friends:list');
  assert.equal(list[0].relation, 'accepted');
  assert.equal(list[0].status, 'ONLINE');

  await call(a.socket, 'lobby:create', { name: 'Chez Alice', maxPlayers: 4, visibility: 'PUBLIC' });
  const invite = new Promise<{ id: string; type: string }>((resolve) => {
    b.socket.on('notification', (n: { id: string; type: string }) => n.type === 'GAME_INVITE' && resolve(n));
  });
  await call(a.socket, 'lobby:invite', b.id);
  const n = await invite;
  const l = await call<LobbyView>(b.socket, 'invite:respond', { notificationId: n.id, accept: true });
  assert.equal(l.players.length, 2);
  const status = await call<{ status: string }[]>(a.socket, 'friends:list');
  assert.equal(status[0].status, 'IN_LOBBY');
  const servers = await call<{ friendsInside: number }[]>(b.socket, 'servers:list', { withFriends: true });
  assert.equal(servers.length, 1);
  // Un personnage réservé est libéré quand son joueur quitte le salon
  await call(b.socket, 'lobby:pick', 'f02');
  await assert.rejects(call(a.socket, 'lobby:pick', 'f02'), /choisi/);
  await call(b.socket, 'lobby:leave');
  const mine = await call<LobbyView>(a.socket, 'lobby:pick', 'f02');
  assert.equal(mine.players.find((p) => p.userId === a.id)?.castId, 'f02');
  a.socket.disconnect();
  b.socket.disconnect();
});
