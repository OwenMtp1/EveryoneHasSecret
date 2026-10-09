/**
 * Cinématique d'arrivée : choix du véhicule, places, conducteur, chronologie, et synchronisation
 * réelle (serveur HTTP + Socket.IO) pour 2, 4, 5 et 8 joueurs ; composition figée.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { io as ioc, type Socket } from 'socket.io-client';
import { createApp, type AppContext } from '../src/server/app';
import { characterFromCast } from '../src/shared/content/character';
import { CAST } from '../src/shared/content/cast';
import { getVehicleForPlayerCount, VEHICLES } from '../src/shared/content/vehicles';
import { buildIntroPlan, introSchedule, introStateAt, type GameIntroState, type IntroPlan } from '../src/shared/content/intro';
import type { GameSelfView, LobbyView } from '../src/shared/types';

// ───────────── données ─────────────

const fakePlayers = (n: number) => Array.from({ length: n }, (_, i) => ({ userId: `u${i}`, name: `Joueur ${i}`, character: characterFromCast(CAST[(i * 7) % CAST.length]) }));

test('véhicule selon le nombre de joueurs : voiture 2–4, minibus 5–8', () => {
  for (const n of [2, 3, 4]) assert.equal(getVehicleForPlayerCount(n).id, 'car', `${n} joueurs`);
  for (const n of [5, 6, 7, 8]) assert.equal(getVehicleForPlayerCount(n).id, 'minibus', `${n} joueurs`);
  const car = VEHICLES.find((v) => v.id === 'car')!;
  assert.deepEqual(car.seats.map((s) => s.id), ['driver', 'passenger_front', 'passenger_back_left', 'passenger_back_right']);
  const bus = VEHICLES.find((v) => v.id === 'minibus')!;
  assert.deepEqual(bus.seats.map((s) => s.id), ['driver', ...Array.from({ length: 7 }, (_, i) => `passenger_${i + 1}`)]);
  for (const v of VEHICLES) {
    assert.equal(v.seats.filter((s) => s.type === 'driver').length, 1, `${v.id} : un seul conducteur`);
    assert.ok(v.seats.length >= v.maxPlayers, `${v.id} : assez de places`);
  }
  // le minibus recule et monte plus haut pour la révélation
  assert.ok(bus.cinematicConfig.revealDistance > car.cinematicConfig.revealDistance);
  assert.ok(bus.cinematicConfig.revealHeight > car.cinematicConfig.revealHeight);
});

for (const n of [2, 4, 5, 8]) {
  test(`plan de cinématique pour ${n} joueurs : places uniques, un conducteur, déterministe`, () => {
    const players = fakePlayers(n);
    const plan = buildIntroPlan(players, { id: 'p', seed: 1234 + n, startedAt: 0, durationMs: 20000 });
    const vehicle = VEHICLES.find((v) => v.id === plan.vehicleId)!;
    assert.equal(vehicle.id, n <= 4 ? 'car' : 'minibus');
    assert.equal(plan.occupants.length, n, 'tout le monde est dans le véhicule');
    assert.equal(new Set(plan.occupants.map((o) => o.userId)).size, n);
    assert.equal(new Set(plan.occupants.map((o) => o.seatId)).size, n, 'une place par joueur');
    for (const o of plan.occupants) assert.ok(vehicle.seats.some((s) => s.id === o.seatId), `place ${o.seatId} du véhicule`);
    const driver = plan.occupants.find((o) => o.seatId === 'driver')!;
    assert.equal(driver.userId, plan.driverId, 'le conducteur est à la place conducteur');
    assert.equal(driver.animation, 'drive');
    assert.ok(plan.occupants.filter((o) => o.userId !== plan.driverId).every((o) => o.animation !== 'drive'));
    if (n >= 4) assert.ok(new Set(plan.occupants.map((o) => o.animation)).size >= 3, 'animations variées');
    // même graine → même plan (tous les clients voient la même chose)
    assert.deepEqual(buildIntroPlan(players, { id: 'p', seed: 1234 + n, startedAt: 0, durationMs: 20000 }), plan);
  });
}

test('le conducteur varie selon la graine', () => {
  const players = fakePlayers(4);
  const drivers = new Set(Array.from({ length: 40 }, (_, s) => buildIntroPlan(players, { id: 'p', seed: s, startedAt: 0, durationMs: 1 }).driverId));
  assert.ok(drivers.size > 1);
});

test('chronologie : états dans l’ordre, de 0 à la durée totale', () => {
  const sched = introSchedule(20000);
  assert.deepEqual(sched.map((s) => s.state), ['INTRO_START', 'INTRO_CAR', 'INTRO_POINT', 'INTRO_REVEAL', 'INTRO_VILLA', 'GAME_START']);
  assert.equal(sched[0].at, 0);
  assert.equal(sched[sched.length - 1].at, 20000);
  for (let i = 1; i < sched.length; i++) assert.ok(sched[i].at > sched[i - 1].at);
  assert.equal(introStateAt(20000, 0), 'INTRO_START');
  assert.equal(introStateAt(20000, 19999), 'INTRO_VILLA');
  assert.equal(introStateAt(20000, 20000), 'GAME_START');
});

// ───────────── synchronisation réelle ─────────────

let ctx: AppContext;
let base = '';

before(async () => {
  process.env.EHAS_AUTH_RATE_PER_MIN = '10000';
  ctx = createApp({ dbPath: ':memory:' });
  await new Promise<void>((r) => ctx.http.listen(0, r));
  base = `http://127.0.0.1:${(ctx.http.address() as AddressInfo).port}`;
});

after(async () => {
  await ctx.close();
});

interface Client {
  token: string;
  id: string;
  socket: Socket;
  plans: IntroPlan[];
  states: GameIntroState[];
  full?: GameSelfView;
  lobby?: LobbyView | null;
  loadings?: number;
  loadingPlanId?: string;
  holdReady?: boolean;
}

async function http<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return (await res.json()) as T;
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

function waitFor<T>(fn: () => T | undefined | false | null, ms = 4000): Promise<T> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      const v = fn();
      if (v) return resolve(v);
      if (Date.now() - start > ms) return reject(new Error('timeout'));
      setTimeout(tick, 15);
    };
    tick();
  });
}

function connect(c: Omit<Client, 'socket'> & { socket?: Socket }): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = ioc(base, { auth: { token: c.token }, transports: ['websocket'], forceNew: true });
    s.on('lobby:intro', ({ plan, loading }: { plan: IntroPlan; loading: boolean }) => {
      if (loading) {
        // le client « charge » puis se déclare prêt (sauf si le test retarde ce joueur)
        c.loadings = (c.loadings ?? 0) + 1;
        c.loadingPlanId = plan.id;
        if (!c.holdReady) s.emit('lobby:intro-ready', { planId: plan.id });
      } else c.plans.push(plan);
    });
    s.on('lobby:intro-state', ({ state }: { state: GameIntroState }) => c.states.push(state));
    s.on('game:full', (v: GameSelfView) => (c.full = v));
    s.on('lobby:state', (l: LobbyView | null) => (c.lobby = l));
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
}

let counter = 0;
async function makeClient(): Promise<Client> {
  const username = `intro_${++counter}`;
  const reg = await http<{ token: string; user: { id: string } }>('POST', '/api/auth/register', { username, password: 'secret123' });
  const c = { token: reg.token, id: reg.user.id, plans: [], states: [] } as unknown as Client;
  c.socket = await connect(c);
  return c;
}

async function lobbyOf(n: number) {
  const clients = await Promise.all(Array.from({ length: n }, makeClient));
  const [host, ...rest] = clients;
  const lobby = await call<LobbyView>(host.socket, 'lobby:create', { name: 'Villa Beaumont', maxPlayers: 8, visibility: 'PRIVATE' });
  await call(host.socket, 'lobby:pick', CAST[0].id);
  for (const [i, p] of rest.entries()) {
    await call(p.socket, 'lobby:join', { code: lobby.code });
    await call(p.socket, 'lobby:pick', CAST[i + 1].id);
    await call(p.socket, 'lobby:ready', true);
  }
  await waitFor(() => host.lobby?.canStart);
  return { clients, host, lobby };
}

const ORDER: GameIntroState[] = ['INTRO_CAR', 'INTRO_POINT', 'INTRO_REVEAL', 'INTRO_VILLA', 'GAME_START'];

for (const n of [2, 4, 5, 8]) {
  test(`cinématique synchronisée à ${n} joueurs : même plan, mêmes états, puis la partie`, async () => {
    ctx.lobbies.transitionMs = 250;
    const { clients, host } = await lobbyOf(n);
    await call(host.socket, 'lobby:start');
    await waitFor(() => clients.every((c) => c.plans.length === 1));
    const plan = clients[0].plans[0];
    assert.equal(plan.vehicleId, n <= 4 ? 'car' : 'minibus');
    for (const c of clients) assert.deepEqual(c.plans[0], plan, 'plan identique pour tous (véhicule, conducteur, places, graine)');
    assert.deepEqual(new Set(plan.occupants.map((o) => o.userId)), new Set(clients.map((c) => c.id)), 'les vrais joueurs');
    assert.ok(clients.some((c) => c.id === plan.driverId));
    await waitFor(() => clients.every((c) => c.full));
    for (const c of clients) assert.deepEqual(c.states, ORDER, 'états reçus dans l’ordre, cadencés par le serveur');
    assert.equal(clients[0].full!.players.length, n);
    for (const c of clients) c.socket.disconnect();
  });
}

test('composition figée : déconnexion conservée, arrivée tardive refusée, reprise à la reconnexion', async () => {
  ctx.lobbies.transitionMs = 900;
  const { clients, lobby } = await lobbyOf(3);
  const [host, b, c] = clients;
  await call(host.socket, 'lobby:start');
  await waitFor(() => clients.every((x) => x.plans.length === 1));
  const plan = host.plans[0];

  // Un joueur se déconnecte pendant la cinématique : son personnage reste
  c.socket.disconnect();
  // Un retardataire ne peut pas entrer
  const late = await makeClient();
  await assert.rejects(call(late.socket, 'lobby:join', { code: lobby.code }), /commencé/);
  // Le joueur revient : il reprend la même cinématique
  c.plans = [];
  c.socket = await connect(c);
  await waitFor(() => c.plans.length === 1);
  assert.deepEqual(c.plans[0], plan);

  // Un autre quitte le salon pendant la cinématique : elle continue, son personnage reste dans l'histoire
  await call(b.socket, 'lobby:leave');
  await waitFor(() => host.full && c.full, 4000);
  const ids = host.full!.players.map((p) => p.id).sort();
  assert.deepEqual(ids, [host.id, b.id, c.id].sort(), 'les 3 personnages de la cinématique sont dans la partie');
  assert.ok(!ids.includes(late.id));
  assert.equal(host.full!.players.find((p) => p.id === b.id)?.connected, false);
  for (const x of [...clients, late]) x.socket.disconnect();
});

test('chargement avant la cinématique : elle attend le joueur le plus lent', async () => {
  ctx.lobbies.transitionMs = 250;
  ctx.lobbies.loadTimeoutMs = 5000;
  const { clients, host } = await lobbyOf(3);
  const slow = clients[2];
  slow.holdReady = true;
  await call(host.socket, 'lobby:start');
  await waitFor(() => clients.every((c) => c.loadings === 1));
  await new Promise((r) => setTimeout(r, 400));
  assert.ok(clients.every((c) => c.plans.length === 0), 'la cinématique ne démarre pas tant qu’un joueur charge');
  slow.socket.emit('lobby:intro-ready', { planId: 'faux' });
  await new Promise((r) => setTimeout(r, 100));
  assert.ok(clients.every((c) => c.plans.length === 0), 'un identifiant inconnu est ignoré');
  slow.socket.emit('lobby:intro-ready', { planId: slow.loadingPlanId });
  await waitFor(() => clients.every((c) => c.plans.length === 1));
  assert.ok(clients[0].plans[0].startedAt > 0);
  await waitFor(() => clients.every((c) => c.full));
  for (const c of clients) c.socket.disconnect();
});
