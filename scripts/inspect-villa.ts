/**
 * Inspection visuelle de la villa : une capture par pièce (et quelques vues extérieures), depuis la caméra libre
 * du fantôme, interface masquée. Sert à juger chaque amélioration graphique pièce par pièce.
 *
 *   EHAS_DB=/tmp/inspect.sqlite EHAS_TRANSITION_MS=2500 EHAS_AUTH_RATE_PER_MIN=1000 PORT=3001 npm start
 *   node --import tsx scripts/inspect-villa.ts
 *
 * Variables : E2E_BASE, CHROMIUM_PATH, E2E_SHOTS (défaut screenshots/villa), ROOMS=hall,living,… (filtre),
 * EXTRA=x,y,z,lacet,tangage;… (vues supplémentaires), WIDTH/HEIGHT.
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { io, type Socket } from 'socket.io-client';
import { CAST } from '../src/shared/content/cast';
import { LEVEL_HEIGHT, ROOMS, localX } from '../src/shared/content/villa';

const BASE = process.env.E2E_BASE ?? 'http://localhost:3001';
const SHOTS = process.env.E2E_SHOTS ?? 'screenshots/villa';
mkdirSync(SHOTS, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (...a: unknown[]) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);

async function register(name: string) {
  const res = await fetch(`${BASE}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: name, password: 'secret123' }) });
  const d = (await res.json()) as { token: string; user: { id: string }; error?: string };
  if (!res.ok) throw new Error(d.error);
  return d;
}
function call<T>(s: Socket, event: string, ...args: unknown[]): Promise<T> {
  return new Promise((resolve, reject) => s.emit(event, ...args, (r: { ok: boolean; data: T; error: string }) => (r.ok ? resolve(r.data) : reject(new Error(r.error)))));
}
async function sock(token: string) {
  const s = io(BASE, { auth: { token }, transports: ['websocket'], forceNew: true });
  s.on('lobby:intro', (p: { plan: { id: string }; loading: boolean }) => p.loading && s.emit('lobby:intro-ready', { planId: p.plan.id }));
  await new Promise<void>((r, j) => (s.on('connect', () => r()), s.on('connect_error', j)));
  return s;
}

/** Pose de caméra : depuis un coin de la pièce vers le coin opposé, à hauteur d'œil un peu relevée. */
function roomPose(id: string): [number, number, number, number, number] | null {
  const r = ROOMS.find((x) => x.id === id);
  if (!r || r.treehouse) return null;
  const lvl = r.level ?? 0;
  const { x, y, w, h } = r.rect;
  const x0 = localX(x) + 0.55;
  const z0 = y + 0.55;
  const x1 = localX(x) + w - 0.8;
  const z1 = y + h - 0.8;
  const eye = r.outdoor ? 4.5 : lvl * LEVEL_HEIGHT + (lvl === 2 ? 1.6 : 2.15);
  return [x0, eye, z0, Math.atan2(x1 - x0, z1 - z0), r.outdoor ? -0.35 : -0.22];
}

const stamp = Date.now().toString(36).slice(-4);
const host = await register(`insp_${stamp}`);
const others = await Promise.all([register(`ia_${stamp}`), register(`ib_${stamp}`)]);
const hs = await sock(host.token);
const os = await Promise.all(others.map((o) => sock(o.token)));

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: Number(process.env.WIDTH ?? 1280), height: Number(process.env.HEIGHT ?? 720) } });
await ctx.addInitScript((t) => localStorage.setItem('ehas.token', t), host.token);
// niveau de qualité forcé (QUALITY=0|1|2) : pour mesurer le coût de chaque niveau
if (process.env.QUALITY) await ctx.addInitScript((q) => localStorage.setItem('ehas.quality', q), process.env.QUALITY);
const page = await ctx.newPage();
page.setDefaultTimeout(240000);
const errors: string[] = [];
page.on('pageerror', (e) => (errors.push(e.message), log('ERREUR page :', e.message)));
page.on('console', (m) => m.type() === 'error' && log('console :', m.text().slice(0, 300)));
await page.goto(`${BASE}/?debug`);
await page.waitForFunction(() => document.body.innerText.includes('SERVEURS'));

const lobby = await call<{ code: string }>(hs, 'lobby:create', { name: 'Inspection', maxPlayers: 6, visibility: 'PRIVATE', duration: 'long' });
for (const s of os) await call(s, 'lobby:join', { code: lobby.code });
await call(hs, 'lobby:pick', CAST[0].id);
await call(os[0], 'lobby:pick', CAST[5].id);
await call(os[1], 'lobby:pick', CAST[11].id);
for (const s of os) await call(s, 'lobby:ready', true);
await call(hs, 'lobby:start');
await page.waitForFunction(() => document.querySelector('.hud-top'), undefined, { timeout: 240000 });
log('partie lancée');
// plan sur le corps : on le passe
await sleep(4500);
await page.keyboard.press('Space');
await sleep(1500);
// interface masquée, vue locale en fantôme (caméra libre ; le serveur n'est pas modifié)
await page.addStyleTag({ content: '.hud-top,.dock,.ghost-bar,.cam-hint,.evening-banner,.notifications,.announcement,.chat,.interact-prompt,.dead-banner{display:none!important}' });
await page.evaluate(() => {
  const v = (window as unknown as { __ehas: { view3d: { setView: (g: unknown) => void } } }).__ehas.view3d;
  const orig = v.setView.bind(v);
  v.setView = (g: unknown) => orig({ ...(g as object), alive: false });
});
await page.waitForFunction(() => (window as unknown as { __ehas: { view3d: { ghost: unknown } } }).__ehas.view3d.ghost);

// contrôle : AO_OUTPUT=1 affiche la seule occlusion (GTAOPass.OUTPUT : 0 normal, 1 occlusion débruitée…)
if (process.env.AO_OUTPUT) await page.evaluate((o) => ((window as unknown as { __ehas: { view3d: { fx: { ao: { output: number } } } } }).__ehas.view3d.fx.ao.output = Number(o)), process.env.AO_OUTPUT);
const filter = process.env.ROOMS ? process.env.ROOMS.split(',').filter(Boolean) : null;
const poses: [string, number[]][] = [];
for (const r of ROOMS) {
  if (filter && !filter.includes(r.id)) continue;
  const p = roomPose(r.id);
  if (p) poses.push([r.id, p]);
}
for (const [i, e] of (process.env.EXTRA ?? '').split(';').filter(Boolean).entries()) poses.push([`vue-${i}`, e.split(',').map(Number)]);

for (const [name, [x, y, z, yaw, pitch]] of poses) {
  await page.evaluate(
    ([x, y, z, yaw, pitch]) => {
      const v = (window as unknown as { __ehas: { view3d: { ghost: { pos: { set: (...a: number[]) => void }; follow: unknown }; yaw: number; fpPitch: number } } }).__ehas.view3d;
      v.ghost.follow = null;
      v.ghost.pos.set(x, y, z);
      v.yaw = yaw;
      v.fpPitch = pitch;
    },
    [x, y, z, yaw, pitch],
  );
  await sleep(Number(process.env.WAIT_MS ?? 1200));
  await page.screenshot({ path: `${SHOTS}/${name}.png`, timeout: 90000 });
  // coût de l'image (dernier rendu) : appels de dessin et triangles
  const info = await page.evaluate(() => {
    const r = (window as unknown as { __ehas: { view3d: { renderer: { info: { render: { calls: number; triangles: number } } } } } }).__ehas.view3d.renderer.info.render;
    return { calls: r.calls, triangles: r.triangles };
  });
  log('capture', name, `— ${info.calls} appels, ${(info.triangles / 1000).toFixed(0)} k triangles`);
}
console.log('Erreurs navigateur :', errors.length ? errors : 'aucune');
await browser.close();
for (const s of [hs, ...os]) s.disconnect();
process.exit(0);
