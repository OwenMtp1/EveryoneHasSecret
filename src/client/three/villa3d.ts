/**
 * Villa Beaumont en 3D réaliste, générée à partir du plan (shared/content/villa.ts).
 * 1 tuile = 1 mètre. Monde : x = colonne, z = ligne, y = hauteur.
 *
 *  - quatre niveaux (sous-sol, rez-de-chaussée, étage, grenier) + deux cabanes perchées : chaque
 *    bande de la grille est construite à plat puis replacée à sa hauteur (levelBase)
 *  - murs : noyaux instanciés (collision caméra) + faces orientées par pièce (papier peint, carrelage,
 *    brique en façade, planches sous le toit), plinthes, corniches ; murs du grenier sous les rampants
 *  - sols PBR par matériau, tapis, plafonds percés au-dessus des escaliers, chants de dalle autour des trémies
 *  - portes encadrées, fenêtres avec vitrage et rideaux, façade éclairée de l'intérieur, toit en tuiles
 *  - mobilier détaillé orienté contre le mur le plus proche
 *  - éclairage à coût constant : un petit réservoir de lampes attribué aux sources du niveau du joueur
 *    (pas de fuite de lumière d'un étage à l'autre), une seule lampe à ombres (pièce courante)
 * Ajouter une pièce ou un meuble dans les données suffit à le faire apparaître.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  DOORS,
  GRID_W,
  HOUSE,
  LEVELS,
  LEVEL_HEIGHT,
  PORTALS,
  ROOMS,
  WORLD_H,
  WORLD_W,
  allFurniture,
  buildWorldGrid,
  gridX,
  isVoidTile,
  levelBase,
  levelOf,
  levelOffset,
  localX,
  portalArrivalTiles,
  roomById,
  type FurnitureDef,
  type Level,
  type RoomDef,
} from '@shared/content/villa';
import { MAT, fabricTex } from './materials';
import { box, cyl, sphere } from './build';
import { buildFurnishing } from './furnishing3d';

export const WALL_H = 3;
/** Égout du toit (haut des façades) et faîtage. */
const EAVE_Y = 2 * LEVEL_HEIGHT;
const RIDGE_H = 5.5;
const ROOF_ZC = (HOUSE.z0 + HOUSE.z1) / 2;
const ROOF_HALF = (HOUSE.z1 - HOUSE.z0) / 2 + 0.6;
/** Hauteur de la sous-face du toit en z (local). */
export const roofY = (z: number) => EAVE_Y + RIDGE_H * Math.max(0, 1 - Math.abs(z - ROOF_ZC) / ROOF_HALF);
/** Hauteur libre sous le toit au-dessus du plancher du grenier. */
const atticH = (z: number) => roofY(z) - levelBase(2) - 0.03;

const grid = buildWorldGrid();
const roomIdx = (x: number, y: number) => (x < 0 || y < 0 || x >= GRID_W || y >= WORLD_H ? 0 : grid.rooms[y * GRID_W + x]);
const roomAtTile = (x: number, y: number): RoomDef | null => {
  const r = roomIdx(x, y);
  return r ? ROOMS[r - 1] : null;
};
const isDoor = (x: number, y: number) => x >= 0 && y >= 0 && x < GRID_W && y < WORLD_H && !!grid.doors[y * GRID_W + x];
const tileLevel = (x: number) => levelOf(x);
/** Tuile du même (x, y) local au niveau donné. */
const sameTileAt = (x: number, l: Level) => gridX(l, localX(x));

/**
 * Trémies : au-dessus de chaque rampe. Dans une pièce, une rambarde (meuble « railing ») l'entoure ;
 * hors pièce, c'est une cage d'escalier fermée (« puits ») habillée comme la pièce d'arrivée ; au-dessus
 * d'une échelle de cabane, c'est simplement une ouverture dans le garde-corps.
 */
const shaftStyle = new Map<string, RoomDef>();
const openTiles = new Set<string>();
for (const p of PORTALS) {
  const [ax, ay] = portalArrivalTiles(p)[0];
  const arrival = roomAtTile(ax, ay)!;
  for (let y = p.y; y < p.y + p.h; y++)
    for (let x = p.x; x < p.x + p.w; x++) {
      const gx = gridX((p.level + 1) as Level, x);
      if (roomIdx(gx, y)) continue;
      if (arrival.treehouse) openTiles.add(`${gx},${y}`);
      else shaftStyle.set(`${gx},${y}`, arrival);
    }
}
const isVoid = (x: number, y: number) => isVoidTile(x, y);
/** Sous une trémie du niveau du dessus : pas de plafond. */
const underVoid = (x: number, y: number) => {
  const l = tileLevel(x);
  return l < 2 && isVoidTile(sameTileAt(x, (l + 1) as Level), y);
};
/** Tuile « occupée » (pièce ou puits d'escalier) : les murs l'entourent. */
const occupied = (x: number, y: number) => !!roomIdx(x, y) || shaftStyle.has(`${x},${y}`);
const styleRoomAt = (x: number, y: number): RoomDef | null => roomAtTile(x, y) ?? shaftStyle.get(`${x},${y}`) ?? null;

/** Plan horizontal découpé par tuiles (trous possibles), UV continus sur la pièce. */
function tiledPlane(r: RoomDef['rect'], skip: (x: number, y: number) => boolean, faceUp: boolean): THREE.BufferGeometry | null {
  const geos: THREE.BufferGeometry[] = [];
  for (let y = r.y; y < r.y + r.h; y++)
    for (let x = r.x; x < r.x + r.w; x++) {
      if (skip(x, y)) continue;
      const p = new THREE.PlaneGeometry(1, 1);
      const uv = p.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (x - r.x + uv.getX(i)) / r.w, (r.y + r.h - y - 1 + uv.getY(i)) / r.h);
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
  ceiling?: (w: number, h: number) => THREE.Material;
  light: string;
  /** intensité de la lampe de la pièce (défaut ROOM_LIGHT) */
  power?: number;
  lamp: 'pendant' | 'chandelier' | 'bulb';
  rug?: { w: number; h: number; base: string; border: string; dx?: number; dz?: number };
}

// Palette : couleurs franches et chaudes de maison de banlieue (moutarde, sarcelle, brique, vert sapin),
// un peu stylisées ; la nuit, les lampes chaudes et les recoins sombres font le reste.
const STYLE: Record<string, RoomStyle> = {
  kitchen: { floor: (w, h) => MAT.tiles(w, h), wall: () => MAT.wallpaper('#e2cf8e', '#b9a065', 'tiles', WALL_H), light: '#ffd9a6', lamp: 'pendant' },
  dining: { floor: (w, h) => MAT.hardwood(w, h, '#a87a56'), wall: () => MAT.wallpaper('#8a3b26', '#d9a441', 'stripes', WALL_H), light: '#ffc98a', lamp: 'chandelier', rug: { w: 5, h: 4, base: '#3a2a4a', border: '#d9a441' } },
  living: { floor: (w, h) => MAT.hardwood(w, h), wall: () => MAT.wallpaper('#2f4a3c', '#c9a45c', 'damask', WALL_H), light: '#ffc98a', lamp: 'chandelier', rug: { w: 5, h: 3.2, base: '#5a1820', border: '#c9a45c', dx: -2.5, dz: 0 } },
  gamesroom: { floor: (w, h) => MAT.hardwood(w, h, '#7a8a6a'), wall: () => MAT.wallpaper('#1f5a52', '#e0b060', 'stripes', WALL_H), light: '#ffd7a0', lamp: 'pendant', rug: { w: 6, h: 3.6, base: '#5a1a1a', border: '#e0b060', dx: 1, dz: -0.4 } },
  office: { floor: (w, h) => MAT.hardwood(w, h, '#8a6a52'), wall: () => MAT.wallpaper('#1f2a40', '#3a4a6a', 'stripes', WALL_H), light: '#ffcf96', lamp: 'pendant', rug: { w: 3, h: 2, base: '#3a2232', border: '#a07a4a', dx: 0.5 } },
  wc: { floor: (w, h) => MAT.tiles(w, h), wall: () => MAT.wallpaper('#e6c766', '#b8963a', 'stripes', WALL_H), light: '#fff0d0', lamp: 'bulb', power: 9 },
  laundry: { floor: (w, h) => MAT.tiles(w, h), wall: () => MAT.wallpaper('#cfe0da', '#8fb0a4', 'tiles', WALL_H), light: '#f4f1e6', lamp: 'bulb', power: 11 },
  garage: { floor: (w, h) => MAT.concrete(w, h), wall: () => MAT.brick(1, WALL_H / 1.5), ceiling: (w, h) => MAT.concrete(w, h), light: '#fff0d0', lamp: 'bulb', power: 11 },
  mudroom: { floor: (w, h) => MAT.marble(w, h), wall: () => MAT.wallpaper('#6a7a3a', '#4a5a28', 'stripes', WALL_H), light: '#ffd9a6', lamp: 'bulb', power: 9 },
  hall: { floor: (w, h) => MAT.marble(w, h), wall: () => MAT.wallpaper('#5a1d26', '#8a3a44', 'damask', WALL_H), light: '#ffc98a', lamp: 'chandelier', rug: { w: 2, h: 4, base: '#3b1218', border: '#c9a45c', dx: -1.5, dz: 0 } },
  corridor: { floor: (w, h) => MAT.hardwood(w, h), wall: () => MAT.wallpaper('#c9b48f', '#a88f68', 'stripes', WALL_H), light: '#ffcf96', lamp: 'bulb', rug: { w: 11, h: 1.2, base: '#4a2a1e', border: '#b08a4a' } },
  // ── Sous-sol ──
  basement: { floor: (w, h) => MAT.concrete(w, h), wall: () => MAT.brick(1, WALL_H / 1.5), ceiling: (w, h) => MAT.concrete(w, h), light: '#ffb070', lamp: 'bulb', power: 9 },
  cellar: { floor: (w, h) => MAT.concrete(w, h), wall: () => MAT.brick(1, WALL_H / 1.5), ceiling: (w, h) => MAT.concrete(w, h), light: '#ff9a50', lamp: 'bulb', power: 7 },
  // ── Étage ──
  landing: { floor: (w, h) => MAT.hardwood(w, h), wall: () => MAT.wallpaper('#c9b48f', '#a88f68', 'stripes', WALL_H), light: '#ffcf96', lamp: 'bulb', rug: { w: 16, h: 1.2, base: '#4a2a1e', border: '#b08a4a', dx: -10 } },
  library: { floor: (w, h) => MAT.hardwood(w, h, '#7a5a40'), wall: () => MAT.wallpaper('#2a3a2c', '#7a8a5a', 'stripes', WALL_H), light: '#ffc98a', lamp: 'chandelier', rug: { w: 4, h: 2.6, base: '#4a1a1e', border: '#c9a45c', dz: 0.4 } },
  bedroom2: { floor: (w, h) => MAT.hardwood(w, h, '#a27a5a'), wall: () => MAT.wallpaper('#4a1a24', '#7a2c3a', 'damask', WALL_H), light: '#ffc58a', lamp: 'chandelier', rug: { w: 3.5, h: 2.4, base: '#3a1018', border: '#d4b06a', dz: 1.2 } },
  suite: { floor: (w, h) => MAT.hardwood(w, h, '#8a6a52'), wall: () => MAT.wallpaper('#2a2440', '#6a5a8a', 'damask', WALL_H), light: '#ffc58a', lamp: 'chandelier', rug: { w: 4, h: 3, base: '#3a1018', border: '#d4b06a', dx: -1 } },
  bathroom2: { floor: (w, h) => MAT.tiles(w, h), wall: () => MAT.wallpaper('#e4e8e0', '#9fb0a0', 'tiles', WALL_H), light: '#f1f4ff', lamp: 'bulb' },
  kidsroom: { floor: (w, h) => MAT.hardwood(w, h, '#b09070'), wall: () => MAT.wallpaper('#7ab0c0', '#f0dca0', 'stripes', WALL_H), light: '#ffe0b0', lamp: 'pendant', rug: { w: 3, h: 2.4, base: '#c9a45c', border: '#3a6a8a', dx: -0.5 } },
  guestroom: { floor: (w, h) => MAT.hardwood(w, h, '#a27a5a'), wall: () => MAT.wallpaper('#6a5a3a', '#9a8458', 'damask', WALL_H), light: '#ffd3a0', lamp: 'pendant', rug: { w: 3, h: 2.2, base: '#3a2a1e', border: '#c8b48a', dx: 0.5 } },
  bathroom: { floor: (w, h) => MAT.tiles(w, h), wall: () => MAT.wallpaper('#e8ecef', '#9fb0bc', 'tiles', WALL_H), light: '#f1f4ff', lamp: 'bulb' },
  bedroom1: { floor: (w, h) => MAT.hardwood(w, h), wall: () => MAT.wallpaper('#28375a', '#48618f', 'damask', WALL_H), light: '#ffd3a0', lamp: 'pendant', rug: { w: 2.6, h: 2, base: '#1e2a4a', border: '#c8b48a', dx: 0.8 } },
  studio: { floor: (w, h) => MAT.hardwood(w, h, '#b0906a'), wall: () => MAT.wallpaper('#d8cfbe', '#b8ab92', 'stripes', WALL_H), light: '#fff0d8', lamp: 'pendant' },
  musicroom: { floor: (w, h) => MAT.hardwood(w, h), wall: () => MAT.wallpaper('#3a1e2a', '#a07a5a', 'damask', WALL_H), light: '#ffc98a', lamp: 'chandelier', rug: { w: 3.5, h: 2.6, base: '#2a1a3a', border: '#c9a45c', dx: 0.5, dz: 0.4 } },
  // ── Grenier, cabanes ──
  attic: { floor: (w, h) => MAT.hardwood(w, h, '#9a8060'), wall: () => MAT.wood('#7a5a3a'), light: '#ffcf8a', lamp: 'bulb', power: 9 },
  treehouse1: { floor: (w, h) => MAT.hardwood(w, h, '#b08a5a'), wall: () => MAT.wood('#8a6038'), light: '', lamp: 'bulb' },
  treehouse2: { floor: (w, h) => MAT.hardwood(w, h, '#b08a5a'), wall: () => MAT.wood('#8a6038'), light: '', lamp: 'bulb' },
  // ── Extérieurs ──
  garden: { floor: (w, h) => MAT.grass(w, h), wall: () => MAT.brick(1, 1.1 / 1.5), light: '', lamp: 'bulb' },
  orchard: { floor: (w, h) => MAT.grass(w, h), wall: () => MAT.brick(1, 1.1 / 1.5), light: '', lamp: 'bulb' },
  exterior: { floor: (w, h) => MAT.gravel(w, h), wall: () => MAT.brick(1, 1.1 / 1.5), light: '', lamp: 'bulb' },
};
const styleOf = (r: RoomDef): RoomStyle => STYLE[r.id] ?? { floor: (w, h) => MAT.concrete(w, h), wall: () => MAT.plaster(), light: '#ffcf96', lamp: 'bulb' };

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

/** Rotation qui oriente l'axe local +z dans le sens de la montée d'une rampe. */
const ascentRotation = (dir: FurnitureDef['facing']) => (dir === 'n' ? Math.PI : dir === 'e' ? Math.PI / 2 : dir === 'w' ? -Math.PI / 2 : 0);

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

const BED_COLORS: Record<string, [string, string]> = {
  bedroom2: ['#4a1a24', '#7a2434'],
  suite: ['#2a2440', '#5a4a7a'],
  guestroom: ['#5a4a32', '#8a7450'],
  kidsroom: ['#3a6a8a', '#e0b060'],
  attic: ['#3a3a3c', '#8a8070'],
};

function buildFurniture(f: FurnitureDef, fires: THREE.Object3D[], waters: THREE.Mesh[]): THREE.Group {
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
      if (W > 1.5) {
        box(g, [0.6, 0.012, 0.5], MAT.lacquer('#0b0b0c'), [W / 2 - 0.45, 0.917, back + D * 0.45]);
        for (const [dx, dz] of [[-0.15, -0.12], [0.15, -0.12], [-0.15, 0.12], [0.15, 0.12]]) cyl(g, 0.08, 0.08, 0.004, MAT.metal('#3a3a3c', 0.5), [W / 2 - 0.45 + dx, 0.925, back + D * 0.45 + dz]);
        box(g, [W, 0.7, 0.35], MAT.paint('#e8e2d4', 0.5), [0, 1.85, back + 0.18]);
      }
      break;
    }
    case 'sink': {
      if (f.roomId === 'kitchen') {
        box(g, [W, 0.86, D * 0.92], MAT.paint('#e8e2d4', 0.5), [0, 0.43, back + D * 0.46]);
        box(g, [W + 0.04, 0.05, D * 0.98], MAT.lacquer('#2a2826'), [0, 0.885, back + D * 0.49]);
        box(g, [W * 0.55, 0.06, D * 0.5], MAT.metal('#9aa3aa', 0.15), [0, 0.89, back + D * 0.45]);
        cyl(g, 0.015, 0.015, 0.3, MAT.metal(), [0, 1.05, back + 0.1]);
        box(g, [0.02, 0.02, 0.18], MAT.metal(), [0, 1.2, back + 0.18]);
      } else if (f.roomId === 'laundry') {
        // bac à laver en grès sur pieds
        for (const sx of [-1, 1]) for (const sz of [0.08, 0.5]) box(g, [0.05, 0.62, 0.05], MAT.metal('#5a5c60', 0.5), [sx * 0.33, 0.31, back + sz]);
        box(g, [0.78, 0.32, 0.56], MAT.paint('#e6e2d6', 0.3), [0, 0.78, back + 0.3], [0, 0, 0], 0.04);
        box(g, [0.68, 0.04, 0.46], MAT.paint('#9aa3aa', 0.2), [0, 0.93, back + 0.3]);
        cyl(g, 0.015, 0.015, 0.4, MAT.metal(), [0, 1.15, back + 0.05]);
        box(g, [0.02, 0.02, 0.2], MAT.metal(), [0, 1.34, back + 0.14]);
      } else if (f.w >= 2) {
        // meuble double vasque
        box(g, [W, 0.82, 0.55], MAT.wood('#3a2a1c'), [0, 0.41, back + 0.28]);
        box(g, [W + 0.04, 0.05, 0.58], MAT.marble(1, 1), [0, 0.845, back + 0.29]);
        for (const sx of [-0.25, 0.25]) {
          cyl(g, 0.2, 0.16, 0.1, MAT.porcelain(), [sx * W, 0.92, back + 0.3], [0, 0, 0], 20);
          cyl(g, 0.012, 0.012, 0.2, MAT.metal(), [sx * W, 1.0, back + 0.06]);
          box(g, [0.5, 0.75, 0.015], MAT.metal('#d8dde2', 0.04), [sx * W, 1.6, back + 0.01]);
        }
      } else {
        // lavabo sur colonne + miroir
        cyl(g, 0.12, 0.16, 0.8, MAT.porcelain(), [0, 0.4, back + 0.3]);
        box(g, [0.6, 0.12, 0.45], MAT.porcelain(), [0, 0.86, back + 0.26], [0, 0, 0], 0.04);
        box(g, [0.46, 0.04, 0.3], MAT.paint('#a8b4bc', 0.1), [0, 0.91, back + 0.27]);
        cyl(g, 0.012, 0.012, 0.18, MAT.metal(), [0, 1.0, back + 0.08]);
        box(g, [0.6, 0.8, 0.015], MAT.wood('#3a2a1c'), [0, 1.55, back + 0.008]);
        box(g, [0.55, 0.75, 0.01], MAT.metal('#d8dde2', 0.04), [0, 1.55, back + 0.02]);
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
      const top = f.roomId === 'gamesroom' ? MAT.fabric('#1f5a3a') : low ? MAT.lacquer('#2a1a10') : wood;
      box(g, [tw, 0.05, td], top, [0, h, tz]);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, 0.025, 0.02, h, low ? MAT.metal('#b8913e', 0.3) : dark, [sx * (tw / 2 - 0.07), h / 2, tz + sz * (td / 2 - 0.07)]);
      if (isConsole) {
        box(g, [tw * 0.85, 1.08, 0.025], MAT.metal('#b8913e', 0.35), [0, 1.55, back + 0.008]);
        box(g, [tw * 0.8, 1.0, 0.01], MAT.metal('#d8dde2', 0.04), [0, 1.55, back + 0.025]);
        cyl(g, 0.06, 0.08, 0.3, MAT.porcelain(), [tw * 0.3, h + 0.17, tz]);
      } else if (!low) {
        // chaises tout autour (2 à 4 par grand côté)
        const per = Math.max(1, Math.min(4, Math.round(tw / 0.75)));
        for (const sz of [-1, 1])
          for (let i = 0; i < per; i++) {
            const sx = per === 1 ? 0 : -tw / 2 + 0.3 + ((tw - 0.6) * i) / (per - 1);
            const c = new THREE.Group();
            c.position.set(sx, 0, sz * (td / 2 + 0.22));
            c.rotation.y = sz > 0 ? Math.PI : 0;
            box(c, [0.42, 0.05, 0.42], wood, [0, 0.46, 0]);
            box(c, [0.42, 0.5, 0.04], wood, [0, 0.74, -0.19]);
            for (const lx of [-0.18, 0.18]) for (const lz of [-0.18, 0.18]) box(c, [0.035, 0.46, 0.035], dark, [lx, 0.23, lz]);
            g.add(c);
          }
        if (f.roomId === 'gamesroom') {
          // cartes et jetons
          for (let i = 0; i < 4; i++) box(g, [0.06, 0.004, 0.09], MAT.paint('#f2eee6', 0.6), [-0.3 + i * 0.2, h + 0.03, (i % 2) * 0.1 - 0.05], [0, i * 0.4, 0]);
          for (let i = 0; i < 5; i++) cyl(g, 0.02, 0.02, 0.01 + i * 0.008, MAT.paint(['#b8312a', '#1f3a6a', '#e8e2d4'][i % 3], 0.5), [0.25, h + 0.03 + i * 0.004, 0.15], [0, 0, 0], 10);
        } else if (f.roomId !== 'garden') box(g, [tw * 0.9, 0.006, td * 0.5], MAT.fabric('#e9e2d0'), [0, h + 0.028, 0]);
        if (f.roomId === 'dining') for (const sx of [-0.25, 0.25]) {
          cyl(g, 0.035, 0.05, 0.02, MAT.metal('#b8913e', 0.3), [sx * tw, h + 0.035, 0], [0, 0, 0], 12);
          cyl(g, 0.012, 0.012, 0.22, MAT.paint('#f2ece0', 0.6), [sx * tw, h + 0.15, 0], [0, 0, 0], 8);
          sphere(g, 0.012, MAT.glow('#ffcf80', 1.5), [sx * tw, h + 0.27, 0]);
        }
      } else {
        box(g, [0.3, 0.06, 0.22], MAT.paint('#6a2a2a'), [0.15, h + 0.055, 0]);
      }
      break;
    }
    case 'sofa': {
      const fab = MAT.fabric(f.roomId === 'gamesroom' ? '#7a4a1a' : f.roomId === 'musicroom' ? '#2f4a3c' : '#5b1f2a');
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
      const tall = f.roomId === 'attic' ? 1.6 : 2.1;
      const frame = f.roomId === 'garage' || f.roomId === 'basement' || f.roomId === 'laundry' ? MAT.metal('#6a6c70', 0.5) : MAT.wood('#3a2416');
      box(g, [W, tall, 0.05], frame, [0, tall / 2, back + 0.025]);
      for (const s of [-1, 1]) box(g, [0.05, tall, D * 0.9], frame, [s * (W / 2 - 0.025), tall / 2, back + D * 0.45]);
      const books = f.roomId === 'office' || f.roomId === 'studio';
      const colors = books ? ['#6a2424', '#24406a', '#2f4a28', '#7a5a22', '#3b2a4a', '#6a5a4a', '#1f1f1f'] : ['#c9b48a', '#8a3a2a', '#3a6a8a', '#d8d2c0', '#5a7a3a', '#e0b060', '#7a6a5a'];
      const rows = Math.round(tall / 0.42);
      for (let r = 0; r <= rows; r++) {
        const y = 0.08 + r * 0.42;
        box(g, [W - 0.1, 0.03, D * 0.88], frame, [0, y, back + D * 0.45]);
        if (r === rows) continue;
        let x = -W / 2 + 0.08;
        let i = r * 7;
        while (x < W / 2 - 0.14) {
          if (books) {
            const bw = 0.03 + ((i * 37) % 5) * 0.008;
            const bh = 0.24 + ((i * 13) % 6) * 0.018;
            box(g, [bw, bh, D * 0.6], MAT.paint(colors[i % colors.length], 0.7), [x + bw / 2, y + 0.015 + bh / 2, back + D * 0.4], [0, 0, (i * 7) % 9 === 0 ? 0.12 : 0]);
            x += bw + 0.004;
          } else {
            // bocaux, pots de peinture, boîtes
            const bw = 0.12 + ((i * 37) % 4) * 0.03;
            const bh = 0.12 + ((i * 13) % 5) * 0.035;
            if (i % 3 === 0) cyl(g, bw / 2, bw / 2, bh, MAT.paint(colors[i % colors.length], 0.4), [x + bw / 2, y + 0.015 + bh / 2, back + D * 0.42], [0, 0, 0], 10);
            else box(g, [bw, bh, D * 0.55], MAT.paint(colors[i % colors.length], 0.8), [x + bw / 2, y + 0.015 + bh / 2, back + D * 0.42]);
            x += bw + 0.03;
          }
          i++;
        }
      }
      break;
    }
    case 'desk': {
      const top = MAT.wood(f.roomId === 'kidsroom' ? '#c9a070' : '#3a2416');
      const dd = Math.min(D, 0.75);
      box(g, [W, 0.05, dd], top, [0, 0.76, back + dd / 2]);
      for (const s of [-1, 1]) box(g, [Math.min(0.45, W / 3), 0.72, dd - 0.03], top, [s * (W / 2 - Math.min(0.45, W / 3) / 2 - 0.02), 0.37, back + dd / 2]);
      if (f.roomId === 'office') {
        box(g, [0.5, 0.01, 0.35], MAT.paint('#2a4a2a', 0.8), [0, 0.79, back + 0.4]);
        cyl(g, 0.06, 0.08, 0.03, MAT.metal('#b8913e'), [W / 2 - 0.3, 0.8, back + 0.25]);
        cyl(g, 0.012, 0.012, 0.3, MAT.metal('#b8913e'), [W / 2 - 0.3, 0.95, back + 0.25]);
        box(g, [0.32, 0.08, 0.14], MAT.glow('#2f8a4a', 0.6), [W / 2 - 0.3, 1.12, back + 0.3]);
        box(g, [0.21, 0.004, 0.3], MAT.paint('#efe8d8'), [-0.2, 0.788, back + 0.42], [0, 0.2, 0]);
        // serrure du tiroir central
        cyl(g, 0.018, 0.018, 0.01, MAT.metal('#b8913e', 0.25), [0, 0.68, back + dd + 0.005], [Math.PI / 2, 0, 0], 10);
      } else if (f.roomId === 'kidsroom') {
        for (let i = 0; i < 4; i++) cyl(g, 0.006, 0.006, 0.14, MAT.paint(['#d83a2a', '#2a6ad8', '#e8c34a', '#3a9a4a'][i], 0.5), [-0.2 + i * 0.03, 0.85, back + 0.2], [0, 0, 0.1 * i], 6);
        box(g, [0.3, 0.004, 0.22], MAT.paint('#f2eee6', 0.8), [0.1, 0.788, back + 0.35], [0, -0.2, 0]);
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
      const [hc, cc] = BED_COLORS[f.roomId] ?? ['#24365e', '#2f4a7a'];
      const iron = f.roomId === 'attic';
      box(g, [bw, 0.3, bl], iron ? MAT.metal('#2a2a2c', 0.6) : MAT.wood('#3a2416'), [0, 0.2, back + bl / 2]);
      box(g, [bw - 0.06, 0.24, bl - 0.08], MAT.paint(iron ? '#c9c0a8' : '#f2eee6', 0.9), [0, 0.46, back + bl / 2 + 0.02], [0, 0, 0], 0.08);
      if (!iron) {
        box(g, [bw, 0.08, bl * 0.62], MAT.fabric(cc), [0, 0.6, back + bl * 0.66], [0, 0, 0], 0.04);
        for (const s of double ? [-1, 1] : [0]) box(g, [double ? bw * 0.4 : bw * 0.7, 0.14, 0.38], MAT.paint('#ffffff', 0.9), [s * bw * 0.23, 0.66, back + 0.32], [0.25, 0, 0], 0.07);
        box(g, [bw + 0.1, 1.1, 0.1], MAT.fabric(hc), [0, 0.75, back + 0.05], [0, 0, 0], 0.05);
      } else {
        // tête de lit en fer forgé, drap jeté
        for (const s of [-1, 1]) cyl(g, 0.02, 0.02, 1.1, MAT.metal('#2a2a2c', 0.6), [s * bw / 2, 0.55, back + 0.04], [0, 0, 0], 8);
        for (let i = 0; i < 6; i++) cyl(g, 0.01, 0.01, 0.6, MAT.metal('#2a2a2c', 0.6), [-bw / 2 + (bw * (i + 0.5)) / 6, 0.75, back + 0.04], [0, 0, 0], 6);
        box(g, [bw + 0.05, 0.02, bl * 0.8], MAT.fabric('#d8d0bc'), [0, 0.6, back + bl * 0.55], [0.02, 0, 0.03]);
      }
      if (double)
        for (const s of [-1, 1]) {
          const nx = s * (bw / 2 + 0.27);
          box(g, [0.45, 0.55, 0.4], MAT.wood('#3a2416'), [nx, 0.275, back + 0.25]);
          cyl(g, 0.06, 0.08, 0.18, MAT.porcelain(), [nx, 0.64, back + 0.25]);
          const shade = cyl(g, 0.15, 0.1, 0.18, MAT.fabric('#e8dcc0'), [nx, 0.82, back + 0.25], [0, 0, 0], 16);
          shade.castShadow = false;
        }
      if (f.roomId === 'kidsroom') sphere(g, 0.14, MAT.fabric('#8a6a4a'), [bw * 0.2, 0.75, back + 0.45], [1, 1.1, 0.8]); // ours en peluche
      break;
    }
    case 'wardrobe': {
      const old = f.roomId === 'attic' || f.roomId === 'laundry' || f.roomId === 'mudroom';
      const body = MAT.wood(old ? '#5a4a3a' : '#3a2416');
      const tall = f.roomId === 'attic' ? 1.95 : 2.15;
      box(g, [W, tall, D * 0.9], body, [0, tall / 2, back + D * 0.45]);
      box(g, [W + 0.06, 0.08, D * 0.95], MAT.wood('#2e1d12'), [0, tall + 0.04, back + D * 0.47]);
      for (const s of [-1, 1]) {
        box(g, [W / 2 - 0.08, tall - 0.3, 0.02], MAT.wood(old ? '#6a5a48' : '#4a2e1c'), [s * W * 0.25, tall / 2 - 0.02, back + D * 0.9 + 0.01]);
        cyl(g, 0.012, 0.012, 0.18, MAT.metal('#b8913e'), [s * 0.06, 1.1, back + D * 0.9 + 0.04]);
      }
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
      light.userData.light = { color: '#ff8a3a', intensity: 6, distance: 7, decay: 1.6, fire: true, room: f.roomId, level: levelOf(f.x) } satisfies LightSourceDef;
      g.add(light);
      // conduit (hotte) jusqu'au plafond
      box(g, [W + 0.5, WALL_H - 1.23, 0.4], stone, [0, 1.23 + (WALL_H - 1.23) / 2, back + 0.2]);
      box(g, [1.0, 0.75, 0.04], MAT.metal('#b8913e', 0.35), [0, 1.85, back + 0.42]);
      const canvas = new THREE.Mesh(new THREE.PlaneGeometry(0.88, 0.63), new THREE.MeshStandardMaterial({ map: paintingTexture(), roughness: 0.8 }));
      canvas.position.set(0, 1.85, back + 0.445);
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
      // Escalier praticable : monte dans le sens de `facing` (première marche → palier)
      g.rotation.y = ascentRotation(f.facing);
      const vertical = f.facing === 'n' || f.facing === 's';
      const SW = vertical ? f.w : f.h;
      const SD = vertical ? f.h : f.w;
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
      // dessous plein (paillasse) : pas de vide sous les marches
      const len = Math.hypot(SD, LEVEL_HEIGHT);
      const ang = -Math.atan2(LEVEL_HEIGHT, SD);
      box(g, [SW - 0.12, 0.06, len], MAT.paint('#ece6da', 0.6), [0, LEVEL_HEIGHT / 2 - 0.2, 0], [ang, 0, 0]);
      // limons pleins de chaque côté + rampes
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
    case 'ladder':
    case 'rope_ladder': {
      // Échelle appuyée (bois) ou échelle de corde : monte dans le sens de `facing`
      g.rotation.y = ascentRotation(f.facing);
      const vertical = f.facing === 'n' || f.facing === 's';
      const SD = vertical ? f.h : f.w;
      const rope = f.kind === 'rope_ladder';
      const top = LEVEL_HEIGHT + (rope ? 0.05 : 0.9);
      const z0 = -SD / 2 + 0.25;
      const z1 = SD / 2 - 0.02;
      const len = Math.hypot(z1 - z0, top);
      const ang = -Math.atan2(top, z1 - z0);
      const sideM = rope ? MAT.paint('#8a6a3c', 0.95) : MAT.wood('#7a5a36');
      for (const sx of [-0.27, 0.27]) {
        if (rope) cyl(g, 0.022, 0.022, len, sideM, [sx, top / 2, (z0 + z1) / 2], [Math.PI / 2 + ang, 0, 0], 6);
        else box(g, [0.06, 0.09, len], sideM, [sx, top / 2, (z0 + z1) / 2], [ang, 0, 0]);
      }
      const rungs = Math.floor(LEVEL_HEIGHT / 0.3);
      for (let i = 1; i <= rungs; i++) {
        const t = (i * 0.3) / top;
        cyl(g, 0.022, 0.022, 0.56, rope ? MAT.wood('#6b4e2f') : MAT.wood('#8a6440'), [0, t * top, z0 + t * (z1 - z0)], [0, 0, Math.PI / 2], 8);
      }
      if (rope) for (const sx of [-0.27, 0.27]) cyl(g, 0.05, 0.05, 0.12, MAT.paint('#6a4a2a', 0.9), [sx, LEVEL_HEIGHT - 0.05, z1 - 0.05], [0, 0, 0], 8);
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
      cyl(g, 0.12, 0.2, 2.2, MAT.paint('#3b2a1c', 1), [0, 1.1, 0], [0, 0, 0], 10);
      const fruit = f.name.includes('Pommier') ? '#b8312a' : f.name.includes('Cerisier') ? '#7a1020' : f.name.includes('Poirier') ? '#c9b040' : '#4a2a5a';
      const leaves = MAT.paint('#2a4a26', 1);
      for (const [x, y, z, r] of [[0, 2.7, 0, 1.15], [0.6, 2.4, 0.3, 0.8], [-0.55, 2.5, -0.25, 0.85], [0.15, 3.25, -0.3, 0.75]] as const) {
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), leaves);
        m.position.set(x, y, z);
        m.castShadow = true;
        g.add(m);
      }
      for (let i = 0; i < 7; i++) sphere(g, 0.06, MAT.paint(fruit, 0.5), [Math.cos(i * 2.1) * 0.95, 2.2 + (i % 3) * 0.35, Math.sin(i * 2.1) * 0.85]);
      break;
    }
    case 'big_tree': {
      // grand arbre des cabanes : tronc massif, branches maîtresses, houppier au-dessus de la plateforme
      g.rotation.y = 0;
      const bark = MAT.paint('#3b2a1c', 1);
      cyl(g, 0.38, 0.6, 7.2, bark, [0, 3.6, 0], [0, 0, 0], 12);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.4;
        const b = new THREE.Group();
        b.position.set(0, 4.2 + (i % 2) * 1.1, 0);
        b.rotation.set(0, -a, 0);
        cyl(b, 0.1, 0.2, 3.2, bark, [1.4, 0.9, 0], [0, 0, -1.05], 8);
        g.add(b);
      }
      const leaves = new THREE.MeshStandardMaterial({ color: '#1f3a22', roughness: 1, flatShading: true });
      for (const [x, y, z, r] of [[0, 8.2, 0, 2.6], [2.2, 7.2, 0.6, 1.9], [-2.0, 7.4, -0.5, 2.0], [0.6, 7.0, 2.2, 1.8], [-0.5, 7.1, -2.2, 1.8], [0.4, 9.4, -0.4, 1.7]] as const) {
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), leaves);
        m.position.set(x, y, z);
        m.castShadow = true;
        g.add(m);
      }
      break;
    }
    case 'car': {
      g.rotation.y = 0;
      const paint = MAT.lacquer(f.roomId === 'garage' ? '#2a4a6a' : '#4a1018');
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
  room?: string;
  level?: Level;
}
interface LightSource extends LightSourceDef {
  pos: THREE.Vector3;
  level: Level;
  outdoor?: boolean;
  shadowable?: boolean;
}

/**
 * Fusionne tout le décor immobile par matériau (et par réglage d'ombre) : quelques dizaines d'appels
 * de dessin au lieu de plusieurs centaines. Les objets de `keep` (collisions, portes, vitres animées)
 * restent indépendants. Les animations portées par les matériaux (feu, eau, écrans, ampoules)
 * continuent de fonctionner puisque le matériau est partagé.
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

/** Tableaux aux murs : [niveau, x local, z, rotation]. */
const PAINTINGS: [Level, number, number, number][] = [
  [0, 19, 14.02, 0],
  [0, 29.5, 12.98, Math.PI],
  [0, 15, 6.02, 0],
  [0, 33, 21.98, Math.PI],
  [0, 32, 14.02, 0],
  [0, 36, 14.02, 0],
  [1, 8, 14.02, 0],
  [1, 30, 14.02, 0],
  [1, 13, 14.02, 0],
  [1, 30, 12.98, Math.PI],
  [1, 6, 21.98, Math.PI],
  [1, 42, 6.02, 0],
  [1, 3, 21.98, Math.PI],
];

/** Lanternes extérieures (sur poteau ou en applique), coordonnées locales du rez-de-chaussée. */
const LANTERNS: [number, number][] = [[18.6, 23.3], [23.4, 23.3], [4, 1.4], [28.6, 1.4], [38, 1.4], [48.35, 20.4]];

export function buildVilla(opts: { roof?: boolean; driveway?: boolean } = {}): Villa3D {
  const group = new THREE.Group();
  const colliders: THREE.Object3D[] = [];
  const inGame = !opts.roof;

  // ── Terrain autour de la propriété + forêt sombre ──
  // (marqué « placé » : le terrain ne fait partie d'aucun niveau ; la pelouse est percée sous la maison
  //  pour ne jamais recouvrir la trémie de l'escalier de la cave)
  const terrain = new THREE.Group();
  terrain.userData.placed = true;
  group.add(terrain);
  const cx = WORLD_W / 2;
  const cz = WORLD_H / 2;
  // forme décrite en (x, −z) puis couchée : normale vers le haut
  const v = (x: number, z: number) => new THREE.Vector2(x, -z);
  const lawnShape = new THREE.Shape([v(cx - 110, cz - 110), v(cx + 110, cz - 110), v(cx + 110, cz + 110), v(cx - 110, cz + 110)]);
  lawnShape.holes.push(new THREE.Path([v(HOUSE.x0, HOUSE.z0), v(HOUSE.x1, HOUSE.z0), v(HOUSE.x1, HOUSE.z1), v(HOUSE.x0, HOUSE.z1)]));
  const lawnGeo = new THREE.ShapeGeometry(lawnShape);
  lawnGeo.rotateX(-Math.PI / 2);
  const lp = lawnGeo.getAttribute('position') as THREE.BufferAttribute;
  const luv = lawnGeo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < luv.count; i++) luv.setXY(i, (lp.getX(i) - cx + 110) / 220, (cz + 110 - lp.getZ(i)) / 220);
  const lawn = new THREE.Mesh(lawnGeo, MAT.grass(220, 220));
  lawn.position.y = -0.03;
  lawn.receiveShadow = true;
  terrain.add(lawn);
  const treeMat = new THREE.MeshStandardMaterial({ color: '#13241a', roughness: 1, flatShading: true });
  const trunkMat = MAT.paint('#2a1e14', 1);
  for (let i = 0; i < 80; i++) {
    const a = (i / 80) * Math.PI * 2;
    const r = 44 + ((i * 37) % 17);
    const x = cx + Math.cos(a) * r;
    const z = cz + Math.sin(a) * r * 0.8;
    const s = 0.8 + ((i * 13) % 7) / 6;
    if (opts.driveway && Math.abs(x - DRIVEWAY_X) < 6 && z > WORLD_H) continue;
    cyl(terrain, 0.25 * s, 0.35 * s, 3 * s, trunkMat, [x, 1.5 * s, z]);
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(2.4 * s, 1), treeMat);
    crown.position.set(x, 4.2 * s, z);
    terrain.add(crown);
  }

  // ── Sols, tapis, seuils ──
  for (const r of ROOMS) {
    const st = styleOf(r);
    const floorMat = st.floor(r.rect.w, r.rect.h);
    // sol découpé par tuiles quand la pièce contient une trémie, sinon un seul plan
    const holed = tilesOfRect(r.rect).some(([x, y]) => isVoid(x, y));
    const lvl = r.level ?? 0;
    const f = holed ? new THREE.Mesh(tiledPlane(r.rect, isVoid, true)!, floorMat) : new THREE.Mesh(new THREE.PlaneGeometry(r.rect.w, r.rect.h), floorMat);
    f.userData.level = lvl;
    if (!holed) {
      f.rotation.x = -Math.PI / 2;
      f.position.set(r.rect.x + r.rect.w / 2, 0, r.rect.y + r.rect.h / 2);
    }
    f.receiveShadow = true;
    group.add(f);
    if (st.rug) {
      const rug = new THREE.Mesh(new THREE.PlaneGeometry(st.rug.w, st.rug.h), MAT.rug(st.rug.base, st.rug.border));
      rug.rotation.x = -Math.PI / 2;
      rug.position.set(r.rect.x + r.rect.w / 2 + (st.rug.dx ?? 0), 0.006, r.rect.y + r.rect.h / 2 + (st.rug.dz ?? 0));
      rug.receiveShadow = true;
      rug.userData.level = lvl;
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
  // Un mur extérieur de la maison monte jusqu'à l'égout du toit (rez-de-chaussée + étage + plancher du grenier)
  const facadeH = EAVE_Y;
  const upstairsAbove = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (occupied(gridX(1, x + dx), y + dy) && !roomAtTile(gridX(1, x + dx), y + dy)?.treehouse) return true;
    return false;
  };
  for (let y = -1; y <= WORLD_H; y++)
    for (let x = -1; x <= GRID_W; x++) {
      if (occupied(x, y) || isOpening(x, y) || openTiles.has(`${x},${y}`)) continue;
      let indoor = false;
      let outdoor = false;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const r = styleRoomAt(x + dx, y + dy);
          if (!r || r.treehouse) continue; // garde-corps des cabanes : construits à part (planches fines)
          if (r.outdoor) outdoor = true;
          else indoor = true;
        }
      if (!indoor && !outdoor) continue;
      const lvl = tileLevel(x);
      let h: number;
      if (!indoor) h = 1.1;
      else if (lvl === 2) h = Math.max(0.3, Math.min(atticH(y), atticH(y + 1)));
      else if (lvl === 0 && outdoor && upstairsAbove(x, y)) h = facadeH;
      else h = LEVEL_HEIGHT - 0.02; // sous le plancher du dessus (pas de z-fighting)
      wallTiles.push({ x, y, h });
      heightAt.set(`${x},${y}`, indoor ? (lvl === 0 && outdoor && upstairsAbove(x, y) ? facadeH : lvl === 2 ? 99 : WALL_H) : 1.1);
    }
  const tmp = new THREE.Object3D();
  for (const lvl of LEVELS) {
    const tiles = wallTiles.filter((w) => tileLevel(w.x) === lvl);
    if (!tiles.length) continue;
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

  const faces = new Map<string, { m: THREE.Material; lvl: Level; geos: THREE.BufferGeometry[] }>();
  const trims = new Map<Level, THREE.BufferGeometry[]>();
  const crowns = new Map<Level, THREE.BufferGeometry[]>();
  const push = (m: Map<Level, THREE.BufferGeometry[]>, l: Level, g: THREE.BufferGeometry) => (m.get(l) ?? m.set(l, []).get(l)!).push(g);
  const windowSpots: { x: number; z: number; ry: number; outdoor: boolean; lvl: Level; y?: number }[] = [];
  // [dx, dy, rotation de la face pour qu'elle regarde la pièce]
  const DIRS: [number, number, number][] = [[0, -1, 0], [0, 1, Math.PI], [-1, 0, Math.PI / 2], [1, 0, -Math.PI / 2]];
  for (let y = 0; y < WORLD_H; y++)
    for (let x = 0; x < GRID_W; x++) {
      const room = styleRoomAt(x, y);
      if (!room || room.treehouse || isDoor(x, y)) continue;
      const lvl = tileLevel(x);
      const attic = lvl === 2;
      for (const [dx, dy, ry] of DIRS) {
        const wx = x + dx;
        const wy = y + dy;
        if (room.outdoor && lvl === 0 && isDoor(wx, wy) && upstairsAbove(wx, wy)) {
          // façade au-dessus d'une porte extérieure : brique du linteau jusqu'au toit
          const top = facadeH - 2.32;
          const plane = new THREE.PlaneGeometry(1, top);
          const uvs = plane.getAttribute('uv') as THREE.BufferAttribute;
          for (let i = 0; i < uvs.count; i++) uvs.setY(i, (uvs.getY(i) * top) / 1.1);
          plane.rotateY(ry);
          plane.translate(x + 0.5 + dx * 0.499, 2.32 + top / 2, y + 0.5 + dy * 0.499);
          const m = styleOf(room).wall();
          const key = `${lvl}|${m.uuid}`;
          if (!faces.has(key)) faces.set(key, { m, lvl, geos: [] });
          faces.get(key)!.geos.push(plane);
        }
        if (occupied(wx, wy) || isOpening(wx, wy) || openTiles.has(`${wx},${wy}`)) continue;
        // côté trémie : pas de mur, la rambarde suffit
        if (isVoid(wx, wy)) continue;
        // à l'intérieur, le papier peint s'arrête au plafond ; dehors, la façade monte jusqu'au toit
        const wallH = heightAt.get(`${wx},${wy}`) ?? WALL_H;
        const h = room.outdoor ? wallH : attic ? 1 : Math.min(wallH, WALL_H);
        const m = styleOf(room).wall();
        const plane = new THREE.PlaneGeometry(1, h);
        if (room.outdoor && h > 1.2) {
          // brique : le motif garde son échelle quelle que soit la hauteur du mur
          const uvs = plane.getAttribute('uv') as THREE.BufferAttribute;
          for (let i = 0; i < uvs.count; i++) uvs.setY(i, (uvs.getY(i) * h) / 1.1);
        }
        plane.rotateY(ry);
        plane.translate(x + 0.5 + dx * 0.499, h / 2, y + 0.5 + dy * 0.499);
        if (attic) {
          // grenier : le haut de la face suit le rampant du toit
          const pos = plane.getAttribute('position') as THREE.BufferAttribute;
          const uvs = plane.getAttribute('uv') as THREE.BufferAttribute;
          for (let i = 0; i < pos.count; i++)
            if (pos.getY(i) > 0.5) {
              const hh = atticH(pos.getZ(i));
              pos.setY(i, hh);
              uvs.setY(i, hh / 1.5);
            }
          plane.computeVertexNormals();
        }
        const key = `${lvl}|${m.uuid}`;
        if (!faces.has(key)) faces.set(key, { m, lvl, geos: [] });
        faces.get(key)!.geos.push(plane);
        if (!room.outdoor) {
          if (roomIdx(x, y)) {
            // plinthe (pas dans les cages d'escalier : elles n'ont pas de plancher)
            const base = new THREE.BoxGeometry(1, 0.12, 0.025);
            base.rotateY(ry);
            base.translate(x + 0.5 + dx * 0.487, 0.06, y + 0.5 + dy * 0.487);
            push(trims, lvl, base);
          }
          if (!attic) {
            const crown = new THREE.BoxGeometry(1, 0.09, 0.06);
            crown.rotateY(ry);
            crown.translate(x + 0.5 + dx * 0.47, WALL_H - 0.045, y + 0.5 + dy * 0.47);
            push(crowns, lvl, crown);
          }
        }
        const rhythm = dy !== 0 ? localX(wx) % 3 === 1 : wy % 3 === 1;
        const across = roomAtTile(wx + dx, wy + dy);
        if (lvl === 0 && across && !across.treehouse && across.outdoor !== room.outdoor && h >= WALL_H && rhythm) {
          windowSpots.push({ x: x + 0.5 + dx * 0.5, z: y + 0.5 + dy * 0.5, ry, outdoor: !!room.outdoor, lvl: 0 });
          // façade : fenêtre de l'étage au-dessus (vue de l'extérieur)
          if (room.outdoor && h > WALL_H) windowSpots.push({ x: x + 0.5 + dx * 0.5, z: y + 0.5 + dy * 0.5, ry, outdoor: true, lvl: 0, y: LEVEL_HEIGHT });
        }
        // étage : fenêtres sur les murs extérieurs (vers le dehors du rez-de-chaussée)
        const below = roomAtTile(gridX(0, localX(wx + dx)), wy + dy);
        if (lvl === 1 && !room.outdoor && !across && !occupied(wx + dx, wy + dy) && (!below || below.outdoor) && rhythm)
          windowSpots.push({ x: x + 0.5 + dx * 0.5, z: y + 0.5 + dy * 0.5, ry, outdoor: false, lvl: 1 });
        // grenier : fenêtres dans les pignons seulement (les longs pans sont sous le toit)
        const gable = dx !== 0 && (localX(wx) === HOUSE.x0 || localX(wx) === HOUSE.x1 - 1);
        if (attic && gable && wy % 3 === 1 && atticH(wy + 0.5) > 2.6) {
          windowSpots.push({ x: x + 0.5 + dx * 0.5, z: y + 0.5 + dy * 0.5, ry, outdoor: false, lvl: 2 });
          // vitre éclairée côté extérieur (rangée avec l'étage : visible depuis le jardin)
          windowSpots.push({ x: localX(wx) + 0.5 + dx * 0.52, z: y + 0.5 + dy * 0.5, ry: ry + Math.PI, outdoor: true, lvl: 1, y: levelBase(2) });
        }
      }
    }
  // façade ouest : la maison longe la limite de la propriété (pas de pièce extérieure de ce côté)
  for (let y = HOUSE.z0; y < HOUSE.z1; y++) {
    const plane = new THREE.PlaneGeometry(1, facadeH);
    const uvs = plane.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uvs.count; i++) uvs.setY(i, (uvs.getY(i) * facadeH) / 1.1);
    plane.rotateY(-Math.PI / 2);
    plane.translate(-0.002, facadeH / 2, y + 0.5);
    const m = STYLE.garden.wall();
    const key = `0|${m.uuid}`;
    if (!faces.has(key)) faces.set(key, { m, lvl: 0, geos: [] });
    faces.get(key)!.geos.push(plane);
  }
  for (const { m, lvl, geos } of faces.values()) {
    const mesh = new THREE.Mesh(mergeGeometries(geos), m);
    mesh.receiveShadow = true;
    mesh.userData.level = lvl;
    group.add(mesh);
  }
  for (const lvl of LEVELS) {
    if (trims.get(lvl)?.length) {
      const t = new THREE.Mesh(mergeGeometries(trims.get(lvl)!), MAT.paint('#ece6da', 0.5));
      t.receiveShadow = true;
      t.userData.level = lvl;
      group.add(t);
    }
    if (crowns.get(lvl)?.length) {
      const c = new THREE.Mesh(mergeGeometries(crowns.get(lvl)!), MAT.paint('#f2ede2', 0.6));
      c.userData.level = lvl;
      group.add(c);
    }
  }

  // ── Chants de dalle autour des trémies (entre le plafond du dessous et le plancher du dessus) ──
  {
    const slab = LEVEL_HEIGHT - WALL_H;
    const geos = new Map<Level, THREE.BufferGeometry[]>();
    for (const k of VOID_KEYS) {
      const [x, y] = k;
      const l = tileLevel(x);
      if (roomAtTile(x, y)?.treehouse || openTiles.has(`${x},${y}`)) continue;
      for (const [dx, dy, ry] of DIRS) {
        if (isVoid(x + dx, y + dy)) continue;
        const p = new THREE.PlaneGeometry(1, slab + 0.02);
        p.rotateY(ry);
        p.translate(x + 0.5 + dx * 0.5, -slab / 2, y + 0.5 + dy * 0.5);
        push(geos, l, p);
      }
    }
    for (const [l, list] of geos) {
      const m = new THREE.Mesh(mergeGeometries(list), MAT.plaster());
      m.userData.level = l;
      group.add(m);
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
    if (!w.outdoor && w.lvl !== 2) {
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
    // le linteau comble aussi l'épaisseur du plancher du dessus
    const lintelH = LEVEL_HEIGHT - 2.32;
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(1, lintelH, 1), MAT.paint('#2a2622', 0.9));
    lintel.position.set(d.x + 0.5, 2.3 + lintelH / 2, d.y + 0.5);
    group.add(lintel);
    colliders.push(lintel);
    // passage nord-sud si les tuiles au nord et au sud sont des pièces
    const northSouth = !!roomIdx(d.x, d.y - 1) && !!roomIdx(d.x, d.y + 1);
    const g = new THREE.Group();
    g.position.set(d.x + 0.5, 0, d.y + 0.5);
    if (!northSouth) g.rotation.y = Math.PI / 2;
    // chambranle seulement du côté mur
    const wallLeft = northSouth ? !roomIdx(d.x - 1, d.y) : !roomIdx(d.x, d.y + 1);
    const wallRight = northSouth ? !roomIdx(d.x + 1, d.y) : !roomIdx(d.x, d.y - 1);
    if (wallLeft) box(g, [0.08, 2.32, 1.04], casing, [-0.47, 1.16, 0]);
    if (wallRight) box(g, [0.08, 2.32, 1.04], casing, [0.47, 1.16, 0]);
    box(g, [1.02, 0.1, 1.04], casing, [0, 2.33, 0]);
    group.add(g);
    if (d.lockedBy) {
      const garage = d.rooms.includes('garage');
      const leaf = new THREE.Group();
      leaf.position.copy(g.position);
      leaf.rotation.copy(g.rotation);
      if (garage) {
        // porte basculante : panneaux métalliques rainurés
        box(leaf, [1.0, 2.25, 0.06], MAT.paint('#c9c2b0', 0.55), [0, 1.125, 0]);
        for (let i = 1; i < 6; i++) box(leaf, [1.0, 0.025, 0.07], MAT.paint('#9a9484', 0.6), [0, i * 0.375, 0]);
        leaf.userData.garage = true;
      } else {
        box(leaf, [0.88, 2.25, 0.06], MAT.wood('#3a1e10'), [0, 1.125, 0]);
        for (const y of [0.6, 1.6]) box(leaf, [0.6, 0.7, 0.07], MAT.wood('#5a3620'), [0, y, 0]);
        sphere(leaf, 0.035, MAT.metal('#b8913e', 0.25), [0.33, 1.05, 0.05]);
      }
      group.add(leaf);
      colliders.push(leaf);
      lockedDoors.set(d.id, leaf);
    }
  }

  // ── Mobilier ──
  const fires: THREE.Object3D[] = [];
  const waters: THREE.Mesh[] = [];
  const screens: THREE.Mesh[] = [];
  for (const f of allFurniture()) {
    const fg = buildFurniture(f, fires, waters);
    fg.traverse((o) => o.name === 'screen' && screens.push(o as THREE.Mesh));
    fg.userData.level = levelOf(f.x);
    group.add(fg);
  }

  // ── Tableaux aux murs ──
  for (const [lvl, x, z, ry] of PAINTINGS) {
    const g = new THREE.Group();
    g.position.set(x, levelBase(lvl) + 1.65, z);
    g.rotation.y = ry;
    g.userData.placed = true;
    g.userData.level = lvl;
    box(g, [0.8, 0.62, 0.04], MAT.metal('#a8843e', 0.35), [0, 0, 0.02]);
    const c = new THREE.Mesh(new THREE.PlaneGeometry(0.68, 0.5), new THREE.MeshStandardMaterial({ map: paintingTexture(), roughness: 0.85 }));
    c.position.z = 0.045;
    g.add(c);
    group.add(g);
  }

  // ── Plafonds, lampes, lumières ──
  const sources: LightSource[] = [];
  const bulbMats = new Set<THREE.MeshStandardMaterial>();
  if (inGame) {
    for (const r of ROOMS) {
      if (r.outdoor || r.level === 2) continue;
      const st = styleOf(r);
      const mat = st.ceiling ? st.ceiling(r.rect.w, r.rect.h) : MAT.plaster();
      const holed = tilesOfRect(r.rect).some(([x, y]) => underVoid(x, y));
      const c = holed ? new THREE.Mesh(tiledPlane(r.rect, underVoid, false)!, mat) : new THREE.Mesh(new THREE.PlaneGeometry(r.rect.w + 1, r.rect.h + 1), mat);
      c.userData.level = r.level ?? 0;
      if (holed) c.position.y = WALL_H;
      else {
        c.rotation.x = Math.PI / 2;
        c.position.set(r.rect.x + r.rect.w / 2, WALL_H, r.rect.y + r.rect.h / 2);
      }
      c.receiveShadow = true;
      c.castShadow = true;
      group.add(c);
      colliders.push(c);
    }
    // plafond des cages d'escalier
    for (const [k] of shaftStyle) {
      const [x, y] = k.split(',').map(Number);
      const c = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), MAT.plaster());
      c.rotation.x = Math.PI / 2;
      c.position.set(x + 0.5, WALL_H, y + 0.5);
      c.userData.level = tileLevel(x);
      c.castShadow = true;
      group.add(c);
      colliders.push(c);
    }
  }
  for (const r of ROOMS) {
    if (r.outdoor) continue;
    const st = styleOf(r);
    const lvl = r.level ?? 0;
    // longues pièces (couloir, palier, grenier) : une lampe tous les ~9 m
    const long = Math.max(r.rect.w, r.rect.h);
    const n = Math.max(1, Math.round(long / 9));
    const alongX = r.rect.w >= r.rect.h;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      let lx = alongX ? r.rect.x + r.rect.w * t : r.rect.x + r.rect.w / 2;
      const lz = alongX ? r.rect.y + r.rect.h / 2 : r.rect.y + r.rect.h * t;
      // jamais au-dessus d'une trémie
      if (isVoid(Math.floor(lx), Math.floor(lz)) || underVoid(Math.floor(lx), Math.floor(lz))) lx -= 2;
      const ceilY = lvl === 2 ? Math.min(3.6, atticH(lz)) : WALL_H;
      const lamp = lampMesh(st.lamp, ceilY, bulbMats);
      lamp.position.set(lx, 0, lz);
      lamp.userData.level = lvl;
      group.add(lamp);
      const span = alongX ? r.rect.w / n : r.rect.h / n;
      sources.push({
        color: st.light,
        intensity: st.power ?? ROOM_LIGHT,
        distance: Math.max(Math.max(span, alongX ? r.rect.h : r.rect.w) * 1.5, 6),
        decay: 1.5,
        pos: new THREE.Vector3(localX(lx), levelBase(lvl) + ceilY - 0.85, lz),
        room: r.id,
        level: lvl,
        shadowable: true,
      });
    }
  }
  // Éclairage à coût constant : un petit réservoir de lampes est attribué aux sources les plus proches
  // du joueur (ou de la caméra) ; la lampe de la pièce courante est un projecteur vers le bas qui
  // porte les ombres (une seule carte d'ombre, au lieu des 6 faces d'une lampe ponctuelle).
  const pool = Array.from({ length: LIGHT_POOL }, () => {
    const l = new THREE.PointLight('#ffc98a', 0, 8, 1.5);
    l.userData.placed = true;
    group.add(l);
    return { light: l, src: null as LightSource | null };
  });
  const shadowLamp = new THREE.SpotLight('#ffc98a', 0, 14, 1.25, 0.6, 1.5);
  shadowLamp.castShadow = inGame;
  shadowLamp.shadow.mapSize.set(1024, 1024);
  shadowLamp.shadow.bias = -0.002;
  shadowLamp.shadow.camera.near = 0.2;
  shadowLamp.userData.placed = true;
  shadowLamp.target.userData.placed = true;
  group.add(shadowLamp, shadowLamp.target);
  let shadowSrc: LightSource | null = null;
  let focused: string | undefined;
  let blackout = false;
  const lastFocus = new THREE.Vector2(Infinity, Infinity);

  // ── Extérieur : lanternes, perron ──
  for (const [x, z] of LANTERNS) {
    const wallMounted = x > 48 && x < 49;
    if (!wallMounted) cyl(group, 0.05, 0.07, 2.4, MAT.paint('#151515', 0.5), [x, 1.2, z]);
    else box(group, [0.3, 0.06, 0.06], MAT.paint('#151515', 0.5), [x - 0.15, 2.3, z]);
    box(group, [0.22, 0.32, 0.22], MAT.glow('#ffd29a', 2.2), [x, 2.5, z]);
    sources.push({ color: '#ffb66b', intensity: 10, distance: 9, decay: 1.6, pos: new THREE.Vector3(x, 2.45, z), level: 0, outdoor: true });
  }
  box(group, [3, 0.12, 1.2], MAT.marble(2, 1), [21, 0.06, 23.6]);

  // ── Cabanes perchées : plancher sur poutres, garde-corps et parois en planches, toit à deux pans ──
  for (const r of ROOMS.filter((x) => x.treehouse)) buildTreehouse(group, colliders, r);

  // ── Toit à deux pans (tuiles), pignons en brique, cheminées ; sous-face en planches (grenier) ──
  buildRoof(group, colliders, inGame);

  // Niveaux : tout ce qui a été construit dans la bande d'un niveau est replacé à sa hauteur
  const levelGroups = new Map<Level | 'site', THREE.Group>();
  for (const l of [...LEVELS, 'site'] as const) {
    const lg = new THREE.Group();
    lg.userData.levelGroup = l;
    levelGroups.set(l, lg);
  }
  for (const c of [...group.children]) {
    const lvl: Level | undefined = c.userData.level ?? (c.userData.placed ? undefined : levelOf(c.position.x));
    if (!c.userData.placed && lvl !== undefined) {
      c.position.x -= levelOffset(lvl);
      c.position.y += levelBase(lvl);
    }
    if (c.userData.placed && (c as THREE.Light).isLight) continue;
    levelGroups.get(lvl ?? 'site')!.add(c);
  }
  for (const lg of levelGroups.values()) group.add(lg);
  // sources déclarées par le mobilier (cheminées, lanternes…)
  group.updateMatrixWorld(true);
  const keep = new Set<THREE.Object3D>([...colliders, ...exteriorWindows.map((w) => w.mesh)]);
  for (const lg of levelGroups.values()) mergeStatic(lg, keep);
  group.traverse((o) => {
    const def = o.userData.light as LightSourceDef | undefined;
    if (!def) return;
    const pos = o.getWorldPosition(new THREE.Vector3());
    const room = roomById(def.room);
    sources.push({ ...def, pos, level: def.level ?? 0, outdoor: !!room?.outdoor });
  });
  const intensityOf = (src: LightSource) => (src.fire ? src.intensity : blackout ? 0 : src.intensity);
  let focusLevel: Level = 0;
  let focusOutdoor = true;
  const assign = (x: number, z: number) => {
    // pas de fuite de lumière d'un étage à l'autre : seules les sources du niveau courant comptent
    // (dehors : lanternes et cabanes d'abord, puis les pièces du rez-de-chaussée derrière les fenêtres)
    const eligible = (s: LightSource) => (focusOutdoor ? s.outdoor || (s.level === 0 && focusLevel === 0) : s.level === focusLevel && !s.outdoor);
    shadowSrc =
      sources
        .filter((src) => src.shadowable && src.room === focused)
        .sort((a, b) => Math.hypot(a.pos.x - x, a.pos.z - z) - Math.hypot(b.pos.x - x, b.pos.z - z))[0] ?? null;
    const ranked = sources
      .filter((src) => src !== shadowSrc && eligible(src))
      .map((src) => ({ src, d: Math.hypot(src.pos.x - x, src.pos.z - z) - (src.room && src.room === focused ? 100 : 0) + (focusOutdoor && !src.outdoor ? 12 : 0) }))
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
      p.light.intensity = intensityOf(src);
    });
    if (shadowSrc) {
      shadowLamp.position.copy(shadowSrc.pos);
      shadowLamp.target.position.set(shadowSrc.pos.x, shadowSrc.pos.y - 3, shadowSrc.pos.z);
      shadowLamp.color.set(shadowSrc.color);
      shadowLamp.distance = shadowSrc.distance;
      shadowLamp.intensity = intensityOf(shadowSrc) * 1.6;
    } else shadowLamp.intensity = 0;
  };
  // Niveaux affichés : celui du joueur et ses voisins (on voit par les trémies) ; le reste est masqué
  const showLevels = (l: Level, outdoor: boolean) => {
    for (const [k, lg] of levelGroups) {
      if (k === 'site') continue;
      lg.visible = !inGame ? k === 0 || k === 1 : outdoor ? k === 0 || k === 1 || (k === 2 && l === 2) : Math.abs(k - l) <= 1;
    }
  };
  showLevels(0, true);
  // sans focus explicite (vues extérieures), on éclaire autour de l'entrée
  assign(DRIVEWAY_X, WORLD_H - 4);

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
        if (obj.userData.garage) {
          // la porte basculante remonte sous le linteau
          obj.position.y = 2.0;
          obj.scale.y = 0.12;
        } else {
          // la porte pivote et reste ouverte contre le mur
          obj.rotation.y += Math.PI / 2;
          obj.position.x += Math.sin(obj.rotation.y) * 0.45;
          obj.position.z += Math.cos(obj.rotation.y) * 0.45;
        }
        const i = colliders.indexOf(obj);
        if (i >= 0) colliders.splice(i, 1);
        lockedDoors.delete(id);
      }
    },
    focus(x, z, roomId, y = 0) {
      // réattribution seulement quand on change de pièce ou qu'on a bougé d'au moins 1,5 m
      if (roomId === focused && Math.hypot(x - lastFocus.x, z - lastFocus.y) < 1.5) return;
      const room = roomById(roomId);
      focused = roomId;
      focusLevel = room ? room.level ?? 0 : (Math.max(-1, Math.min(2, Math.floor((y + 0.5) / LEVEL_HEIGHT))) as Level);
      focusOutdoor = room ? !!room.outdoor : true;
      lastFocus.set(x, z);
      showLevels(focusLevel, focusOutdoor);
      assign(x, z);
    },
    setShadows(on) {
      shadowLamp.castShadow = inGame && on;
    },
    update(t) {
      for (const f of fires) ((f as THREE.Mesh).material as THREE.MeshStandardMaterial).emissiveIntensity = 2.2 + Math.sin(t * 13) * 0.4;
      for (const p of pool) if (p.src?.fire) p.light.intensity = p.src.intensity - 1 + Math.sin(t * 11) * 1.2 + Math.sin(t * 17.3) * 0.8;
      for (const w of waters) {
        const m = w.material as THREE.MeshStandardMaterial;
        if (m.normalMap) m.normalMap.offset.set(t * 0.02, t * 0.013);
      }
    },
  };
}

function tilesOfRect(r: { x: number; y: number; w: number; h: number }): [number, number][] {
  const out: [number, number][] = [];
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) out.push([x, y]);
  return out;
}
const VOID_KEYS: [number, number][] = PORTALS.flatMap((p) => tilesOfRect({ x: gridX((p.level + 1) as Level, p.x), y: p.y, w: p.w, h: p.h }));

/** Toit de la maison (coordonnées locales, déjà « placé »). */
function buildRoof(group: THREE.Group, colliders: THREE.Object3D[], inGame: boolean) {
  const roof = new THREE.Group();
  roof.userData.placed = true;
  group.add(roof);
  const len = HOUSE.x1 - HOUSE.x0 + 1.2;
  const xMid = (HOUSE.x0 + HOUSE.x1) / 2;
  const slope = Math.hypot(ROOF_HALF, RIDGE_H);
  const a = Math.atan2(RIDGE_H, ROOF_HALF);
  const T = 0.14;
  const tiles = MAT.shingles(len, slope);
  const planks = MAT.hardwood(len, slope, '#9a7a5a');
  for (const s of [-1, 1]) {
    // s = −1 : pan nord (monte vers +z), s = +1 : pan sud
    const zc = ROOF_ZC + s * (ROOF_HALF / 2);
    const yc = EAVE_Y + RIDGE_H / 2;
    const n = new THREE.Vector3(0, Math.cos(a), s * Math.sin(a));
    const pan = new THREE.Mesh(new THREE.BoxGeometry(len, T, slope + 0.02), tiles);
    pan.rotation.x = s < 0 ? -a : a;
    pan.position.set(xMid, yc, zc).addScaledVector(n, T / 2);
    pan.castShadow = true;
    pan.receiveShadow = true;
    roof.add(pan);
    colliders.push(pan);
    if (inGame) {
      // sous-face en planches, visible depuis le grenier
      const under = new THREE.Mesh(new THREE.PlaneGeometry(len, slope), planks);
      under.rotation.x = (s < 0 ? -a : a) + Math.PI / 2;
      under.position.set(xMid, yc, zc).addScaledVector(n, -0.004);
      roof.add(under);
    }
  }
  // faîtière
  box(roof, [len, 0.16, 0.3], MAT.paint('#3a1d18', 0.8), [xMid, EAVE_Y + RIDGE_H + 0.1, ROOF_ZC]);
  // pignons (brique), juste derrière la face intérieure des murs d'extrémité
  const shape = new THREE.Shape();
  shape.moveTo(HOUSE.z0, EAVE_Y - 0.3);
  shape.lineTo(HOUSE.z0, roofY(HOUSE.z0));
  shape.lineTo(ROOF_ZC, roofY(ROOF_ZC));
  shape.lineTo(HOUSE.z1, roofY(HOUSE.z1));
  shape.lineTo(HOUSE.z1, EAVE_Y - 0.3);
  shape.closePath();
  const gableGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.98, bevelEnabled: false });
  for (const x of [HOUSE.x0 + 0.98, HOUSE.x1]) {
    const gable = new THREE.Mesh(gableGeo, MAT.brick(1, 0.6667));
    gable.rotation.y = -Math.PI / 2;
    gable.position.set(x, 0, 0);
    gable.castShadow = true;
    gable.receiveShadow = true;
    roof.add(gable);
    colliders.push(gable);
  }
  // cheminées (au-dessus des foyers du salon et de la cuisine), hors du grenier
  for (const [x, z] of [[24, 6.2], [4.5, 6.2]] as const) {
    const top = roofY(z) + 1.4;
    box(roof, [1.0, top - EAVE_Y, 0.9], MAT.brick(1, 2.6), [x, (top + EAVE_Y) / 2, z]);
    box(roof, [1.15, 0.12, 1.05], MAT.paint('#6a625a', 0.8), [x, top + 0.06, z]);
  }
}

/** Cabane perchée : plateforme au niveau de l'étage (LEVEL_HEIGHT), au-dessus du verger. */
function buildTreehouse(group: THREE.Group, colliders: THREE.Object3D[], r: RoomDef) {
  const g = new THREE.Group();
  g.userData.placed = true;
  group.add(g);
  const x0 = localX(r.rect.x);
  const x1 = x0 + r.rect.w;
  const z0 = r.rect.y;
  const z1 = z0 + r.rect.h;
  const Y = LEVEL_HEIGHT;
  const plank = MAT.wood('#8a6038');
  const beam = MAT.wood('#5a3a22');
  // plancher et poutres porteuses
  box(g, [r.rect.w + 0.3, 0.2, r.rect.h + 0.3], plank, [(x0 + x1) / 2, Y - 0.105, (z0 + z1) / 2]);
  for (const z of [z0 + 0.5, z1 - 0.5]) box(g, [r.rect.w + 0.6, 0.22, 0.18], beam, [(x0 + x1) / 2, Y - 0.32, z]);
  // garde-corps (1 m) et parois de la cabane (2,2 m) côté nord et ouest ; ouverture au-dessus de l'échelle
  const open = (gx: number, y: number) => openTiles.has(`${gx},${y}`);
  const side = (ax: number, az: number, bx: number, bz: number, tall: boolean, gaps: boolean[]) => {
    const n = gaps.length;
    for (let i = 0; i < n; i++) {
      if (gaps[i]) continue;
      const t0 = i / n;
      const t1 = (i + 1) / n;
      const sx = ax + (bx - ax) * t0;
      const sz = az + (bz - az) * t0;
      const ex = ax + (bx - ax) * t1;
      const ez = az + (bz - az) * t1;
      const h = tall ? 2.2 : 1.0;
      const w = Math.hypot(ex - sx, ez - sz);
      const m = box(g, [w + 0.06, h, 0.07], plank, [(sx + ex) / 2, Y + h / 2, (sz + ez) / 2], [0, -Math.atan2(ez - sz, ex - sx), 0]);
      colliders.push(m);
      if (tall && i % 2 === 1) box(g, [0.5, 0.4, 0.08], MAT.paint('#1a1410', 0.9), [(sx + ex) / 2, Y + 1.5, (sz + ez) / 2], [0, -Math.atan2(ez - sz, ex - sx), 0]); // lucarne
    }
  };
  const row = (y: number) => Array.from({ length: r.rect.w }, (_, i) => open(r.rect.x + i, y));
  const col = (x: number) => Array.from({ length: r.rect.h }, (_, i) => open(x, z0 + i));
  side(x0, z0, x1, z0, true, row(z0 - 1));
  side(x0, z0, x0, z1, true, col(r.rect.x - 1));
  side(x0, z1, x1, z1, false, row(z1));
  side(x1, z0, x1, z1, false, col(r.rect.x + r.rect.w));
  // poteaux d'angle de la toiture
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) box(g, [0.14, 2.45, 0.14], beam, [x, Y + 1.22, z]);
  // toit à deux pans (faîtage est-ouest)
  const half = r.rect.h / 2 + 0.35;
  const rise = 1.0;
  const a = Math.atan2(rise, half);
  const slope = Math.hypot(half, rise);
  for (const s of [-1, 1]) {
    const pan = box(g, [r.rect.w + 0.6, 0.08, slope], MAT.wood('#4a3020'), [(x0 + x1) / 2, Y + 2.45 + rise / 2, (z0 + z1) / 2 + s * (half / 2)], [s < 0 ? -a : a, 0, 0]);
    colliders.push(pan);
  }
  // pignons en planches
  const tri = new THREE.Shape();
  tri.moveTo(z0 - 0.05, 0);
  tri.lineTo(z1 + 0.05, 0);
  tri.lineTo((z0 + z1) / 2, rise);
  tri.closePath();
  for (const x of [x0, x1]) {
    const m = new THREE.Mesh(new THREE.ShapeGeometry(tri), new THREE.MeshStandardMaterial({ color: '#7a5532', roughness: 0.9, side: THREE.DoubleSide }));
    m.rotation.y = -Math.PI / 2;
    m.position.set(x, Y + 2.45, 0);
    g.add(m);
  }
}
