import { chromium, type Page } from 'playwright-core';
import { buildWorldGrid, doorAt } from '../src/shared/content/villa';
/**
 * Partie complète automatisée dans de vrais navigateurs (3 joueurs) : inscription → personnage →
 * lobby privé → villa → arme → opportunité → meurtre → découverte → rôles → vote → épilogue → lobby.
 *
 *   EHAS_DB=/tmp/e2e.sqlite EHAS_TIME_SCALE=0.15 EHAS_TRANSITION_MS=2500 npm start   (base vierge)
 *   node --import tsx scripts/e2e-playthrough.ts
 *
 * Variables : E2E_BASE (défaut http://localhost:3001), CHROMIUM_PATH, E2E_SHOTS (défaut screenshots/).
 */
import { mkdirSync } from 'node:fs';
const BASE = `${process.env.E2E_BASE ?? 'http://localhost:3001'}/?debug`;
const SHOTS = process.env.E2E_SHOTS ?? 'screenshots';
mkdirSync(SHOTS, { recursive: true });
const grid = buildWorldGrid();
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const errors: string[] = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function path(from: { x: number; y: number }, to: { x: number; y: number }) {
  const W = grid.w;
  const ok = (x: number, y: number) => {
    const i = y * W + x;
    if (!grid.rooms[i] || grid.blocked[i]) return false;
    const d = doorAt(grid, x, y);
    return !d?.lockedBy;
  };
  const s = [Math.floor(from.x), Math.floor(from.y)];
  const t = [Math.floor(to.x), Math.floor(to.y)];
  const prev = new Map<number, number>();
  const q = [s[1] * W + s[0]];
  prev.set(q[0], -1);
  while (q.length) {
    const c = q.shift()!;
    if (c === t[1] * W + t[0]) break;
    const cx = c % W, cy = Math.floor(c / W);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy, n = ny * W + nx;
      if (!prev.has(n) && ok(nx, ny)) { prev.set(n, c); q.push(n); }
    }
  }
  const out: { x: number; y: number }[] = [];
  let c = t[1] * W + t[0];
  if (!prev.has(c)) throw new Error('no path');
  while (c !== -1) { out.unshift({ x: (c % W) + 0.5, y: Math.floor(c / W) + 0.5 }); c = prev.get(c)!; }
  return out;
}

const myPos = (p: Page) => p.evaluate(() => { const g = (window as any).__ehas.store.getState().game; return g.players.find((x: any) => x.id === g.you).pos; });
const view = (p: Page) => p.evaluate(() => (window as any).__ehas.store.getState().game);
async function walkTo(p: Page, target: { x: number; y: number }) {
  const pts = path(await myPos(p), target);
  for (const wp of pts.slice(1)) {
    for (let i = 0; i < 60; i++) {
      const pos = await myPos(p);
      const dx = wp.x - pos.x, dy = wp.y - pos.y;
      if (Math.hypot(dx, dy) < 0.2) break;
      await p.evaluate(([dx, dy]) => (window as any).__ehas.getSocket().emit('game:input', { dx, dy }), [Math.abs(dx) > 0.1 ? Math.sign(dx) : 0, Math.abs(dy) > 0.1 ? Math.sign(dy) : 0]);
      await sleep(45);
    }
  }
  await p.evaluate(() => (window as any).__ehas.getSocket().emit('game:input', { dx: 0, dy: 0 }));
  await sleep(150);
}
const act = (p: Page, a: any) => p.evaluate((a) => (window as any).__ehas.call('game:action', a), a);

async function newPlayer(name: string, first: string, last: string) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 860 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Créer un compte' }).click();
  await page.fill('input[name=username]', name);
  await page.fill('input[name=password]', 'secret123');
  await page.fill('input[name=confirm]', 'secret123');
  await page.getByRole('button', { name: 'CRÉER MON COMPTE' }).click();
  await page.waitForSelector('text=CREATE YOUR CHARACTER');
  await page.getByRole('button', { name: '🎲 SURPRENDS-MOI' }).click();
  await page.fill('input[name=firstName]', first);
  await page.fill('input[name=lastName]', last);
  await page.getByRole('button', { name: 'ENTRER DANS LE JEU' }).click();
  await page.waitForSelector('text=JOUER');
  return page;
}

const a = await newPlayer('owen', 'Owen', 'Delacroix');
const b = await newPlayer('thomas', 'Thomas', 'Beaumont');
const c = await newPlayer('camille', 'Camille', 'Moreau');
const lobby: any = await a.evaluate(() => (window as any).__ehas.call('lobby:create', { name: 'Villa Beaumont', maxPlayers: 4, visibility: 'PRIVATE' }));
for (const p of [b, c]) await p.evaluate((code) => (window as any).__ehas.call('lobby:join', { code }), lobby.code);
for (const p of [b, c]) await p.evaluate(() => (window as any).__ehas.call('lobby:ready', true));
await sleep(300);
await a.evaluate(() => (window as any).__ehas.call('lobby:start'));
for (const p of [a, b, c]) await p.waitForSelector('.game', { timeout: 15000 });
const t0 = Date.now();
await sleep(800);

// Owen va chercher le couteau
const knife = (await view(a)).objects.find((o: any) => o.type === 'knife');
console.log('knife visible from hall?', !!knife);
await walkTo(a, { x: 8.5, y: 9.5 });
const v = await view(a);
const k = v.objects.find((o: any) => o.type === 'knife');
console.log('in kitchen, knife at', k?.pos);
await walkTo(a, k.pos);
await a.screenshot({ path: `${SHOTS}/20-kitchen.png` });
await a.locator('.action-group', { hasText: 'Couteau' }).getByRole('button', { name: 'Prendre' }).click();
await sleep(400);
console.log('inventory', (await view(a)).inventory.map((o: any) => o.name));

// Thomas rejoint la cuisine, Camille reste au bureau
await walkTo(b, { x: 8.5, y: 9.5 });
await walkTo(c, { x: 33.5, y: 10.5 });
const apos = await myPos(a);
await walkTo(b, { x: Math.floor(apos.x) + (apos.x < 9 ? 1.5 : -0.5), y: Math.floor(apos.y) + 0.5 });
console.log('waiting for escalation…', Math.round((Date.now() - t0) / 1000), 's');
await a.waitForSelector('.opportunity', { timeout: 60000 });
console.log('opportunity at', Math.round((Date.now() - t0) / 1000), 's, phase', (await view(a)).phase);
await a.screenshot({ path: `${SHOTS}/21-opportunity.png` });
await a.getByRole('button', { name: /Saisir/ }).click();
await a.getByRole('button', { name: /Passer à l’acte/ }).click();
await sleep(800);
await a.screenshot({ path: `${SHOTS}/22-after.png` });
await b.screenshot({ path: `${SHOTS}/23-dead.png` });
// Owen se lave et part au salon
await walkTo(a, { x: 7.5, y: 7.5 });
console.log('wash', await act(a, { type: 'wash' }));
await walkTo(a, { x: 16.5, y: 10.5 });
// Camille découvre le corps
await walkTo(c, { x: 9.5, y: 9.5 });
await sleep(1500);
await c.screenshot({ path: `${SHOTS}/24-discovery.png` });
await c.waitForSelector('.tabs-game .pulse', { timeout: 15000 });
await sleep(1500);
await c.keyboard.press('Digit4');
await sleep(300);
await c.screenshot({ path: `${SHOTS}/25-investigation.png` });
const cv = await view(c);
console.log('roles', cv.role?.name, '| A role', (await view(a)).role?.name, '| phase', cv.phase);
// Utilisation d'un outil par chacun
for (const [p, label] of [[a, 'A'], [c, 'C']] as const) {
  const r = (await view(p)).role;
  if (!r) continue;
  for (const t of r.tools) {
    let targetId: string | undefined;
    if (t.id === 'request_testimony' || t.id === 'take_prints' || t.id === 'examine_shoes') targetId = (await view(p)).players.find((x: any) => x.id !== (p === a ? cv.players.find((y: any) => y.name.startsWith('Owen'))?.id : cv.you) && x.alive)?.id;
    const res = await act(p, { type: 'tool', toolId: t.id, targetId }).catch((e: Error) => 'ERR ' + e.message);
    console.log(label, t.id, '→', JSON.stringify(res).slice(0, 160));
  }
}
await c.keyboard.press('Digit3');
await sleep(300);
await c.screenshot({ path: `${SHOTS}/26-notebook.png` });
// Vote
console.log('waiting vote…');
await c.waitForSelector('.vote-modal', { timeout: 90000 });
await c.screenshot({ path: `${SHOTS}/27-vote.png` });
const owenId = cv.players.find((x: any) => x.name.startsWith('Owen')).id;
await act(c, { type: 'vote', suspectId: owenId });
const testimonyOpen = await a.$('text=Interrogatoire');
if (testimonyOpen) console.log('A had testimony modal');
await act(a, { type: 'vote', suspectId: cv.you });
await c.waitForSelector('.epilogue', { timeout: 10000 });
await sleep(6500);
await c.screenshot({ path: `${SHOTS}/28-epilogue.png` });
await c.getByRole('button', { name: /RETOUR AU LOBBY/ }).click();
await c.waitForSelector('.lobby', { timeout: 5000 });
await c.screenshot({ path: `${SHOTS}/29-back-lobby.png` });
await browser.close();
if (errors.length) {
  console.error('Erreurs JS :', errors);
  process.exit(1);
}
console.log('✓ partie complète jouée sans erreur');
