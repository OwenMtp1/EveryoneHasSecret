/**
 * Villa Beaumont en 3D réaliste, générée à partir du plan (shared/content/villa.ts).
 * 1 tuile = 1 mètre. Monde : x = colonne, z = ligne, y = hauteur.
 *
 *  - murs : faces orientées par pièce (papier peint / carrelage / brique en façade), plinthes, corniches
 *  - sols PBR par matériau, tapis, plafonds en plâtre et suspensions
 *  - portes encadrées, fenêtres avec vitrage et rideaux, façade éclairée de l'intérieur
 *  - mobilier détaillé orienté contre le mur le plus proche
 * Ajouter une pièce ou un meuble dans les données suffit à le faire apparaître.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DOORS, GRID_W, LEVEL_HEIGHT, LEVEL_OFFSET_X, ROOMS, WORLD_H, WORLD_W, allFurniture, buildWorldGrid, levelOf, type FurnitureDef, type RoomDef } from '@shared/content/villa';
import { MAT, fabricTex } from './materials';
import { box, cyl, sphere } from './build';
import { buildFurnishing } from './furnishing3d';

export const WALL_H = 3;
const grid = buildWorldGrid();
const roomIdx = (x: number, y: number) => (x < 0 || y < 0 || x >= GRID_W || y >= WORLD_H ? 0 : grid.rooms[y * GRID_W + x]);
const roomAtTile = (x: number, y: number): RoomDef | null => {
  const r = roomIdx(x, y);
  return r ? ROOMS[r - 1] : null;
};
const isDoor = (x: number, y: number) => x >= 0 && y >= 0 && x < GRID_W && y < WORLD_H && !!grid.doors[y * GRID_W + x];
/** Tuiles de l'étage sans plancher (trémie de l'escalier, entourée d'une rambarde). */
const voidTiles = new Set<string>();
for (const f of allFurniture())
  if (f.kind === 'railing') for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) voidTiles.add(`${x},${y}`);
const isVoid = (x: number, y: number) => voidTiles.has(`${x},${y}`);
/** Sous une trémie de l'étage : pas de plafond au rez-de-chaussée. */
const underVoid = (x: number, y: number) => voidTiles.has(`${x + LEVEL_OFFSET_X},${y}`);
/** Plan horizontal découpé par tuiles (trous possibles), UV continus sur la pièce. */
function tiledPlane(r: RoomDef, skip: (x: number, y: number) => boolean, faceUp: boolean): THREE.BufferGeometry | null {
  const geos: THREE.BufferGeometry[] = [];
  for (let y = r.rect.y; y < r.rect.y + r.rect.h; y++)
    for (let x = r.rect.x; x < r.rect.x + r.rect.w; x++) {
      if (skip(x, y)) continue;
      const p = new THREE.PlaneGeometry(1, 1);
      const uv = p.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (x - r.rect.x + uv.getX(i)) / r.rect.w, (r.rect.y + r.rect.h - y - 1 + uv.getY(i)) / r.rect.h);
      p.rotateX(faceUp ? -Math.PI / 2 : Math.PI / 2);
      p.translate(x + 0.5, 0, y + 0.5);
      geos.push(p);
    }
  return geos.length ? mergeGeometries(geos) : null;
}

// ───────────── style des pièces ─────────────

interface RoomStyle {
  floor: (w: number, h: number) => THREE.Material;
  wall: () => THREE.Material;
  light: string;
  lamp: 'pendant' | 'chandelier' | 'bulb';
  rug?: { w: number; h: number; base: string; border: string; dx?: number; dz?: number };
}

const STYLE: Record<string, RoomStyle> = {
  kitchen: { floor: (w, h) => MAT.tiles(w, h), wall: () => MAT.wallpaper('#d9d1bf', '#b9ae97', 'tiles', WALL_H), light: '#ffd9a6', lamp: 'pendant' },
  living: { floor: (w, h) => MAT.hardwood(w, h), wall: () => MAT.wallpaper('#2f4a3c', '#c9a45c', 'damask', WALL_H), light: '#ffc98a', lamp: 'chandelier', rug: { w: 5, h: 3.2, base: '#5a1820', border: '#c9a45c', dx: -4, dz: 0.4 } },
  office: { floor: (w, h) => MAT.hardwood(w, h, '#8a6a52'), wall: () => MAT.wallpaper('#1f2a40', '#3a4a6a', 'stripes', WALL_H), light: '#ffcf96', lamp: 'pendant', rug: { w: 3, h: 2, base: '#3a2232', border: '#a07a4a', dz: 0.5 } },
  bathroom: { floor: (w, h) => MAT.tiles(w, h), wall: () => MAT.wallpaper('#e8ecef', '#9fb0bc', 'tiles', WALL_H), light: '#f1f4ff', lamp: 'bulb' },
  cellar: { floor: (w, h) => MAT.concrete(w, h), wall: () => MAT.brick(1, WALL_H / 1.5), light: '#ffb070', lamp: 'bulb' },
  hall: { floor: (w, h) => MAT.marble(w, h), wall: () => MAT.wallpaper('#5a1d26', '#8a3a44', 'damask', WALL_H), light: '#ffc98a', lamp: 'chandelier', rug: { w: 2, h: 6, base: '#3b1218', border: '#c9a45c', dz: 0 } },
  corridor: { floor: (w, h) => MAT.hardwood(w, h), wall: () => MAT.wallpaper('#c9b48f', '#a88f68', 'stripes', WALL_H), light: '#ffcf96', lamp: 'bulb', rug: { w: 12, h: 1.2, base: '#4a2a1e', border: '#b08a4a' } },
  bedroom1: { floor: (w, h) => MAT.hardwood(w, h), wall: () => MAT.wallpaper('#28375a', '#48618f', 'damask', WALL_H), light: '#ffd3a0', lamp: 'pendant', rug: { w: 3, h: 2, base: '#1e2a4a', border: '#c8b48a', dx: 1 } },
  bedroom2: { floor: (w, h) => MAT.hardwood(w, h, '#a27a5a'), wall: () => MAT.wallpaper('#4a1a24', '#7a2c3a', 'damask', WALL_H), light: '#ffc58a', lamp: 'chandelier', rug: { w: 3.5, h: 2.4, base: '#3a1018', border: '#d4b06a', dx: -0.5 } },
  // ── Étage ──
  library: { floor: (w, h) => MAT.hardwood(w, h, '#7a5a40'), wall: () => MAT.wallpaper('#2a3a2c', '#7a8a5a', 'stripes', WALL_H), light: '#ffc98a', lamp: 'chandelier', rug: { w: 4, h: 2.6, base: '#4a1a1e', border: '#c9a45c', dz: 0.4 } },
  guestroom: { floor: (w, h) => MAT.hardwood(w, h, '#a27a5a'), wall: () => MAT.wallpaper('#5a4a3a', '#8a7458', 'damask', WALL_H), light: '#ffd3a0', lamp: 'pendant', rug: { w: 3, h: 2.2, base: '#3a2a1e', border: '#c8b48a' } },
  musicroom: { floor: (w, h) => MAT.hardwood(w, h), wall: () => MAT.wallpaper('#3a1e2a', '#a07a5a', 'damask', WALL_H), light: '#ffc98a', lamp: 'chandelier', rug: { w: 5, h: 3.5, base: '#2a1a3a', border: '#c9a45c' } },
  suite: { floor: (w, h) => MAT.hardwood(w, h, '#8a6a52'), wall: () => MAT.wallpaper('#2a2440', '#6a5a8a', 'damask', WALL_H), light: '#ffc58a', lamp: 'chandelier', rug: { w: 4, h: 3, base: '#3a1018', border: '#d4b06a' } },
  bathroom2: { floor: (w, h) => MAT.tiles(w, h), wall: () => MAT.wallpaper('#e4e8e0', '#9fb0a0', 'tiles', WALL_H), light: '#f1f4ff', lamp: 'bulb' },
  studio: { floor: (w, h) => MAT.hardwood(w, h, '#b0906a'), wall: () => MAT.wallpaper('#d8cfbe', '#b8ab92', 'stripes', WALL_H), light: '#fff0d8', lamp: 'pendant' },
  landing: { floor: (w, h) => MAT.hardwood(w, h), wall: () => MAT.wallpaper('#c9b48f', '#a88f68', 'stripes', WALL_H), light: '#ffcf96', lamp: 'bulb', rug: { w: 14, h: 1.2, base: '#4a2a1e', border: '#b08a4a', dx: -3 } },
  garden: { floor: (w, h) => MAT.grass(w, h), wall: () => MAT.brick(1, 1.1 / 1.5), light: '', lamp: 'bulb' },
  exterior: { floor: (w, h) => MAT.gravel(w, h), wall: () => MAT.brick(1, 1.1 / 1.5), light: '', lamp: 'bulb' },
};

// ───────────── helpers de construction ─────────────

/** Côté du meuble adossé à un mur : 'n' (z−), 's' (z+), 'w' (x−), 'e' (x+). */
function wallSide(f: FurnitureDef): 'n' | 's' | 'w' | 'e' | null {
  const blockedRow = (y: number) => [...Array(f.w).keys()].every((i) => !roomIdx(f.x + i, y) || isDoor(f.x + i, y));
  const blockedCol = (x: number) => [...Array(f.h).keys()].every((i) => !roomIdx(x, f.y + i) || isDoor(x, f.y + i));
  if (blockedRow(f.y - 1)) return 'n';
  if (blockedRow(f.y + f.h)) return 's';
  if (blockedCol(f.x - 1)) return 'w';
  if (blockedCol(f.x + f.w)) return 'e';
  return null;
}

/** Repère local : dos du meuble vers −z (contre le mur), largeur W sur x, profondeur D sur z. */
function oriented(f: FurnitureDef) {
  const side = f.facing ?? wallSide(f) ?? 'n';
  const g = new THREE.Group();
  g.position.set(f.x + f.w / 2, 0, f.y + f.h / 2);
  let W = f.w;
  let D = f.h;
  if (side === 's') g.rotation.y = Math.PI;
  if (side === 'w') {
    g.rotation.y = Math.PI / 2;
    W = f.h;
    D = f.w;
  }
  if (side === 'e') {
    g.rotation.y = -Math.PI / 2;
    W = f.h;
    D = f.w;
  }
  return { g, W: W - 0.08, D: D - 0.08 };
}

let paintingSeed = 3;
function paintingTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 96;
  const x = c.getContext('2d')!;
  const r = () => ((paintingSeed = (paintingSeed * 16807) % 2147483647) - 1) / 2147483646;
  const palettes = [['#2b3a2a', '#6b7b4a', '#c9b47a'], ['#1a2238', '#3a5a8a', '#d8c08a'], ['#3a1a1a', '#8a3a2a', '#e0b080'], ['#20302e', '#5a7a6a', '#f0e0b0']];
  const p = palettes[Math.floor(r() * palettes.length)];
  const g = x.createLinearGradient(0, 0, 0, 96);
  g.addColorStop(0, p[1]);
  g.addColorStop(1, p[0]);
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 96);
  if (r() < 0.5) {
    x.fillStyle = p[0];
    x.beginPath();
    x.moveTo(0, 70);
    for (let i = 0; i <= 128; i += 16) x.lineTo(i, 55 + r() * 25);
    x.lineTo(128, 96);
    x.lineTo(0, 96);
    x.fill();
    x.fillStyle = p[2];
    x.beginPath();
    x.arc(30 + r() * 70, 25, 8, 0, Math.PI * 2);
    x.fill();
  } else {
    x.fillStyle = p[0];
    x.beginPath();
    x.ellipse(64, 40, 16, 20, 0, 0, Math.PI * 2);
    x.fill();
    x.fillRect(38, 58, 52, 40);
    x.fillStyle = p[2];
    x.globalAlpha = 0.35;
    x.beginPath();
    x.ellipse(60, 36, 7, 9, 0, 0, Math.PI * 2);
    x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ───────────── mobilier ─────────────

function buildFurniture(f: FurnitureDef, fires: THREE.Object3D[], pendulums: THREE.Object3D[], waters: THREE.Mesh[]): THREE.Group {
  const { g, W, D } = oriented(f);
  const wood = MAT.wood('#5c3a22');
  const dark = MAT.wood('#2e1d12');
  const back = -D / 2;
  switch (f.kind) {
    case 'counter': {
      box(g, [W, 0.86, D * 0.92], MAT.paint('#e8e2d4', 0.5), [0, 0.43, back + D * 0.46]);
      const n = Math.max(1, Math.round(W / 0.6));
      for (let i = 0; i < n; i++) {
        const x = -W / 2 + W / n / 2 + i * (W / n);
        box(g, [W / n - 0.06, 0.7, 0.02], MAT.paint('#ded7c6', 0.4), [x, 0.43, back + D * 0.93]);
        box(g, [0.12, 0.02, 0.03], MAT.metal('#b9a27a', 0.25), [x, 0.72, back + D * 0.95]);
      }
      box(g, [W + 0.04, 0.05, D * 0.98], MAT.lacquer('#2a2826'), [0, 0.885, back + D * 0.49]);
      box(g, [0.6, 0.012, 0.5], MAT.lacquer('#0b0b0c'), [W / 2 - 0.45, 0.917, back + D * 0.45]);
      for (const [dx, dz] of [[-0.15, -0.12], [0.15, -0.12], [-0.15, 0.12], [0.15, 0.12]]) cyl(g, 0.08, 0.08, 0.004, MAT.metal('#3a3a3c', 0.5), [W / 2 - 0.45 + dx, 0.925, back + D * 0.45 + dz]);
      box(g, [W, 0.7, 0.35], MAT.paint('#e8e2d4', 0.5), [0, 1.85, back + 0.18]);
      break;
    }
    case 'sink': {
      if (f.roomId === 'bathroom') {
        cyl(g, 0.12, 0.16, 0.8, MAT.porcelain(), [0, 0.4, back + 0.3]);
        box(g, [0.6, 0.12, 0.45], MAT.porcelain(), [0, 0.86, back + 0.26], [0, 0, 0], 0.04);
        box(g, [0.46, 0.04, 0.3], MAT.paint('#a8b4bc', 0.1), [0, 0.91, back + 0.27]);
        cyl(g, 0.012, 0.012, 0.18, MAT.metal(), [0, 1.0, back + 0.08]);
        box(g, [0.6, 0.8, 0.015], MAT.wood('#3a2a1c'), [0, 1.55, back + 0.008]);
        box(g, [0.55, 0.75, 0.01], MAT.metal('#d8dde2', 0.04), [0, 1.55, back + 0.02]);
      } else {
        box(g, [W, 0.86, D * 0.92], MAT.paint('#e8e2d4', 0.5), [0, 0.43, back + D * 0.46]);
        box(g, [W + 0.04, 0.05, D * 0.98], MAT.lacquer('#2a2826'), [0, 0.885, back + D * 0.49]);
        box(g, [W * 0.55, 0.06, D * 0.5], MAT.metal('#9aa3aa', 0.15), [0, 0.89, back + D * 0.45]);
        cyl(g, 0.015, 0.015, 0.3, MAT.metal(), [0, 1.05, back + 0.1]);
        box(g, [0.02, 0.02, 0.18], MAT.metal(), [0, 1.2, back + 0.18]);
      }
      break;
    }
    case 'table': {
      const low = f.roomId === 'living';
      const isConsole = f.roomId === 'hall';
      const h = low ? 0.42 : isConsole ? 0.82 : 0.76;
      const tw = isConsole ? W : W * 0.7;
      const td = isConsole ? D * 0.45 : D * (low ? 0.8 : 0.6);
      const tz = isConsole ? back + td / 2 : 0;
      box(g, [tw, 0.05, td], low ? MAT.lacquer('#2a1a10') : wood, [0, h, tz]);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, 0.025, 0.02, h, low ? MAT.metal('#b8913e', 0.3) : dark, [sx * (tw / 2 - 0.07), h / 2, tz + sz * (td / 2 - 0.07)]);
      if (isConsole) {
        box(g, [tw * 0.85, 1.08, 0.025], MAT.metal('#b8913e', 0.35), [0, 1.55, back + 0.008]);
        box(g, [tw * 0.8, 1.0, 0.01], MAT.metal('#d8dde2', 0.04), [0, 1.55, back + 0.025]);
        cyl(g, 0.06, 0.08, 0.3, MAT.porcelain(), [tw * 0.3, h + 0.17, tz]);
      } else if (!low) {
        for (const sz of [-1, 1])
          for (const sx of [-0.25, 0.25]) {
            const c = new THREE.Group();
            c.position.set(sx * tw, 0, sz * (td / 2 + 0.22));
            c.rotation.y = sz > 0 ? Math.PI : 0;
            box(c, [0.42, 0.05, 0.42], wood, [0, 0.46, 0]);
            box(c, [0.42, 0.5, 0.04], wood, [0, 0.74, -0.19]);
            for (const lx of [-0.18, 0.18]) for (const lz of [-0.18, 0.18]) box(c, [0.035, 0.46, 0.035], dark, [lx, 0.23, lz]);
            g.add(c);
          }
        box(g, [tw * 0.9, 0.006, td * 0.5], MAT.fabric('#e9e2d0'), [0, h + 0.028, 0]);
      } else {
        box(g, [0.3, 0.06, 0.22], MAT.paint('#6a2a2a'), [0.15, h + 0.055, 0]);
      }
      break;
    }
    case 'sofa': {
      const fab = MAT.fabric('#5b1f2a');
      box(g, [W, 0.25, D], fab, [0, 0.27, 0], [0, 0, 0], 0.05);
      const n = Math.max(2, Math.round(W / 0.9));
      for (let i = 0; i < n; i++) {
        const cw = (W - 0.36) / n;
        const x = -W / 2 + 0.18 + cw / 2 + i * cw;
        box(g, [cw - 0.02, 0.14, D * 0.7], fab, [x, 0.46, D * 0.08], [0, 0, 0], 0.05);
        box(g, [cw - 0.02, 0.45, 0.18], fab, [x, 0.72, back + 0.14], [-0.12, 0, 0], 0.06);
      }
      for (const s of [-1, 1]) box(g, [0.18, 0.62, D], fab, [s * (W / 2 - 0.09), 0.43, 0], [0, 0, 0], 0.06);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, 0.025, 0.02, 0.14, MAT.metal('#b8913e', 0.3), [sx * (W / 2 - 0.1), 0.07, sz * (D / 2 - 0.1)]);
      break;
    }
    case 'piano': {
      const lac = MAT.lacquer('#0a0a0b');
      box(g, [W * 0.92, 0.3, D * 0.85], lac, [0, 0.82, 0], [0, 0, 0], 0.08);
      box(g, [W * 0.9, 0.02, D * 0.8], lac, [0, 1.2, -0.25], [0.6, 0, 0]);
      cyl(g, 0.008, 0.008, 0.65, MAT.metal('#b8913e'), [W * 0.2, 1.05, 0.05], [0.3, 0, 0]);
      box(g, [W * 0.75, 0.04, 0.16], MAT.porcelain(), [0, 0.98, D * 0.43]);
      for (let i = 0; i < 18; i++) box(g, [0.018, 0.03, 0.09], lac, [-W * 0.36 + i * (W * 0.042), 1.0, D * 0.41]);
      for (const [sx, sz] of [[-0.4, -0.3], [0.4, -0.3], [0, 0.35]]) cyl(g, 0.05, 0.04, 0.68, lac, [sx * W, 0.34, sz * D]);
      box(g, [0.7, 0.06, 0.32], lac, [0, 0.48, D / 2 + 0.1], [0, 0, 0], 0.02);
      break;
    }
    case 'shelf': {
      const tall = 2.1;
      const frame = MAT.wood('#3a2416');
      box(g, [W, tall, 0.05], frame, [0, tall / 2, back + 0.025]);
      for (const s of [-1, 1]) box(g, [0.05, tall, D * 0.9], frame, [s * (W / 2 - 0.025), tall / 2, back + D * 0.45]);
      const colors = ['#6a2424', '#24406a', '#2f4a28', '#7a5a22', '#3b2a4a', '#6a5a4a', '#1f1f1f'];
      for (let r = 0; r < 5; r++) {
        const y = 0.08 + r * 0.42;
        box(g, [W - 0.1, 0.03, D * 0.88], frame, [0, y, back + D * 0.45]);
        if (r === 4) continue;
        let x = -W / 2 + 0.08;
        let i = r * 7;
        while (x < W / 2 - 0.12) {
          const bw = 0.03 + ((i * 37) % 5) * 0.008;
          const bh = 0.24 + ((i * 13) % 6) * 0.018;
          box(g, [bw, bh, D * 0.6], MAT.paint(colors[i % colors.length], 0.7), [x + bw / 2, y + 0.015 + bh / 2, back + D * 0.4], [0, 0, (i * 7) % 9 === 0 ? 0.12 : 0]);
          x += bw + 0.004;
          i++;
        }
      }
      break;
    }
    case 'desk': {
      const top = MAT.wood('#3a2416');
      const dd = Math.min(D, 0.75);
      box(g, [W, 0.05, dd], top, [0, 0.76, back + dd / 2]);
      for (const s of [-1, 1]) box(g, [Math.min(0.45, W / 3), 0.72, dd - 0.03], top, [s * (W / 2 - Math.min(0.45, W / 3) / 2 - 0.02), 0.37, back + dd / 2]);
      if (f.roomId === 'office') {
        box(g, [0.5, 0.01, 0.35], MAT.paint('#2a4a2a', 0.8), [0, 0.79, back + 0.4]);
        cyl(g, 0.06, 0.08, 0.03, MAT.metal('#b8913e'), [W / 2 - 0.3, 0.8, back + 0.25]);
        cyl(g, 0.012, 0.012, 0.3, MAT.metal('#b8913e'), [W / 2 - 0.3, 0.95, back + 0.25]);
        box(g, [0.32, 0.08, 0.14], MAT.glow('#2f8a4a', 0.6), [W / 2 - 0.3, 1.12, back + 0.3]);
        box(g, [0.21, 0.004, 0.3], MAT.paint('#efe8d8'), [-0.2, 0.788, back + 0.42], [0, 0.2, 0]);
      } else {
        box(g, [0.5, 0.6, 0.02], MAT.metal('#d8dde2', 0.04), [0, 1.2, back + 0.02]);
        cyl(g, 0.03, 0.04, 0.1, MAT.porcelain(), [0.25, 0.83, back + 0.3]);
      }
      break;
    }
    case 'terminal': {
      box(g, [W, 0.74, D], MAT.wood('#2e1d12'), [0, 0.37, 0]);
      for (const dx of [-0.17, 0.17]) {
        box(g, [0.3, 0.26, 0.28], MAT.paint('#2a2a2a', 0.5), [dx, 0.9, back + 0.2], [0, 0, 0], 0.03);
        const screen = box(g, [0.24, 0.18, 0.01], new THREE.MeshStandardMaterial({ color: '#0d2b1e', emissive: '#3aa86a', emissiveIntensity: 0.9 }), [dx, 0.91, back + 0.345]);
        screen.name = 'screen';
      }
      break;
    }
    case 'bath': {
      box(g, [W, 0.6, D], MAT.porcelain(), [0, 0.38, 0], [0, 0, 0], 0.2);
      box(g, [W - 0.15, 0.03, D - 0.15], MAT.water(), [0, 0.62, 0]);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) sphere(g, 0.05, MAT.metal('#b8913e'), [sx * (W / 2 - 0.15), 0.05, sz * (D / 2 - 0.12)]);
      cyl(g, 0.015, 0.015, 0.4, MAT.metal(), [0, 0.85, back + 0.06]);
      break;
    }
    case 'bed': {
      const double = W > 2.2;
      const bw = double ? Math.min(W - 0.9, 1.9) : Math.min(W, 1.5);
      const bl = Math.min(D, 2.1);
      const head = MAT.fabric(f.roomId === 'bedroom2' ? '#4a1a24' : '#24365e');
      box(g, [bw, 0.3, bl], MAT.wood('#3a2416'), [0, 0.2, back + bl / 2]);
      box(g, [bw - 0.06, 0.24, bl - 0.08], MAT.paint('#f2eee6', 0.9), [0, 0.46, back + bl / 2 + 0.02], [0, 0, 0], 0.08);
      box(g, [bw, 0.08, bl * 0.62], MAT.fabric(f.roomId === 'bedroom2' ? '#7a2434' : '#2f4a7a'), [0, 0.6, back + bl * 0.66], [0, 0, 0], 0.04);
      for (const s of double ? [-1, 1] : [0]) box(g, [double ? bw * 0.4 : bw * 0.7, 0.14, 0.38], MAT.paint('#ffffff', 0.9), [s * bw * 0.23, 0.66, back + 0.32], [0.25, 0, 0], 0.07);
      box(g, [bw + 0.1, 1.1, 0.1], head, [0, 0.75, back + 0.05], [0, 0, 0], 0.05);
      if (double)
        for (const s of [-1, 1]) {
          const nx = s * (bw / 2 + 0.27);
          box(g, [0.45, 0.55, 0.4], MAT.wood('#3a2416'), [nx, 0.275, back + 0.25]);
          cyl(g, 0.06, 0.08, 0.18, MAT.porcelain(), [nx, 0.64, back + 0.25]);
          const shade = cyl(g, 0.15, 0.1, 0.18, MAT.fabric('#e8dcc0'), [nx, 0.82, back + 0.25], [0, 0, 0], 16);
          shade.castShadow = false;
        }
      break;
    }
    case 'wardrobe': {
      box(g, [W, 2.15, D * 0.9], MAT.wood('#3a2416'), [0, 1.075, back + D * 0.45]);
      box(g, [W + 0.06, 0.08, D * 0.95], MAT.wood('#2e1d12'), [0, 2.19, back + D * 0.47]);
      for (const s of [-1, 1]) {
        box(g, [W / 2 - 0.08, 1.85, 0.02], MAT.wood('#4a2e1c'), [s * W * 0.25, 1.05, back + D * 0.9 + 0.01]);
        cyl(g, 0.012, 0.012, 0.18, MAT.metal('#b8913e'), [s * 0.06, 1.1, back + D * 0.9 + 0.04]);
      }
      break;
    }
    case 'clock': {
      const caseM = MAT.wood('#3a2416');
      box(g, [0.5, 0.3, 0.38], caseM, [0, 0.15, back + 0.2]);
      box(g, [0.38, 1.35, 0.3], caseM, [0, 0.98, back + 0.2]);
      box(g, [0.5, 0.5, 0.38], caseM, [0, 1.9, back + 0.2]);
      cyl(g, 0.17, 0.17, 0.02, MAT.paint('#efe6cc', 0.4), [0, 1.9, back + 0.4], [Math.PI / 2, 0, 0]);
      box(g, [0.24, 0.9, 0.01], MAT.glass(), [0, 1.0, back + 0.36]);
      const pend = new THREE.Group();
      pend.position.set(0, 1.4, back + 0.32);
      cyl(pend, 0.006, 0.006, 0.6, MAT.metal('#b8913e'), [0, -0.3, 0]);
      cyl(pend, 0.07, 0.07, 0.02, MAT.metal('#d4b06a', 0.2), [0, -0.62, 0], [Math.PI / 2, 0, 0]);
      g.add(pend);
      pendulums.push(pend);
      box(g, [0.56, 0.1, 0.42], caseM, [0, 2.2, back + 0.2]);
      break;
    }
    case 'fireplace': {
      const stone = MAT.paint('#8a8178', 0.85);
      box(g, [W + 0.9, 1.15, 0.45], stone, [0, 0.575, back + 0.2]);
      box(g, [W + 1.1, 0.08, 0.55], MAT.marble(1, 1), [0, 1.19, back + 0.25]);
      box(g, [Math.max(0.6, W * 0.75), 0.75, 0.3], MAT.paint('#0b0a09', 0.9), [0, 0.4, back + 0.3]);
      for (const dx of [-0.12, 0.12]) cyl(g, 0.05, 0.05, 0.45, MAT.wood('#3a2416'), [dx, 0.12, back + 0.3], [0, 0, Math.PI / 2 + dx]);
      const fire = box(g, [0.4, 0.3, 0.12], new THREE.MeshStandardMaterial({ color: '#ff7a2a', emissive: '#ff6a1a', emissiveIntensity: 2.4 }), [0, 0.3, back + 0.32]);
      fire.castShadow = false;
      fires.push(fire);
      // source de lumière (allumée par le réservoir de lampes de la villa quand on est proche)
      const light = new THREE.Object3D();
      light.position.set(0, 0.6, back + 0.8);
      light.userData.light = { color: '#ff8a3a', intensity: 6, distance: 7, decay: 1.6, fire: true } satisfies LightSourceDef;
      g.add(light);
      box(g, [1.0, 0.75, 0.04], MAT.metal('#b8913e', 0.35), [0, 1.85, back + 0.02]);
      const canvas = new THREE.Mesh(new THREE.PlaneGeometry(0.88, 0.63), new THREE.MeshStandardMaterial({ map: paintingTexture(), roughness: 0.8 }));
      canvas.position.set(0, 1.85, back + 0.045);
      g.add(canvas);
      break;
    }
    case 'crate': {
      box(g, [0.75, 0.6, 0.75], MAT.wood('#7a5a36'), [-W * 0.18, 0.3, -D * 0.15]);
      box(g, [0.6, 0.5, 0.6], MAT.wood('#6b4e2f'), [W * 0.2, 0.25, D * 0.2], [0, 0.4, 0]);
      box(g, [0.55, 0.45, 0.55], MAT.wood('#806040'), [-W * 0.12, 0.83, -D * 0.12], [0, -0.2, 0]);
      break;
    }
    case 'stairs': {
      // Escalier vers l'étage : monte du nord (première marche) au sud (palier), praticable.
      g.rotation.y = 0;
      const SW = f.w;
      const SD = f.h;
      const steps = 20;
      const run = SD / steps;
      const tread = MAT.wood('#4a2e1c');
      const riser = MAT.paint('#e8e2d4', 0.6);
      for (let i = 0; i < steps; i++) {
        const h = ((i + 1) / steps) * LEVEL_HEIGHT;
        const z = -SD / 2 + run * (i + 0.5);
        box(g, [SW - 0.1, 0.05, run + 0.03], tread, [0, h - 0.025, z]);
        box(g, [SW - 0.1, LEVEL_HEIGHT / steps, 0.02], riser, [0, h - LEVEL_HEIGHT / steps / 2, z - run / 2]);
      }
      // limons pleins de chaque côté + rampes
      const len = Math.hypot(SD, LEVEL_HEIGHT);
      const ang = -Math.atan2(LEVEL_HEIGHT, SD);
      const rail = MAT.wood('#2e1d12');
      for (const sx of [-1, 1]) {
        box(g, [0.08, 0.35, len], MAT.paint('#ece6da', 0.5), [sx * (SW / 2 - 0.04), LEVEL_HEIGHT / 2 - 0.1, 0], [ang, 0, 0]);
        box(g, [0.07, 0.07, len], rail, [sx * (SW / 2 - 0.04), LEVEL_HEIGHT / 2 + 0.9, 0], [ang, 0, 0]);
        for (let i = 1; i < steps; i += 2) {
          const h = ((i + 1) / steps) * LEVEL_HEIGHT;
          cyl(g, 0.018, 0.018, 0.9, MAT.paint('#f2eee6', 0.4), [sx * (SW / 2 - 0.04), h + 0.45, -SD / 2 + run * (i + 0.5)], [0, 0, 0], 8);
        }
        cyl(g, 0.06, 0.06, 1.15, rail, [sx * (SW / 2 - 0.04), 0.58, -SD / 2 + 0.06]);
      }
      break;
    }
    case 'fountain': {
      g.rotation.y = 0;
      const stone = MAT.paint('#8d9196', 0.8);
      cyl(g, f.w / 2, f.w / 2 + 0.05, 0.5, stone, [0, 0.25, 0], [0, 0, 0], 32);
      waters.push(cyl(g, f.w / 2 - 0.1, f.w / 2 - 0.1, 0.02, MAT.water(), [0, 0.46, 0], [0, 0, 0], 32));
      cyl(g, 0.12, 0.16, 1.1, stone, [0, 0.8, 0]);
      cyl(g, 0.45, 0.3, 0.15, stone, [0, 1.3, 0], [0, 0, 0], 24);
      cyl(g, 0.05, 0.08, 0.4, stone, [0, 1.55, 0]);
      break;
    }
    case 'hedge': {
      g.rotation.y = 0;
      const leaf = new THREE.MeshStandardMaterial({ color: '#4a6a3e', map: fabricTex('#3a5a32'), roughness: 1 });
      box(g, [f.w - 0.05, 1.3, f.h - 0.05], leaf, [0, 0.65, 0], [0, 0, 0], 0.18);
      break;
    }
    case 'tree': {
      g.rotation.y = 0;
      cyl(g, 0.16, 0.26, 2.6, MAT.paint('#3b2a1c', 1), [0, 1.3, 0]);
      const leaves = new THREE.MeshStandardMaterial({ color: '#1f3a22', roughness: 1, flatShading: true });
      for (const [x, y, z, r] of [[0, 3.2, 0, 1.5], [0.8, 2.8, 0.4, 1.0], [-0.7, 2.9, -0.3, 1.1], [0.2, 3.9, -0.4, 1.0], [-0.3, 2.6, 0.8, 0.9]] as const) {
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), leaves);
        m.position.set(x, y, z);
        m.castShadow = true;
        g.add(m);
      }
      break;
    }
    case 'car': {
      g.rotation.y = 0;
      const paint = MAT.lacquer('#4a1018');
      const L = Math.max(f.w, f.h) - 0.2;
      const Wd = Math.min(f.w, f.h) - 0.1;
      const car = new THREE.Group();
      if (f.h > f.w) car.rotation.y = Math.PI / 2;
      g.add(car);
      box(car, [L, 0.45, Wd], paint, [0, 0.5, 0], [0, 0, 0], 0.15);
      box(car, [L * 0.48, 0.42, Wd * 0.88], paint, [-L * 0.08, 0.92, 0], [0, 0, 0], 0.12);
      box(car, [L * 0.44, 0.34, Wd * 0.9], MAT.glass(), [-L * 0.08, 0.93, 0], [0, 0, 0], 0.1);
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) {
          cyl(car, 0.33, 0.33, 0.22, MAT.paint('#111', 0.7), [sx * L * 0.32, 0.33, sz * (Wd / 2 - 0.05)], [Math.PI / 2, 0, 0]);
          cyl(car, 0.16, 0.16, 0.24, MAT.metal('#d8d8dc', 0.2), [sx * L * 0.32, 0.33, sz * (Wd / 2 - 0.05)], [Math.PI / 2, 0, 0]);
        }
      for (const sz of [-0.3, 0.3]) sphere(car, 0.09, MAT.glow('#fff4d8', 0.3), [L / 2 - 0.02, 0.62, sz * Wd]);
      box(car, [0.05, 0.12, Wd * 0.7], MAT.metal('#d8d8dc', 0.15), [L / 2 + 0.01, 0.45, 0]);
      break;
    }
    default:
      // ameublement et décoration (furnishing3d.ts)
      buildFurnishing(f, g, W, D);
  }
  g.userData.furnitureId = f.id;
  return g;
}

// ───────────── lampes ─────────────

function lampMesh(kind: RoomStyle['lamp'], y: number, bulbMats: Set<THREE.MeshStandardMaterial>): THREE.Group {
  const g = new THREE.Group();
  const brass = MAT.metal('#b8913e', 0.3);
  const bulb = new THREE.MeshStandardMaterial({ color: '#fff2d6', emissive: '#ffd59a', emissiveIntensity: 3 });
  bulbMats.add(bulb);
  if (kind === 'chandelier') {
    cyl(g, 0.01, 0.01, 0.5, brass, [0, y - 0.25, 0]);
    cyl(g, 0.35, 0.35, 0.03, brass, [0, y - 0.55, 0], [0, 0, 0], 24);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      cyl(g, 0.02, 0.02, 0.1, MAT.porcelain(), [Math.cos(a) * 0.35, y - 0.48, Math.sin(a) * 0.35]);
      sphere(g, 0.035, bulb, [Math.cos(a) * 0.35, y - 0.4, Math.sin(a) * 0.35], [1, 1.4, 1]);
    }
    sphere(g, 0.08, MAT.glass(), [0, y - 0.68, 0]);
  } else if (kind === 'pendant') {
    cyl(g, 0.006, 0.006, 0.6, MAT.paint('#111'), [0, y - 0.3, 0]);
    const shadeMat = new THREE.MeshStandardMaterial({ color: '#efe2c4', side: THREE.DoubleSide, emissive: '#ffcf88', emissiveIntensity: 0.5 });
    bulbMats.add(shadeMat);
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.28, 0.25, 24, 1, true), shadeMat);
    shade.position.set(0, y - 0.7, 0);
    g.add(shade);
    sphere(g, 0.05, bulb, [0, y - 0.75, 0]);
  } else {
    cyl(g, 0.006, 0.006, 0.3, MAT.paint('#111'), [0, y - 0.15, 0]);
    sphere(g, 0.06, bulb, [0, y - 0.35, 0], [1, 1.3, 1]);
  }
  g.traverse((o) => (o.castShadow = false));
  return g;
}

export interface Villa3D {
  group: THREE.Group;
  /** surfaces bloquant la caméra */
  colliders: THREE.Object3D[];
  setBlackout(on: boolean): void;
  setUnlocked(ids: string[]): void;
  update(t: number): void;
  /** les lampes réelles sont attribuées aux sources les plus proches de ce point (joueur ou caméra) */
  focus(x: number, z: number, roomId?: string, y?: number): void;
  /** ombres de la lampe de la pièce courante (désactivables pour les machines modestes) */
  setShadows(on: boolean): void;
  /** vitres éclairées vues de l'extérieur (vue avec toit) : matériau propre à chacune */
  exteriorWindows: { mesh: THREE.Mesh; x: number; z: number; ry: number }[];
}

const ROOM_LIGHT = 14;
/** Nombre de vraies lampes (sans ombre) actives en même temps : le coût d'éclairage reste constant. */
const LIGHT_POOL = 4;

interface LightSourceDef {
  color: string;
  intensity: number;
  distance: number;
  decay: number;
  fire?: boolean;
}
interface LightSource extends LightSourceDef {
  pos: THREE.Vector3;
  room?: string;
  shadowable?: boolean;
}

/**
 * Fusionne tout le décor immobile par matériau (et par réglage d'ombre) : quelques dizaines d'appels
 * de dessin au lieu de plusieurs centaines. Les objets de `keep` (collisions, portes, balanciers,
 * vitres animées) restent indépendants. Les animations portées par les matériaux (feu, eau, écrans,
 * ampoules) continuent de fonctionner puisque le matériau est partagé.
 */
function mergeStatic(root: THREE.Object3D, keep: Set<THREE.Object3D>) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map<string, { mat: THREE.Material; cast: boolean; receive: boolean; geos: THREE.BufferGeometry[]; meshes: THREE.Mesh[] }>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || keep.has(m) || (m as THREE.InstancedMesh).isInstancedMesh || Array.isArray(m.material)) return;
    const g = m.geometry;
    if (!g.attributes.position || !g.attributes.normal || !g.attributes.uv || g.morphAttributes.position) return;
    const key = `${m.material.uuid}|${m.castShadow}|${m.receiveShadow}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { mat: m.material, cast: m.castShadow, receive: m.receiveShadow, geos: [], meshes: [] }));
    const local = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld);
    const gg = (g.index ? g.toNonIndexed() : g.clone()).applyMatrix4(local);
    for (const name of Object.keys(gg.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') gg.deleteAttribute(name);
    b.geos.push(gg);
    b.meshes.push(m);
  });
  for (const b of buckets.values()) {
    if (b.meshes.length < 2) continue;
    const merged = mergeGeometries(b.geos);
    if (!merged) continue;
    for (const m of b.meshes) m.removeFromParent();
    const mesh = new THREE.Mesh(merged, b.mat);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = b.receive;
    root.add(mesh);
  }
}

/** Axe de l'allée d'accès (cinématique) : aucun arbre dans ce couloir. */
export const DRIVEWAY_X = 21;

export function buildVilla(opts: { roof?: boolean; driveway?: boolean } = {}): Villa3D {
  const group = new THREE.Group();
  const colliders: THREE.Object3D[] = [];
  const inGame = !opts.roof;

  // ── Terrain autour de la propriété + forêt sombre ──
  // (dans un sous-groupe : le terrain ne fait partie d'aucun niveau)
  const terrain = new THREE.Group();
  terrain.userData.placed = true;
  group.add(terrain);
  const lawn = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), MAT.grass(220, 220));
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.set(WORLD_W / 2, -0.03, WORLD_H / 2);
  lawn.receiveShadow = true;
  terrain.add(lawn);
  const treeMat = new THREE.MeshStandardMaterial({ color: '#13241a', roughness: 1, flatShading: true });
  const trunkMat = MAT.paint('#2a1e14', 1);
  for (let i = 0; i < 70; i++) {
    const a = (i / 70) * Math.PI * 2;
    const r = 40 + ((i * 37) % 17);
    const x = WORLD_W / 2 + Math.cos(a) * r;
    const z = WORLD_H / 2 + Math.sin(a) * r * 0.8;
    const s = 0.8 + ((i * 13) % 7) / 6;
    if (opts.driveway && Math.abs(x - DRIVEWAY_X) < 6 && z > WORLD_H) continue;
    cyl(terrain, 0.25 * s, 0.35 * s, 3 * s, trunkMat, [x, 1.5 * s, z]);
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(2.4 * s, 1), treeMat);
    crown.position.set(x, 4.2 * s, z);
    terrain.add(crown);
  }

  // ── Sols, tapis, seuils ──
  for (const r of ROOMS) {
    const st = STYLE[r.id];
    const floorMat = st ? st.floor(r.rect.w, r.rect.h) : MAT.concrete(r.rect.w, r.rect.h);
    // sol découpé par tuiles quand la pièce contient une trémie, sinon un seul plan
    const holed = [...voidTiles].some((k) => {
      const [x, y] = k.split(',').map(Number);
      return x >= r.rect.x && x < r.rect.x + r.rect.w && y >= r.rect.y && y < r.rect.y + r.rect.h;
    });
    const f = holed ? new THREE.Mesh(tiledPlane(r, isVoid, true)!, floorMat) : new THREE.Mesh(new THREE.PlaneGeometry(r.rect.w, r.rect.h), floorMat);
    if (holed) f.userData.level = r.level ?? 0;
    else {
      f.rotation.x = -Math.PI / 2;
      f.position.set(r.rect.x + r.rect.w / 2, 0, r.rect.y + r.rect.h / 2);
    }
    f.receiveShadow = true;
    group.add(f);
    if (st?.rug) {
      const rug = new THREE.Mesh(new THREE.PlaneGeometry(st.rug.w, st.rug.h), MAT.rug(st.rug.base, st.rug.border));
      rug.rotation.x = -Math.PI / 2;
      rug.position.set(r.rect.x + r.rect.w / 2 + (st.rug.dx ?? 0), 0.006, r.rect.y + r.rect.h / 2 + (st.rug.dz ?? 0));
      rug.receiveShadow = true;
      group.add(rug);
    }
  }
  for (const d of DOORS) {
    const sill = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), MAT.marble(1, 1));
    sill.rotation.x = -Math.PI / 2;
    sill.position.set(d.x + 0.5, 0.004, d.y + 0.5);
    sill.receiveShadow = true;
    group.add(sill);
  }

  // ── Murs : noyaux (collision caméra) + faces habillées par pièce ──
  const wallTiles: { x: number; y: number; h: number }[] = [];
  const heightAt = new Map<string, number>();
  // ouverture du muret d'enceinte face à l'allée d'accès (cinématique d'arrivée)
  const isOpening = (x: number, y: number) => !!opts.driveway && y === WORLD_H - 1 && Math.abs(x + 0.5 - DRIVEWAY_X) < 2.5;
  // Un mur extérieur de la maison monte jusqu'au toit (rez-de-chaussée + étage)
  const facadeH = WALL_H + LEVEL_HEIGHT;
  const upstairsAbove = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (roomAtTile(x + dx + LEVEL_OFFSET_X, y + dy)) return true;
    return false;
  };
  for (let y = -1; y <= WORLD_H; y++)
    for (let x = -1; x <= GRID_W; x++) {
      if (roomIdx(x, y) || isOpening(x, y)) continue;
      let indoor = false;
      let outdoor = false;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const r = roomAtTile(x + dx, y + dy);
          if (!r) continue;
          if (r.outdoor) outdoor = true;
          else indoor = true;
        }
      if (!indoor && !outdoor) continue;
      const lvl = levelOf(x);
      // au rez-de-chaussée, le mur plein remplit aussi l'épaisseur du plancher ; la façade monte d'un étage
      const h = !indoor ? 1.1 : lvl ? WALL_H : outdoor && upstairsAbove(x, y) ? facadeH : LEVEL_HEIGHT;
      wallTiles.push({ x, y, h });
      heightAt.set(`${x},${y}`, indoor ? (outdoor && !lvl && upstairsAbove(x, y) ? facadeH : WALL_H) : 1.1);
    }
  const tmp = new THREE.Object3D();
  for (const lvl of [0, 1] as const) {
    const tiles = wallTiles.filter((w) => levelOf(w.x) === lvl);
    const core = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), MAT.paint('#2a2622', 0.9), tiles.length);
    tiles.forEach((w, i) => {
      tmp.position.set(w.x + 0.5, w.h / 2, w.y + 0.5);
      tmp.scale.set(0.998, w.h, 0.998);
      tmp.updateMatrix();
      core.setMatrixAt(i, tmp.matrix);
    });
    core.castShadow = true;
    core.receiveShadow = true;
    core.userData.level = lvl;
    group.add(core);
    colliders.push(core);
  }

  const faces = new Map<string, { m: THREE.Material; lvl: 0 | 1; geos: THREE.BufferGeometry[] }>();
  const trims: [THREE.BufferGeometry[], THREE.BufferGeometry[]] = [[], []];
  const crowns: [THREE.BufferGeometry[], THREE.BufferGeometry[]] = [[], []];
  const windowSpots: { x: number; z: number; ry: number; outdoor: boolean; lvl: 0 | 1; y?: number }[] = [];
  // [dx, dy, rotation de la face pour qu'elle regarde la pièce]
  const DIRS: [number, number, number][] = [[0, -1, 0], [0, 1, Math.PI], [-1, 0, Math.PI / 2], [1, 0, -Math.PI / 2]];
  for (let y = 0; y < WORLD_H; y++)
    for (let x = 0; x < GRID_W; x++) {
      const room = roomAtTile(x, y);
      if (!room || isDoor(x, y)) continue;
      const lvl = levelOf(x);
      for (const [dx, dy, ry] of DIRS) {
        const wx = x + dx;
        const wy = y + dy;
        if (roomIdx(wx, wy) || isOpening(wx, wy)) continue;
        // côté trémie : pas de mur, la rambarde suffit
        if (isVoid(wx, wy)) continue;
        // à l'intérieur, le papier peint s'arrête au plafond ; dehors, la façade monte jusqu'au toit
        const wallH = heightAt.get(`${wx},${wy}`) ?? WALL_H;
        const h = room.outdoor ? wallH : Math.min(wallH, WALL_H);
        const m = STYLE[room.id].wall();
        const plane = new THREE.PlaneGeometry(1, h);
        if (room.outdoor && h > 1.2) {
          // brique : le motif garde son échelle quelle que soit la hauteur du mur
          const uv = plane.getAttribute('uv') as THREE.BufferAttribute;
          for (let i = 0; i < uv.count; i++) uv.setY(i, (uv.getY(i) * h) / 1.1);
        }
        plane.rotateY(ry);
        plane.translate(x + 0.5 + dx * 0.499, h / 2, y + 0.5 + dy * 0.499);
        const key = `${lvl}|${m.uuid}`;
        if (!faces.has(key)) faces.set(key, { m, lvl, geos: [] });
        faces.get(key)!.geos.push(plane);
        if (!room.outdoor) {
          const base = new THREE.BoxGeometry(1, 0.12, 0.025);
          base.rotateY(ry);
          base.translate(x + 0.5 + dx * 0.487, 0.06, y + 0.5 + dy * 0.487);
          trims[lvl].push(base);
          const crown = new THREE.BoxGeometry(1, 0.09, 0.06);
          crown.rotateY(ry);
          crown.translate(x + 0.5 + dx * 0.47, WALL_H - 0.045, y + 0.5 + dy * 0.47);
          crowns[lvl].push(crown);
        }
        const rhythm = dy !== 0 ? wx % 3 === 1 : wy % 3 === 1;
        const across = roomAtTile(wx + dx, wy + dy);
        if (lvl === 0 && across && across.outdoor !== room.outdoor && h >= WALL_H && rhythm) {
          windowSpots.push({ x: x + 0.5 + dx * 0.5, z: y + 0.5 + dy * 0.5, ry, outdoor: !!room.outdoor, lvl: 0 });
          // façade : fenêtre de l'étage au-dessus (vue de l'extérieur)
          if (room.outdoor && h > WALL_H) windowSpots.push({ x: x + 0.5 + dx * 0.5, z: y + 0.5 + dy * 0.5, ry, outdoor: true, lvl: 0, y: LEVEL_HEIGHT });
        }
        // étage : fenêtres sur les murs extérieurs (vers le dehors du rez-de-chaussée)
        const below = roomAtTile(wx + dx - LEVEL_OFFSET_X, wy + dy);
        if (lvl === 1 && !across && (!below || below.outdoor) && rhythm) windowSpots.push({ x: x + 0.5 + dx * 0.5, z: y + 0.5 + dy * 0.5, ry, outdoor: false, lvl: 1 });
      }
    }
  for (const { m, lvl, geos } of faces.values()) {
    const mesh = new THREE.Mesh(mergeGeometries(geos), m);
    mesh.receiveShadow = true;
    mesh.userData.level = lvl;
    group.add(mesh);
  }
  for (const lvl of [0, 1] as const) {
    if (trims[lvl].length) {
      const t = new THREE.Mesh(mergeGeometries(trims[lvl]), MAT.paint('#ece6da', 0.5));
      t.receiveShadow = true;
      t.userData.level = lvl;
      group.add(t);
    }
    if (crowns[lvl].length) {
      const c = new THREE.Mesh(mergeGeometries(crowns[lvl]), MAT.paint('#f2ede2', 0.6));
      c.userData.level = lvl;
      group.add(c);
    }
  }

  // ── Fenêtres ──
  const glowMat = new THREE.MeshStandardMaterial({ color: '#2a1d10', emissive: '#ffb45c', emissiveIntensity: 1.1 });
  const frameMat = MAT.paint('#e9e4da', 0.5);
  const curtainColors = ['#5a1820', '#2f4a3c', '#24365e', '#6a5a3a'];
  const exteriorWindows: Villa3D['exteriorWindows'] = [];
  windowSpots.forEach((w, i) => {
    const g = new THREE.Group();
    g.position.set(w.x, w.y ?? 0, w.z);
    g.rotation.y = w.ry;
    g.userData.level = w.lvl;
    if (w.y) g.userData.placed = true;
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.2), w.outdoor ? (opts.roof ? glowMat.clone() : glowMat) : MAT.glass());
    if (w.outdoor && opts.roof) exteriorWindows.push({ mesh: pane, x: w.x, z: w.z, ry: w.ry });
    pane.position.set(0, 1.6, 0.003);
    g.add(pane);
    box(g, [0.92, 0.06, 0.06], frameMat, [0, 2.23, 0.02]);
    box(g, [0.95, 0.05, 0.14], frameMat, [0, 0.97, 0.05]);
    for (const s of [-1, 1]) box(g, [0.06, 1.3, 0.06], frameMat, [s * 0.43, 1.6, 0.02]);
    box(g, [0.035, 1.2, 0.03], frameMat, [0, 1.6, 0.02]);
    box(g, [0.8, 0.035, 0.03], frameMat, [0, 1.75, 0.02]);
    if (!w.outdoor) {
      const cur = MAT.fabric(curtainColors[i % curtainColors.length]);
      for (const s of [-1, 1]) box(g, [0.28, 2.2, 0.04], cur, [s * 0.58, 1.55, 0.08]);
      cyl(g, 0.015, 0.015, 1.6, MAT.metal('#b8913e', 0.3), [0, 2.62, 0.1], [0, 0, Math.PI / 2]);
    }
    group.add(g);
  });

  // ── Portes : chambranles, linteaux, battants verrouillés ──
  const lockedDoors = new Map<string, THREE.Object3D>();
  const casing = MAT.paint('#ece6da', 0.45);
  for (const d of DOORS) {
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(1, WALL_H - 2.3, 1), MAT.paint('#2a2622', 0.9));
    lintel.position.set(d.x + 0.5, 2.3 + (WALL_H - 2.3) / 2, d.y + 0.5);
    group.add(lintel);
    colliders.push(lintel);
    // passage nord-sud si les tuiles à gauche/droite sont des murs
    const northSouth = !roomIdx(d.x - 1, d.y) || !roomIdx(d.x + 1, d.y);
    const g = new THREE.Group();
    g.position.set(d.x + 0.5, 0, d.y + 0.5);
    if (!northSouth) g.rotation.y = Math.PI / 2;
    // chambranle seulement du côté mur
    if (!roomIdx(d.x - 1, d.y) || !roomIdx(d.x, d.y - 1)) box(g, [0.08, 2.32, 1.04], casing, [-0.47, 1.16, 0]);
    if (!roomIdx(d.x + 1, d.y) || !roomIdx(d.x, d.y + 1)) box(g, [0.08, 2.32, 1.04], casing, [0.47, 1.16, 0]);
    box(g, [1.02, 0.1, 1.04], casing, [0, 2.33, 0]);
    group.add(g);
    if (d.lockedBy) {
      const leaf = new THREE.Group();
      leaf.position.copy(g.position);
      leaf.rotation.copy(g.rotation);
      box(leaf, [0.88, 2.25, 0.06], MAT.wood('#3a1e10'), [0, 1.125, 0]);
      for (const y of [0.6, 1.6]) box(leaf, [0.6, 0.7, 0.07], MAT.wood('#5a3620'), [0, y, 0]);
      sphere(leaf, 0.035, MAT.metal('#b8913e', 0.25), [0.33, 1.05, 0.05]);
      group.add(leaf);
      colliders.push(leaf);
      lockedDoors.set(d.id, leaf);
    }
  }

  // ── Mobilier ──
  const fires: THREE.Object3D[] = [];
  const pendulums: THREE.Object3D[] = [];
  const waters: THREE.Mesh[] = [];
  const screens: THREE.Mesh[] = [];
  for (const f of allFurniture()) {
    const fg = buildFurniture(f, fires, pendulums, waters);
    fg.traverse((o) => o.name === 'screen' && screens.push(o as THREE.Mesh));
    group.add(fg);
  }

  // ── Tableaux aux murs ──
  const paintingSpots: [number, number, number][] = [[14, 6.02, 0], [27.5, 12.98, Math.PI], [17, 14.02, 0], [23, 14.02, 0], [34, 17.02, 0], [44, 17.02, 0], [34, 6.02, 0], [36, 14.02, 0], [40, 14.02, 0], [2.5, 21.98, Math.PI]];
  for (const [x, z, ry] of paintingSpots) {
    const g = new THREE.Group();
    g.position.set(x, 1.65, z);
    g.rotation.y = ry;
    box(g, [0.8, 0.62, 0.04], MAT.metal('#a8843e', 0.35), [0, 0, 0.02]);
    const c = new THREE.Mesh(new THREE.PlaneGeometry(0.68, 0.5), new THREE.MeshStandardMaterial({ map: paintingTexture(), roughness: 0.85 }));
    c.position.z = 0.045;
    g.add(c);
    group.add(g);
  }

  // ── Plafonds, lampes, lumières ──
  const sources: LightSource[] = [];
  const bulbMats = new Set<THREE.MeshStandardMaterial>();
  if (inGame)
    for (const r of ROOMS) {
      if (r.outdoor) continue;
      const holed = (r.level ?? 0) === 0 && [...voidTiles].some((k) => {
        const [vx, vy] = k.split(',').map(Number);
        const x = vx - LEVEL_OFFSET_X;
        return x >= r.rect.x && x < r.rect.x + r.rect.w && vy >= r.rect.y && vy < r.rect.y + r.rect.h;
      });
      const c = holed ? new THREE.Mesh(tiledPlane(r, underVoid, false)!, MAT.plaster()) : new THREE.Mesh(new THREE.PlaneGeometry(r.rect.w + 1, r.rect.h + 1), MAT.plaster());
      if (holed) {
        c.position.y = WALL_H;
        c.userData.level = 0;
        c.userData.placed = true;
      } else {
        c.rotation.x = Math.PI / 2;
        c.position.set(r.rect.x + r.rect.w / 2, WALL_H, r.rect.y + r.rect.h / 2);
      }
      c.receiveShadow = true;
      c.castShadow = true;
      group.add(c);
      colliders.push(c);
    }
  for (const r of ROOMS) {
    if (r.outdoor) continue;
    const st = STYLE[r.id];
    const cx = r.rect.x + r.rect.w / 2;
    const cz = r.rect.y + r.rect.h / 2;
    const lamp = lampMesh(st.lamp, WALL_H, bulbMats);
    lamp.position.set(cx, 0, cz);
    group.add(lamp);
    const lvlY = r.level ? LEVEL_HEIGHT : 0;
    const rx = r.level ? cx - LEVEL_OFFSET_X : cx;
    sources.push({ color: st.light, intensity: ROOM_LIGHT, distance: Math.max(r.rect.w, r.rect.h) * 1.5, decay: 1.5, pos: new THREE.Vector3(rx, lvlY + WALL_H - 0.85, cz), room: r.id, shadowable: true });
  }
  // Éclairage à coût constant : un petit réservoir de lampes est attribué aux sources les plus proches
  // du joueur (ou de la caméra) ; la lampe de la pièce courante est un projecteur vers le bas qui
  // porte les ombres (une seule carte d'ombre, au lieu des 6 faces d'une lampe ponctuelle).
  const pool = Array.from({ length: LIGHT_POOL }, () => {
    const l = new THREE.PointLight('#ffc98a', 0, 8, 1.5);
    group.add(l);
    return { light: l, src: null as LightSource | null };
  });
  const shadowLamp = new THREE.SpotLight('#ffc98a', 0, 14, 1.25, 0.6, 1.5);
  shadowLamp.castShadow = inGame;
  shadowLamp.shadow.mapSize.set(1024, 1024);
  shadowLamp.shadow.bias = -0.002;
  shadowLamp.shadow.camera.near = 0.2;
  group.add(shadowLamp, shadowLamp.target);
  let shadowSrc: LightSource | null = null;
  let focused: string | undefined;
  let blackout = false;
  const lastFocus = new THREE.Vector2(Infinity, Infinity);

  // ── Extérieur : lanternes, perron, bancs ──
  for (const [x, z] of [[18.6, 23.3], [23.4, 23.3], [4, 1.4], [26, 1.4], [38, 1.4]] as const) {
    cyl(group, 0.05, 0.07, 2.4, MAT.paint('#151515', 0.5), [x, 1.2, z]);
    box(group, [0.22, 0.32, 0.22], MAT.glow('#ffd29a', 2.2), [x, 2.5, z]);
    sources.push({ color: '#ffb66b', intensity: 10, distance: 9, decay: 1.6, pos: new THREE.Vector3(x, 2.45, z) });
  }
  box(group, [3, 0.12, 1.2], MAT.marble(2, 1), [21, 0.06, 23.6]);
  for (const x of [15, 26]) {
    const b = new THREE.Group();
    b.position.set(x, 0, 1.3);
    box(b, [1.4, 0.06, 0.4], MAT.wood('#5a3a22'), [0, 0.45, 0]);
    box(b, [1.4, 0.4, 0.05], MAT.wood('#5a3a22'), [0, 0.7, -0.18]);
    for (const s of [-0.6, 0.6]) box(b, [0.06, 0.45, 0.4], MAT.metal('#222', 0.6), [s, 0.22, 0]);
    group.add(b);
  }

  // ── Toit (vue extérieure du menu) ──
  if (opts.roof) {
    const houseZ0 = 5;
    const houseZ1 = 23;
    const depth = houseZ1 - houseZ0;
    const shape = new THREE.Shape();
    shape.moveTo(-depth / 2 - 0.6, 0);
    shape.lineTo(depth / 2 + 0.6, 0);
    shape.lineTo(0, 5.5);
    shape.closePath();
    const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: WORLD_W + 1.2, bevelEnabled: false }), MAT.paint('#26282e', 0.75));
    roof.rotation.y = Math.PI / 2;
    roof.position.set(-0.6, WALL_H + LEVEL_HEIGHT, houseZ0 + depth / 2);
    roof.userData.placed = true;
    roof.castShadow = true;
    group.add(roof);
    for (const x of [12.5, 35.5]) box(group, [1.2, 4, 1.2], MAT.brick(1, 2.6), [x, WALL_H + LEVEL_HEIGHT + 3.5, 9]).userData.placed = true;
  }

  // Étage : tout ce qui a été construit dans les colonnes de l'étage est replacé au-dessus du rez-de-chaussée
  for (const c of [...group.children]) {
    if (c.userData.placed) continue;
    const lvl = c.userData.level ?? (c.position.x >= LEVEL_OFFSET_X - 1 ? 1 : 0);
    if (lvl === 1) {
      c.position.x -= LEVEL_OFFSET_X;
      c.position.y += LEVEL_HEIGHT;
    }
  }
  // sources déclarées par le mobilier (cheminées…)
  group.updateMatrixWorld(true);
  const keep = new Set<THREE.Object3D>([...colliders, ...exteriorWindows.map((w) => w.mesh)]);
  for (const p of pendulums) p.traverse((o) => keep.add(o));
  mergeStatic(group, keep);
  group.traverse((o) => {
    const def = o.userData.light as LightSourceDef | undefined;
    if (!def) return;
    const pos = o.getWorldPosition(new THREE.Vector3());
    const gx = pos.y > LEVEL_HEIGHT - 0.5 ? pos.x + LEVEL_OFFSET_X : pos.x;
    sources.push({ ...def, pos, room: roomAtTile(Math.floor(gx), Math.floor(pos.z))?.id });
  });
  const level = (src: LightSource) => (src.fire ? src.intensity : blackout ? 0 : src.intensity);
  let focusY = 0;
  const assign = (x: number, z: number) => {
    shadowSrc = sources.find((src) => src.shadowable && src.room === focused) ?? null;
    const ranked = sources
      .filter((src) => src !== shadowSrc)
      // l'autre niveau compte triple : on éclaire d'abord son étage
      .map((src) => ({ src, d: Math.hypot(src.pos.x - x, src.pos.z - z, (src.pos.y - focusY - 2) * 3) - (src.room && src.room === focused ? 100 : 0) }))
      .sort((p, q) => p.d - q.d);
    pool.forEach((p, i) => {
      const src = ranked[i]?.src ?? null;
      p.src = src;
      if (!src) {
        p.light.intensity = 0;
        return;
      }
      p.light.position.copy(src.pos);
      p.light.color.set(src.color);
      p.light.distance = src.distance;
      p.light.decay = src.decay;
      p.light.intensity = level(src);
    });
    if (shadowSrc) {
      shadowLamp.position.copy(shadowSrc.pos);
      shadowLamp.target.position.set(shadowSrc.pos.x, shadowSrc.pos.y - 3, shadowSrc.pos.z);
      shadowLamp.color.set(shadowSrc.color);
      shadowLamp.distance = shadowSrc.distance;
      shadowLamp.intensity = level(shadowSrc) * 1.6;
    } else shadowLamp.intensity = 0;
  };
  // sans focus explicite (vues extérieures), on éclaire autour de l'entrée
  assign(WORLD_W / 2, WORLD_H);

  return {
    group,
    colliders,
    exteriorWindows,
    setBlackout(on) {
      blackout = on;
      assign(lastFocus.x, lastFocus.y);
      for (const m of bulbMats) m.emissiveIntensity = on ? 0 : m.side === THREE.DoubleSide ? 0.5 : 3;
      glowMat.emissiveIntensity = on ? 0.02 : 1.1;
      for (const s of screens) (s.material as THREE.MeshStandardMaterial).emissiveIntensity = on ? 0 : 0.9;
    },
    setUnlocked(ids) {
      for (const [id, obj] of [...lockedDoors]) {
        if (!ids.includes(id)) continue;
        // la porte pivote et reste ouverte contre le mur
        obj.rotation.y += Math.PI / 2;
        obj.position.x += Math.sin(obj.rotation.y) * 0.45;
        obj.position.z += Math.cos(obj.rotation.y) * 0.45;
        const i = colliders.indexOf(obj);
        if (i >= 0) colliders.splice(i, 1);
        lockedDoors.delete(id);
      }
    },
    focus(x, z, roomId, y = 0) {
      // réattribution seulement quand on change de pièce ou qu'on a bougé d'au moins 1,5 m
      if (roomId === focused && Math.hypot(x - lastFocus.x, z - lastFocus.y) < 1.5 && Math.abs(y - focusY) < 1) return;
      focused = roomId;
      focusY = y;
      lastFocus.set(x, z);
      assign(x, z);
    },
    setShadows(on) {
      shadowLamp.castShadow = inGame && on;
    },
    update(t) {
      for (const f of fires) ((f as THREE.Mesh).material as THREE.MeshStandardMaterial).emissiveIntensity = 2.2 + Math.sin(t * 13) * 0.4;
      for (const p of pool) if (p.src?.fire) p.light.intensity = p.src.intensity - 1 + Math.sin(t * 11) * 1.2 + Math.sin(t * 17.3) * 0.8;
      for (const p of pendulums) p.rotation.z = Math.sin(t * Math.PI) * 0.12;
      for (const w of waters) {
        const m = w.material as THREE.MeshStandardMaterial;
        if (m.normalMap) m.normalMap.offset.set(t * 0.02, t * 0.013);
      }
    },
  };
}
