/**
 * Recherche de chemin sur la grille de la villa (BFS 8-voisins sans couper les coins).
 */
import { DOORS, ROOMS, doorAt, type WorldGrid } from '@shared/content/villa';
import type { Vec2 } from '@shared/types';

export function findPath(g: WorldGrid, from: Vec2, to: Vec2, unlocked: Set<string>): Vec2[] | null {
  const W = g.w;
  const ok = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= W || y >= g.h) return false;
    const i = y * W + x;
    if (!g.rooms[i] || g.blocked[i]) return false;
    const d = doorAt(g, x, y);
    return !(d?.lockedBy && !unlocked.has(d.id));
  };
  const sx = Math.floor(from.x);
  const sy = Math.floor(from.y);
  const tx = Math.floor(to.x);
  const ty = Math.floor(to.y);
  if (!ok(tx, ty)) return null;
  const start = sy * W + sx;
  const goal = ty * W + tx;
  const prev = new Map<number, number>([[start, -1]]);
  const queue = [start];
  for (let qi = 0; qi < queue.length; qi++) {
    const c = queue[qi];
    if (c === goal) break;
    const cx = c % W;
    const cy = (c - cx) / W;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!ok(nx, ny)) continue;
      if (dx && dy && (!ok(cx + dx, cy) || !ok(cx, cy + dy))) continue;
      const n = ny * W + nx;
      if (prev.has(n)) continue;
      prev.set(n, c);
      queue.push(n);
    }
  }
  if (!prev.has(goal)) return null;
  const out: Vec2[] = [];
  for (let c = goal; c !== -1 && c !== start; c = prev.get(c)!) out.unshift({ x: (c % W) + 0.5, y: Math.floor(c / W) + 0.5 });
  return out;
}

/** Portes (non verrouillées) reliant deux pièces. */
export function doorsBetween(a: string, b: string, unlocked: Set<string>) {
  return DOORS.filter((d) => d.rooms.includes(a) && d.rooms.includes(b) && (!d.lockedBy || unlocked.has(d.id)));
}

export const INDOOR_ROOMS = ROOMS.map((r) => r.id);
