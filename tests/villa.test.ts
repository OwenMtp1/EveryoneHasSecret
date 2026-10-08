/**
 * Tests du plan de la villa : placement du mobilier (emprises, portes, apparitions, escalier)
 * et connexité de toutes les pièces (rez-de-chaussée + étage).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOORS, LEVEL_OFFSET_X, PLAYER_SPAWNS, ROOMS, STAIRS, allFurniture, buildWorldGrid, roomById } from '../src/shared/content/villa';

const furniture = allFurniture();
const tilesOf = (f: { x: number; y: number; w: number; h: number }) => {
  const out: [number, number][] = [];
  for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) out.push([x, y]);
  return out;
};
const key = (x: number, y: number) => `${x},${y}`;
const inRect = (r: { x: number; y: number; w: number; h: number }, x: number, y: number) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

test('chaque meuble a un id unique, une pièce existante et tient dans sa pièce', () => {
  const ids = new Set<string>();
  for (const f of furniture) {
    assert.ok(!ids.has(f.id), `id dupliqué ${f.id}`);
    ids.add(f.id);
    const r = roomById(f.roomId);
    assert.ok(r, `pièce inconnue ${f.roomId} (${f.id})`);
    assert.ok(f.w >= 1 && f.h >= 1, `emprise vide ${f.id}`);
    for (const [x, y] of tilesOf(f)) assert.ok(inRect(r!.rect, x, y), `${f.id} déborde de ${f.roomId} en (${x},${y})`);
  }
});

test('aucun chevauchement de meubles', () => {
  const seen = new Map<string, string>();
  for (const f of furniture)
    for (const [x, y] of tilesOf(f)) {
      const k = key(x, y);
      assert.ok(!seen.has(k), `${f.id} chevauche ${seen.get(k)} en (${k})`);
      seen.set(k, f.id);
    }
});

test('portes, seuils, apparitions et escalier dégagés', () => {
  const occ = new Map<string, string>();
  for (const f of furniture) if (f.kind !== 'stairs') for (const [x, y] of tilesOf(f)) occ.set(key(x, y), f.id);
  for (const d of DOORS) {
    const around: [number, number][] = [[d.x, d.y], [d.x + 1, d.y], [d.x - 1, d.y], [d.x, d.y + 1], [d.x, d.y - 1]];
    for (const [x, y] of around) {
      // seuils : tuiles des pièces de part et d'autre (pas les murs)
      const inRoom = ROOMS.some((r) => d.rooms.includes(r.id) && inRect(r.rect, x, y));
      if (x !== d.x || y !== d.y) if (!inRoom) continue;
      assert.ok(!occ.has(key(x, y)), `${occ.get(key(x, y))} bloque la porte ${d.id} en (${x},${y})`);
    }
  }
  for (const s of PLAYER_SPAWNS) {
    const k = key(Math.floor(s.x), Math.floor(s.y));
    assert.ok(!occ.has(k), `${occ.get(k)} sur un point d'apparition (${k})`);
  }
  for (let y = STAIRS.y - 1; y < STAIRS.y + STAIRS.h; y++)
    for (let x = STAIRS.x; x < STAIRS.x + STAIRS.w; x++) assert.ok(!occ.has(key(x, y)), `${occ.get(key(x, y))} sur l'escalier (${x},${y})`);
  // arrivée sur le palier, en haut de l'escalier
  for (let x = STAIRS.x; x < STAIRS.x + STAIRS.w; x++) {
    const k = key(x + LEVEL_OFFSET_X, STAIRS.y + STAIRS.h);
    assert.ok(!occ.has(k), `${occ.get(k)} sur l'arrivée de l'escalier (${k})`);
  }
});

test('toutes les pièces sont accessibles et entièrement praticables', () => {
  const g = buildWorldGrid();
  const free = (x: number, y: number) => x >= 0 && y >= 0 && x < g.w && y < g.h && g.rooms[y * g.w + x] !== 0 && !g.blocked[y * g.w + x];
  const sp = PLAYER_SPAWNS[0];
  const start: [number, number] = [Math.floor(sp.x), Math.floor(sp.y)];
  const seen = new Set<string>([key(...start)]);
  const queue: [number, number][] = [start];
  while (queue.length) {
    const [x, y] = queue.shift()!;
    const next: [number, number][] = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
    // haut de l'escalier ↔ palier de l'étage
    if (y === STAIRS.y + STAIRS.h - 1 && x >= STAIRS.x && x < STAIRS.x + STAIRS.w) next.push([x + LEVEL_OFFSET_X, y + 1]);
    if (y === STAIRS.y + STAIRS.h && x - LEVEL_OFFSET_X >= STAIRS.x && x - LEVEL_OFFSET_X < STAIRS.x + STAIRS.w) next.push([x - LEVEL_OFFSET_X, y - 1]);
    for (const [nx, ny] of next) {
      if (!free(nx, ny) || seen.has(key(nx, ny))) continue;
      seen.add(key(nx, ny));
      queue.push([nx, ny]);
    }
  }
  for (const r of ROOMS) {
    for (let y = r.rect.y; y < r.rect.y + r.rect.h; y++)
      for (let x = r.rect.x; x < r.rect.x + r.rect.w; x++)
        if (free(x, y)) assert.ok(seen.has(key(x, y)), `tuile (${x},${y}) de ${r.id} inaccessible`);
  }
});

test('pièces meublées mais praticables', () => {
  for (const r of ROOMS) {
    if (r.outdoor) continue;
    const inside = furniture.filter((f) => f.roomId === r.id);
    const area = r.rect.w * r.rect.h;
    const blocked = inside.filter((f) => !f.walkable).reduce((s, f) => s + f.w * f.h, 0);
    const min = area >= 80 ? 9 : 6;
    assert.ok(inside.length >= min, `${r.id} : seulement ${inside.length} meubles`);
    assert.ok(blocked / area <= 0.45, `${r.id} : ${Math.round((blocked / area) * 100)} % encombré`);
  }
});
