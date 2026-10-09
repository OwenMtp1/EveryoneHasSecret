/**
 * Partie complète automatisée, de l'inscription à l'épilogue, contre le VRAI serveur.
 *
 *  - L'hôte joue dans Chromium (interface réelle, captures d'écran à chaque étape clé).
 *  - Deux autres joueurs sont des clients temps réel (mêmes événements que le navigateur).
 *  - Les déplacements suivent les règles du serveur (scripts/lib/walk.ts), escaliers compris.
 *
 *   EHAS_DB=/tmp/e2e.sqlite EHAS_TRANSITION_MS=2500 EHAS_LOAD_TIMEOUT_MS=90000 PORT=3001 npm start
 *   node --import tsx scripts/e2e-playthrough.ts
 *
 * Variables : E2E_BASE (défaut http://localhost:3001), CHROMIUM_PATH, E2E_SHOTS (défaut screenshots/).
 */
import { mkdirSync } from 'node:fs';
import { chromium, type Page } from 'playwright-core';
import { io, type Socket } from 'socket.io-client';
import type { GameSelfView, LobbyView } from '../src/shared/types';
import { CAST } from '../src/shared/content/cast';
import { findPath } from './lib/walk';
import { levelOf } from '../src/shared/content/villa';

const BASE = process.env.E2E_BASE ?? 'http://localhost:3001';
const SHOTS = process.env.E2E_SHOTS ?? 'screenshots';
mkdirSync(SHOTS, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (...a: unknown[]) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);
const errors: string[] = [];

interface Client {
  name: string;
  token: string;
  id: string;
  s: Socket;
  view?: GameSelfView;
  lobby?: LobbyView | null;
}

async function http<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const res = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json();
  if (!res.ok) throw new Error(`${path}: ${data.error}`);
  return data as T;
}

function call<T>(c: Client, event: string, ...args: unknown[]): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`pas de réponse : ${event}`)), 10000);
    c.s.emit(event, ...args, (r: { ok: boolean; data: T; error: string }) => {
      clearTimeout(t);
      r.ok ? resolve(r.data) : reject(new Error(r.error));
    });
  });
}

async function client(name: string): Promise<Client> {
  const reg = await http<{ token: string; user: { id: string } }>('POST', '/api/auth/register', { username: name, password: 'secret123' });
  const s = io(BASE, { auth: { token: reg.token }, transports: ['websocket'], forceNew: true });
  const c: Client = { name, token: reg.token, id: reg.user.id, s };
  s.on('game:full', (v: GameSelfView) => (c.view = v));
  s.on('game:snapshot', (v: Partial<GameSelfView>) => c.view && (c.view = { ...c.view, ...v }));
  s.on('lobby:state', (l: LobbyView | null) => (c.lobby = l));
  s.on('lobby:intro', (p: { plan: { id: string }; loading: boolean }) => {
    if (p.loading && name !== 'host') s.emit('lobby:intro-ready', { planId: p.plan.id });
  });
  await new Promise<void>((r, j) => (s.on('connect', () => r()), s.on('connect_error', j)));
  return c;
}

async function waitFor<T>(what: string, fn: () => T | undefined | null | false, ms = 60000): Promise<T> {
  const t0 = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error(`délai dépassé : ${what}`);
    await sleep(100);
  }
}

const me = (c: Client) => c.view!.players.find((p) => p.id === c.id)!;
const act = (c: Client, a: Record<string, unknown>) => call<{ message?: string }>(c, 'game:action', a).then((r) => r.message ?? '');

/** Marche jusqu'à un point (chemin calculé avec les règles du serveur), en courant. */
async function walkTo(c: Client, target: { x: number; y: number }, label: string) {
  const start = me(c).pos!;
  const path = findPath(start, target, new Set(c.view!.unlockedDoors));
  if (!path) throw new Error(`aucun chemin vers ${label}`);
  let last = { x: 0, y: 0 };
  for (const wp of path.slice(1)) {
    for (let i = 0; i < 120; i++) {
      const pos = me(c).pos!;
      // passage d'escalier ou d'échelle : on continue tout droit jusqu'au changement de niveau
      if (levelOf(pos.x) !== levelOf(wp.x)) {
        c.s.emit('game:input', { dx: last.x, dy: last.y, run: false });
        await sleep(50);
        continue;
      }
      const dx = wp.x - pos.x;
      const dy = wp.y - pos.y;
      if (Math.hypot(dx, dy) < 0.25) break;
      const d = Math.hypot(dx, dy);
      last = { x: dx / d, y: dy / d };
      c.s.emit('game:input', { dx: last.x, dy: last.y, run: true });
      await sleep(50);
    }
  }
  c.s.emit('game:input', { dx: 0, dy: 0 });
  await sleep(300);
  const pos = me(c).pos!;
  log(`${c.name} arrivé·e : ${label} (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}) — ${me(c).roomId}`);
}

async function shot(page: Page, name: string) {
  try {
    await page.screenshot({ path: `${SHOTS}/${name}.png`, timeout: 60000 });
    log('capture', name);
  } catch (e) {
    log('capture impossible', name, (e as Error).message);
  }
}

const stamp = Date.now().toString(36).slice(-4);
const host = await client(`hote_${stamp}`);
const b = await client(`bea_${stamp}`);
const c = await client(`cyril_${stamp}`);
log('3 comptes créés');

// ── navigateur de l'hôte : session restaurée depuis le stockage local ──
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript((t) => localStorage.setItem('ehas.token', t), host.token);
const page = await ctx.newPage();
page.setDefaultTimeout(120000);
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('favicon') && errors.push(`console: ${m.text()}`));
await page.goto(`${BASE}/?debug`);
await page.waitForFunction(() => document.body.innerText.includes('SERVEURS'));
log('hôte au menu (session restaurée)');

// ── salon privé, sélection des personnages ──
const lobby = await call<LobbyView>(host, 'lobby:create', { name: 'E2E Villa', maxPlayers: 6, visibility: 'PRIVATE', duration: 'short' });
for (const p of [b, c]) await call(p, 'lobby:join', { code: lobby.code });
await page.waitForFunction(() => document.querySelector('.cast-grid'));
await page.evaluate(() => (document.querySelector('.cast-card.cast-free') as HTMLButtonElement).click());
await waitFor('choix de l’hôte', () => host.lobby?.players.find((p) => p.userId === host.id)?.castId);
const hostCast = host.lobby!.players.find((p) => p.userId === host.id)!.castId!;
const free = CAST.map((x) => x.id).filter((id) => id !== hostCast);
await call(b, 'lobby:pick', free[3]);
try {
  await call(c, 'lobby:pick', free[3]);
  errors.push('BUG : deux joueurs ont obtenu le même personnage');
} catch (e) {
  log('réservation refusée comme prévu :', (e as Error).message);
}
await call(c, 'lobby:pick', free[24]);
for (const p of [b, c]) await call(p, 'lobby:ready', true);
await sleep(1500);
await shot(page, '01-salon-galerie');

// ── lancement : chargement, cinématique, découverte du corps ──
await call(host, 'lobby:start');
await waitFor('vue de partie', () => host.view && b.view && c.view, 180000);
log('partie lancée — scénario', host.view!.caseInfo?.scenarioTitle);
await page.waitForFunction(() => document.querySelector('.hud-top'), undefined, { timeout: 240000 });
await page.waitForFunction(() => document.querySelector('.reveal-caption'), undefined, { timeout: 90000 }).then(() => log('plan de découverte du corps affiché'), () => errors.push('BUG : plan de découverte du corps absent'));
await shot(page, '02-decouverte-du-corps');
await sleep(7000);
await shot(page, '03-en-jeu');

const all = [host, b, c];
const murderer = all.find((p) => p.view!.dossier!.camp === 'murderer')!;
const sleuth = all.find((p) => p !== murderer)!;
const third = all.find((p) => p !== murderer && p !== sleuth)!;
log(`meurtrier : ${murderer.name} · enquêteur·rice : ${sleuth.name}`);

// ── alibis publics ──
for (const p of all) {
  const place = p === murderer ? 'phare' : 'boussole';
  await act(p, { type: 'alibi', place, text: 'J’étais avec les autres.' });
}

// ── enquête : fouiller le corps (touche E dans le navigateur si l'hôte enquête) ──
await waitFor('fin de la découverte', () => sleuth.view!.phase === 'INVESTIGATION', 120000);
const body = sleuth.view!.bodies.find((x) => x.npc)!;
await walkTo(sleuth, body.pos, 'corps de la victime');
if (sleuth === host) {
  // regarder le corps (souris) : la cible est ce que vise la caméra
  const mp = me(host).pos!;
  const { localX } = await import('../src/shared/content/villa');
  const yaw = Math.atan2(localX(body.pos.x) - localX(mp.x), body.pos.y - mp.y);
  await page.evaluate((y) => {
    const v = (window as unknown as { __ehas: { view3d: { yaw: number; tpPitch: number } } }).__ehas.view3d;
    v.yaw = y;
    v.tpPitch = 1.1;
  }, yaw);
  await page.waitForFunction(() => document.querySelector('.interact-title')?.textContent?.startsWith('Corps'), undefined, { timeout: 60000 }).catch(() => log('invite : pas sur le corps'));
  await shot(page, '04-invite-interaction');
  await page.keyboard.press('KeyE');
  await sleep(1500);
} else await act(sleuth, { type: 'search_body', bodyId: body.id });
const onBody = await waitFor('objets du corps', () => sleuth.view!.objects.filter((o) => o.name.includes('sur le corps')).length >= 2 && sleuth.view!.objects.filter((o) => o.name.includes('sur le corps')));
for (const o of onBody) log(await act(sleuth, { type: 'take', objectId: o.id }));
const phone = await waitFor('téléphone en poche', () => sleuth.view!.inventory.find((o) => o.type === 'phone'));
log('téléphone :', await act(sleuth, { type: 'examine', objectId: phone.id }));

// ── la boîte cadenassée est cachée dans la chambre de la victime : on fouille ──
const boxKey = await waitFor('clé dorée en poche', () => sleuth.view!.inventory.find((o) => o.name.includes('dorée')));
const { allFurniture } = await import('../src/shared/content/villa');
let diaryRead = false;
for (const room of ['suite', 'bedroom2', 'guestroom']) {
  for (const f of allFurniture().filter((x) => x.roomId === room && x.hiding)) {
    await walkTo(sleuth, { x: f.x + f.w / 2, y: f.y + f.h + 0.6 }, f.name);
    const r = await act(sleuth, { type: 'search', furnitureId: f.id }).catch((e) => String(e.message));
    log('fouille', f.name, '→', r);
    await sleep(300);
    const box = sleuth.view!.objects.find((o) => o.type === 'locked_box');
    if (box) {
      if (sleuth.view!.inventory.length >= 4) await act(sleuth, { type: 'drop', objectId: sleuth.view!.inventory.find((o) => o.id !== boxKey.id && o.id !== phone.id)!.id });
      await act(sleuth, { type: 'take', objectId: box.id });
      log(await act(sleuth, { type: 'open', objectId: box.id }));
      diaryRead = true;
      break;
    }
  }
  if (diaryRead) break;
}
if (!diaryRead) throw new Error('boîte cadenassée introuvable');
const diary = await waitFor('journal lu', () => sleuth.view!.dossier!.evidence.find((e) => e.title.startsWith('Journal')));
const pin = diary.lines.join(' ').match(/l’écris ici : (\d{4})/)![1];
log('code du téléphone trouvé dans le journal :', pin);
log(await act(sleuth, { type: 'unlock', objectId: phone.id, code: pin }));
if (sleuth === host) {
  await page.keyboard.press('Digit1');
  await sleep(2500);
  await shot(page, '05-dossier-personnel');
  await page.keyboard.press('Digit1');
}

// ── dossier commun et accusation formelle ──
const phoneEv = await waitFor('messages lus', () => sleuth.view!.dossier!.evidence.find((e) => e.title.startsWith('Téléphone')));
log(await act(sleuth, { type: 'present', objectId: phoneEv.objectId }));
await sleep(500);
const accuse = await act(sleuth, { type: 'accuse', targetId: murderer.id, evidenceIds: [phoneEv.objectId, diary.objectId], text: 'Ses messages juste avant le crime.' });
log(accuse);
await act(murderer, { type: 'defend', text: 'Je voulais juste lui parler !' });
await sleep(1500);
await shot(page, '06-vote');
await act(third, { type: 'ballot', choice: 'guilty' });
await waitFor('épilogue', () => host.view!.epilogue, 30000);
log('épilogue :', host.view!.epilogue!.headline, '— gagnants :', host.view!.epilogue!.winner);
await sleep(6000);
await shot(page, '07-epilogue');

// ── retour au salon : personnages libérés pour la partie suivante ──
for (const p of all) await call(p, 'game:leave').catch(() => {});
await waitFor('salon réinitialisé', () => host.lobby && host.lobby.status === 'WAITING' && host.lobby.players.every((p) => !p.castId), 20000);
log('retour au salon : sélections réinitialisées');
await sleep(2000);
await shot(page, '08-retour-salon');

console.log('\nErreurs navigateur :', errors.length ? errors : 'aucune');
await browser.close();
for (const p of all) p.s.disconnect();
process.exit(errors.some((e) => e.startsWith('BUG') || e.startsWith('pageerror')) ? 1 : 0);
