/**
 * Tests du plan de la villa : placement du mobilier (emprises, portes, apparitions, escaliers, échelles),
 * accessibilité de toutes les pièces de tous les niveaux EN SUIVANT LES RÈGLES DU SERVEUR (stepMove :
 * collisions, garde-corps des rampes, transitions de niveau), cachettes, contenants fermés, interdits.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DOORS,
  FURNITURE,
  PLAYER_SPAWNS,
  PORTALS,
  ROOMS,
  allFurniture,
  applyPortal,
  buildWorldGrid,
  doorAt,
  elevationAt,
  gridX,
  levelOf,
  portalArrivalTiles,
  portalEntryTiles,
  rampLength,
  roomAt,
  roomById,
  stepMove,
  type WorldGrid,
} from '../src/shared/content/villa';
import { OBJECT_TYPES } from '../src/shared/content/objects';
import { GAME_CONFIG } from '../src/shared/config';

const furniture = allFurniture();
const grid = buildWorldGrid();
const tilesOf = (f: { x: number; y: number; w: number; h: number }) => {
  const out: [number, number][] = [];
  for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) out.push([x, y]);
  return out;
};
const key = (x: number, y: number) => `${x},${y}`;
const inRect = (r: { x: number; y: number; w: number; h: number }, x: number, y: number) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

/** Mêmes règles que GameInstance.fits (toutes les portes ouvertes, ou seulement celles de `open`). */
function fitsWith(g: WorldGrid, open: (doorId: string) => boolean) {
  const passable = (x: number, y: number) => {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= g.w || ty >= g.h) return false;
    const idx = ty * g.w + tx;
    if (!g.rooms[idx] || g.blocked[idx]) return false;
    const d = doorAt(g, tx, ty);
    return !d?.lockedBy || open(d.id);
  };
  const r = GAME_CONFIG.playerRadius;
  return (x: number, y: number) => passable(x - r, y - r) && passable(x + r, y - r) && passable(x - r, y + r) && passable(x + r, y + r);
}

/**
 * Exploration « à pied » : depuis une position, on marche vers le centre de chaque tuile voisine
 * avec de petits pas du serveur (stepMove). Une tuile est atteinte si l'on y arrive (ou si l'on
 * change de niveau en chemin). Retourne la position représentative de chaque tuile atteinte.
 */
function explore(start: { x: number; y: number }, open: (doorId: string) => boolean) {
  const fits = fitsWith(grid, open);
  const reached = new Map<string, { x: number; y: number }>();
  const startKey = key(Math.floor(start.x), Math.floor(start.y));
  reached.set(startKey, { ...start });
  const queue = [startKey];
  const step = GAME_CONFIG.walkSpeed / GAME_CONFIG.tickRate;
  while (queue.length) {
    const from = reached.get(queue.shift()!)!;
    const tx = Math.floor(from.x);
    const ty = Math.floor(from.y);
    for (const [nx, ny] of [[tx + 1, ty], [tx - 1, ty], [tx, ty + 1], [tx, ty - 1]]) {
      const p = { ...from };
      for (let i = 0; i < 30; i++) {
        const dx = nx + 0.5 - p.x;
        const dy = ny + 0.5 - p.y;
        const d = Math.hypot(dx, dy);
        if (d < 0.05) break;
        const s = Math.min(step, d);
        const level = levelOf(p.x);
        stepMove(p, (dx / d) * s, (dy / d) * s, fits);
        if (levelOf(p.x) !== level) break;
      }
      const k = key(Math.floor(p.x), Math.floor(p.y));
      if (!reached.has(k)) {
        reached.set(k, p);
        queue.push(k);
      }
    }
  }
  return reached;
}

const free = (x: number, y: number) => x >= 0 && y >= 0 && x < grid.w && y < grid.h && grid.rooms[y * grid.w + x] !== 0 && !grid.blocked[y * grid.w + x];
const spawn = PLAYER_SPAWNS[0];
const everywhere = explore(spawn, () => true);

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

test('pièces : ids uniques, sans chevauchement, portes entre leurs deux pièces', () => {
  const seen = new Map<string, string>();
  const ids = new Set<string>();
  for (const r of ROOMS) {
    assert.ok(!ids.has(r.id), `pièce dupliquée ${r.id}`);
    ids.add(r.id);
    assert.equal(levelOf(r.rect.x), r.level ?? 0, `${r.id} hors de la bande de son niveau`);
    assert.equal(levelOf(r.rect.x + r.rect.w - 1), r.level ?? 0, `${r.id} déborde de la bande de son niveau`);
    for (const [x, y] of tilesOf(r.rect)) {
      assert.ok(!seen.has(key(x, y)), `${r.id} chevauche ${seen.get(key(x, y))} en (${x},${y})`);
      seen.set(key(x, y), r.id);
    }
  }
  for (const d of DOORS) {
    assert.ok(!seen.has(key(d.x, d.y)), `porte ${d.id} dans une pièce`);
    const around = [[d.x + 1, d.y], [d.x - 1, d.y], [d.x, d.y + 1], [d.x, d.y - 1]].map(([x, y]) => seen.get(key(x, y)));
    for (const r of d.rooms) assert.ok(around.includes(r), `porte ${d.id} ne touche pas ${r}`);
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

test('portes, seuils, apparitions, escaliers et échelles dégagés', () => {
  const occ = new Map<string, string>();
  for (const f of furniture) if (!f.walkable) for (const [x, y] of tilesOf(f)) occ.set(key(x, y), f.id);
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
    assert.equal(roomAt(grid, s.x, s.y)?.id, 'hall', `apparition hors du hall (${k})`);
  }
  for (const p of PORTALS) {
    for (const [x, y] of tilesOf({ ...p, x: gridX(p.level, p.x) })) {
      assert.ok(!occ.has(key(x, y)), `${occ.get(key(x, y))} sur ${p.id} (${x},${y})`);
      assert.equal(roomAt(grid, x + 0.5, y + 0.5)?.id, p.roomId, `${p.id} hors de ${p.roomId}`);
    }
    for (const [x, y] of portalEntryTiles(p)) assert.ok(free(x, y), `entrée de ${p.id} bloquée (${x},${y})`);
    for (const [x, y] of portalArrivalTiles(p)) assert.ok(free(x, y), `arrivée de ${p.id} bloquée (${x},${y})`);
  }
});

test('toutes les pièces de tous les niveaux sont accessibles à pied et entièrement praticables', () => {
  for (const r of ROOMS) {
    let any = false;
    for (const [x, y] of tilesOf(r.rect)) {
      if (!free(x, y)) continue;
      any = true;
      assert.ok(everywhere.has(key(x, y)), `tuile (${x},${y}) de ${r.id} inaccessible`);
    }
    assert.ok(any, `${r.id} n'a aucune tuile libre`);
  }
});

test('sans clé : seules les pièces derrière une porte verrouillée sont hors d’atteinte', () => {
  const locked = new Set(DOORS.filter((d) => d.lockedBy).flatMap((d) => d.rooms));
  const reach = explore(spawn, () => false);
  const reachedRooms = new Set([...reach.keys()].map((k) => roomAt(grid, Number(k.split(',')[0]) + 0.5, Number(k.split(',')[1]) + 0.5)?.id));
  for (const r of ROOMS) if (!reachedRooms.has(r.id)) assert.ok(locked.has(r.id), `${r.id} inaccessible sans clé`);
  assert.ok(!reachedRooms.has('cellar'), 'la cave à vin doit rester fermée à clé');
  // la clé peut apparaître dans une pièce accessible sans clé
  const key_ = OBJECT_TYPES.find((o) => o.type === 'key_cellar')!;
  assert.ok(key_.spawnRooms.some((r) => reachedRooms.has(r)));
});

test('escaliers et échelles praticables dans les deux sens, à la marche comme à la course', () => {
  const fits = fitsWith(grid, () => true);
  for (const p of PORTALS) {
    const len = rampLength(p);
    const unit = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[p.dir];
    for (const speed of [GAME_CONFIG.walkSpeed, GAME_CONFIG.runSpeed]) {
      const step = speed / GAME_CONFIG.tickRate;
      // montée : depuis la tuile d'entrée
      const [ex, ey] = portalEntryTiles(p)[0];
      const pos = { x: ex + 0.5, y: ey + 0.5 };
      let up = false;
      for (let i = 0; i < 200 && !up; i++) up = stepMove(pos, unit[0] * step, unit[1] * step, fits);
      assert.ok(up, `${p.id} : montée bloquée à (${pos.x.toFixed(2)},${pos.y.toFixed(2)})`);
      assert.equal(levelOf(pos.x), p.level + 1);
      // descente : on repart vers la trémie
      let down = false;
      for (let i = 0; i < 200 && !down; i++) down = stepMove(pos, -unit[0] * step, -unit[1] * step, fits);
      assert.ok(down, `${p.id} : descente bloquée à (${pos.x.toFixed(2)},${pos.y.toFixed(2)})`);
      assert.equal(levelOf(pos.x), p.level);
      // on redescend jusqu'en bas sans rester coincé
      const n = Math.ceil((len + 1) / step) + 2;
      for (let i = 0; i < n; i++) stepMove(pos, -unit[0] * step, -unit[1] * step, fits);
      assert.ok(Math.abs(elevationAt(pos.x, pos.y) - p.level * 3.3) < 0.01, `${p.id} : pas revenu en bas (${pos.x.toFixed(2)},${pos.y.toFixed(2)})`);
    }
    // garde-corps : impossible d'entrer par le côté au milieu de la rampe
    const mid = { n: { x: p.x - 0.6, y: p.y + p.h / 2 }, s: { x: p.x - 0.6, y: p.y + p.h / 2 }, e: { x: p.x + p.w / 2, y: p.y - 0.6 }, w: { x: p.x + p.w / 2, y: p.y - 0.6 } }[p.dir];
    const side = { x: gridX(p.level, mid.x), y: mid.y };
    if (fits(side.x, side.y)) {
      const dir = p.dir === 'n' || p.dir === 's' ? [0.2, 0] : [0, 0.2];
      for (let i = 0; i < 10; i++) stepMove(side, dir[0], dir[1], fits);
      assert.ok(elevationAt(side.x, side.y) < 0.01 + p.level * 3.3, `${p.id} : on entre par le côté`);
    }
  }
  // la hauteur monte régulièrement le long de chaque rampe
  for (const p of PORTALS) {
    const [ex, ey] = portalEntryTiles(p)[0];
    const [ax, ay] = portalArrivalTiles(p)[0];
    assert.ok(elevationAt(ax + 0.5, ay + 0.5) - elevationAt(ex + 0.5, ey + 0.5) > 3.2, `${p.id} : dénivelé`);
    assert.equal(applyPortal(ex + 0.5, ey + 0.5), null);
  }
});

test('pièces meublées mais praticables', () => {
  for (const r of ROOMS) {
    if (r.outdoor) continue;
    const inside = furniture.filter((f) => f.roomId === r.id);
    const area = r.rect.w * r.rect.h;
    const blocked = inside.filter((f) => !f.walkable && f.kind !== 'railing').reduce((s, f) => s + f.w * f.h, 0);
    const min = area >= 80 ? 9 : area >= 30 ? 6 : 3;
    assert.ok(inside.length >= min, `${r.id} : seulement ${inside.length} meubles`);
    assert.ok(blocked / area <= 0.45, `${r.id} : ${Math.round((blocked / area) * 100)} % encombré`);
  }
});

test('au moins deux cachettes accessibles par pièce', () => {
  for (const r of ROOMS) {
    const spots = furniture.filter((f) => f.roomId === r.id && f.hiding);
    assert.ok(spots.length >= 2, `${r.id} : ${spots.length} cachette(s)`);
    for (const f of spots) {
      const ok = tilesOf(f).some(([x, y]) =>
        [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].some(([nx, ny]) => free(nx, ny) && everywhere.has(key(nx, ny)) && roomAt(grid, nx + 0.5, ny + 0.5)?.id === r.id),
      );
      assert.ok(ok, `cachette ${f.id} inaccessible`);
      assert.ok(f.name.length > 4 && !/^Meuble$/i.test(f.name), `cachette ${f.id} mal nommée`);
    }
  }
});

test('contenants fermés, cheminée, terminal', () => {
  const byId = (id: string) => furniture.find((f) => f.id === id);
  assert.equal(byId('f_office_safe')?.lock, 'code');
  assert.equal(byId('f_office_safe')?.hiding, true);
  assert.equal(byId('f_attic_trunk')?.lock, 'key');
  assert.equal(byId('f_attic_trunk')?.roomId, 'attic');
  assert.ok(furniture.some((f) => f.kind === 'desk' && f.lock === 'key' && f.hiding), 'tiroir de bureau fermé à clé');
  const fire = byId('f_living_fireplace');
  assert.equal(fire?.kind, 'fireplace');
  assert.equal(fire?.roomId, 'living');
  assert.ok(FURNITURE.includes(fire!), 'la cheminée du salon fait partie du mobilier principal (brûler des documents)');
  assert.ok(byId('f_office_terminal'), 'terminal conservé');
  for (const f of furniture) if (f.lock) assert.ok(f.hiding, `${f.id} fermé mais pas contenant`);
  // un point d'eau dans chaque pièce équipée (se laver les mains)
  for (const r of ROOMS) if (r.hasSink) assert.ok(FURNITURE.some((f) => f.kind === 'sink' && f.roomId === r.id), `${r.id} : pas d'évier`);
});

test('objets interdits absents du mobilier et de la décoration', () => {
  const forbidden = /horloge|pendule|réveil|clock|dictaphone|enregistreur|magnétophone|disque dur|tableau blanc|plateau (de|à) (boissons|apéritif)|badge|disjoncteur|fusible|tableau électrique|sonnette|interphone|caméra|camera/i;
  for (const f of furniture) {
    if (f.id === 'f_office_terminal') continue; // gameplay d'un autre module, retiré séparément
    assert.ok(!forbidden.test(f.name) && !forbidden.test(f.kind), `objet interdit : ${f.id} (${f.name})`);
  }
  assert.ok(!furniture.some((f) => (f.kind as string) === 'clock'));
});

test('pièces requises et apparitions d’objets valides', () => {
  for (const id of ['living', 'dining', 'kitchen', 'bedroom1', 'bedroom2', 'suite', 'guestroom', 'bathroom', 'bathroom2', 'wc', 'laundry', 'office', 'gamesroom', 'garage', 'basement', 'cellar', 'attic', 'garden', 'exterior', 'treehouse1', 'treehouse2', 'hall', 'landing', 'library', 'musicroom', 'studio', 'corridor'])
    assert.ok(roomById(id), `pièce manquante : ${id}`);
  assert.equal(roomById('basement')?.level, -1);
  assert.equal(roomById('attic')?.level, 2);
  for (const o of OBJECT_TYPES) for (const r of o.spawnRooms) assert.ok(roomById(r), `${o.type} : pièce d'apparition inconnue ${r}`);
});
