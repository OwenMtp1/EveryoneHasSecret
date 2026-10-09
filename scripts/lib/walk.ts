/**
 * Itinéraires « à pied » dans la villa, avec EXACTEMENT les règles de déplacement du serveur
 * (stepMove : murs, mobilier, portes, rampes d'escalier, échelles). Sert aux scripts de partie
 * automatisée : on calcule un chemin de tuile en tuile, puis on envoie des intentions de déplacement.
 */
import { GAME_CONFIG } from '../../src/shared/config';
import { buildWorldGrid, doorAt, levelOf, stepMove, type WorldGrid } from '../../src/shared/content/villa';

const grid: WorldGrid = buildWorldGrid();
const key = (x: number, y: number) => `${x},${y}`;

function fitsWith(open: (doorId: string) => boolean) {
  const passable = (x: number, y: number) => {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= grid.w || ty >= grid.h) return false;
    const idx = ty * grid.w + tx;
    if (!grid.rooms[idx] || grid.blocked[idx]) return false;
    const d = doorAt(grid, tx, ty);
    return !d?.lockedBy || open(d.id);
  };
  const r = GAME_CONFIG.playerRadius;
  return (x: number, y: number) => passable(x - r, y - r) && passable(x + r, y - r) && passable(x - r, y + r) && passable(x + r, y + r);
}

/** Chemin (positions successives) de `from` vers la tuile accessible la plus proche de `to`. */
export function findPath(from: { x: number; y: number }, to: { x: number; y: number }, unlocked: Set<string>): { x: number; y: number }[] | null {
  const fits = fitsWith((id) => unlocked.has(id));
  const step = GAME_CONFIG.walkSpeed / GAME_CONFIG.tickRate;
  const startK = key(Math.floor(from.x), Math.floor(from.y));
  const reached = new Map<string, { pos: { x: number; y: number }; prev: string | null }>([[startK, { pos: { ...from }, prev: null }]]);
  const queue = [startK];
  const goalLevel = levelOf(to.x);
  let best: string = startK;
  let bestD = Infinity;
  while (queue.length) {
    const k = queue.shift()!;
    const from2 = reached.get(k)!.pos;
    const d = Math.hypot(from2.x - to.x, from2.y - to.y) + (levelOf(from2.x) === goalLevel ? 0 : 100);
    if (d < bestD) {
      bestD = d;
      best = k;
      if (d < 0.8) break;
    }
    const tx = Math.floor(from2.x);
    const ty = Math.floor(from2.y);
    for (const [nx, ny] of [[tx + 1, ty], [tx - 1, ty], [tx, ty + 1], [tx, ty - 1]]) {
      const p = { ...from2 };
      for (let i = 0; i < 30; i++) {
        const dx = nx + 0.5 - p.x;
        const dy = ny + 0.5 - p.y;
        const dd = Math.hypot(dx, dy);
        if (dd < 0.05) break;
        const s = Math.min(step, dd);
        const lv = levelOf(p.x);
        stepMove(p, (dx / dd) * s, (dy / dd) * s, fits);
        if (levelOf(p.x) !== lv) break;
      }
      const nk = key(Math.floor(p.x), Math.floor(p.y));
      if (!reached.has(nk)) {
        reached.set(nk, { pos: p, prev: k });
        queue.push(nk);
      }
    }
  }
  if (bestD > 2.5) return null;
  const out: { x: number; y: number }[] = [];
  for (let k: string | null = best; k; k = reached.get(k)!.prev) out.unshift(reached.get(k)!.pos);
  return out;
}
