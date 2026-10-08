import { FURNISHING } from './furnishing';
/**
 * La Villa Beaumont — premier environnement.
 * Le plan est décrit en données (pièces rectangulaires, portes, mobilier) puis
 * converti en grille de tuiles par buildWorldGrid(). Ajouter une pièce = ajouter une entrée.
 *
 * Étages : la grille contient le rez-de-chaussée (x < LEVEL_OFFSET_X) et, à sa droite, l'étage
 * (x ≥ LEVEL_OFFSET_X). Le serveur raisonne en 2D sur cette grille ; le rendu 3D replace l'étage
 * au-dessus du rez-de-chaussée (x − LEVEL_OFFSET_X, hauteur LEVEL_HEIGHT). L'escalier du hall est
 * une rampe praticable : en haut, une transition invisible fait passer d'un niveau à l'autre.
 */

export interface RoomDef {
  id: string;
  name: string;
  rect: { x: number; y: number; w: number; h: number };
  floor: 'wood' | 'tile' | 'stone' | 'grass' | 'gravel' | 'carpet' | 'concrete';
  floorColor: string;
  outdoor?: boolean;
  /** Le sol salit les chaussures (boue). */
  muddy?: boolean;
  /** Couverte par la caméra de sécurité. */
  camera?: boolean;
  hasSink?: boolean;
  /** 0 = rez-de-chaussée, 1 = étage */
  level?: 0 | 1;
}

export interface DoorDef {
  id: string;
  x: number;
  y: number;
  rooms: [string, string];
  /** type d'objet clé permettant d'ouvrir */
  lockedBy?: string;
  label?: string;
}

export interface FurnitureDef {
  id: string;
  roomId: string;
  name: string;
  kind:
    | 'counter'
    | 'table'
    | 'sofa'
    | 'piano'
    | 'shelf'
    | 'desk'
    | 'terminal'
    | 'bath'
    | 'sink'
    | 'bed'
    | 'wardrobe'
    | 'clock'
    | 'fountain'
    | 'hedge'
    | 'tree'
    | 'car'
    | 'fireplace'
    | 'crate'
    | 'stairs'
    | 'railing'
    | 'armchair'
    | 'chair'
    | 'bookcase'
    | 'plant'
    | 'floor_lamp'
    | 'sideboard'
    | 'nightstand'
    | 'dresser'
    | 'fridge'
    | 'stove'
    | 'toilet'
    | 'washbasin'
    | 'tv'
    | 'workbench'
    | 'barrel'
    | 'bench'
    | 'coat_rack'
    | 'easel'
    | 'globe'
    | 'harp'
    | 'chest';
  x: number;
  y: number;
  w: number;
  h: number;
  /** Peut servir de cachette. */
  hiding?: boolean;
  /** On peut marcher dessus (escalier). */
  walkable?: boolean;
  /** Orientation forcée : côté du mur contre lequel le meuble est adossé (sinon : mur le plus proche). */
  facing?: 'n' | 's' | 'e' | 'w';
}

/** Emprise de la maison et de son terrain (un niveau). */
export const WORLD_W = 48;
export const WORLD_H = 28;
/** Décalage, dans la grille, des tuiles de l'étage. */
export const LEVEL_OFFSET_X = 50;
/** Largeur totale de la grille (rez-de-chaussée + étage). */
export const GRID_W = LEVEL_OFFSET_X + WORLD_W;
/** Hauteur d'un niveau (sol à sol), en mètres. */
export const LEVEL_HEIGHT = 3.3;

/** Coordonnées « étage » : on décrit l'étage dans le repère du rez-de-chaussée. */
const up = <T extends { x: number }>(o: T): T => ({ ...o, x: o.x + LEVEL_OFFSET_X });
const upRect = (x: number, y: number, w: number, h: number) => ({ x: x + LEVEL_OFFSET_X, y, w, h });

/** Escalier du hall (rez-de-chaussée) : rampe praticable du nord (bas) vers le sud (haut). */
export const STAIRS = { x: 26, y: 17, w: 3, h: 4 } as const;
/** Seuils de transition (avec hystérésis) entre le haut de l'escalier et le palier de l'étage. */
const STAIR_UP_Y = STAIRS.y + STAIRS.h - 0.3;
const LANDING_ARRIVAL_Y = STAIRS.y + STAIRS.h + 0.6;
const LANDING_DOWN_Y = STAIRS.y + STAIRS.h + 0.4;
const STAIR_ARRIVAL_Y = STAIRS.y + STAIRS.h - 0.55;

export const levelOf = (x: number): 0 | 1 => (x >= LEVEL_OFFSET_X - 1 ? 1 : 0);
/** Abscisse dans le repère du rez-de-chaussée (pour le rendu). */
export const localX = (x: number) => (levelOf(x) ? x - LEVEL_OFFSET_X : x);
const inStairs = (x: number, y: number) => x >= STAIRS.x && x < STAIRS.x + STAIRS.w && y >= STAIRS.y && y < STAIRS.y + STAIRS.h;

/** Hauteur du sol (m) sous une position de la grille : niveau + rampe de l'escalier. */
export function elevationAt(x: number, y: number): number {
  if (levelOf(x)) return LEVEL_HEIGHT;
  if (!inStairs(x, y)) return 0;
  return Math.min(1, Math.max(0, (y - STAIRS.y) / STAIRS.h)) * LEVEL_HEIGHT;
}

/** Transition d'étage : retourne la nouvelle position si l'on vient de franchir le haut de l'escalier. */
export function applyPortal(x: number, y: number): { x: number; y: number } | null {
  if (!levelOf(x) && x >= STAIRS.x && x < STAIRS.x + STAIRS.w && y > STAIR_UP_Y && y < STAIRS.y + STAIRS.h) return { x: x + LEVEL_OFFSET_X, y: LANDING_ARRIVAL_Y };
  const lx = x - LEVEL_OFFSET_X;
  if (levelOf(x) && lx >= STAIRS.x && lx < STAIRS.x + STAIRS.w && y < LANDING_DOWN_Y && y > STAIRS.y + STAIRS.h) return { x: lx, y: STAIR_ARRIVAL_Y };
  return null;
}

/** Rampes de l'escalier : on n'y entre (et n'en sort) que par la première marche. */
export function stepAllowed(ax: number, ay: number, bx: number, by: number): boolean {
  if (levelOf(ax) || levelOf(bx)) return true;
  const a = inStairs(ax, ay);
  const b = inStairs(bx, by);
  if (a === b) return true;
  return Math.min(ay, by) < STAIRS.y + 0.6;
}

export const ROOMS: RoomDef[] = [
  { id: 'garden', name: 'Jardin', rect: { x: 1, y: 1, w: 46, h: 4 }, floor: 'grass', floorColor: '#1f3a26', outdoor: true, muddy: true },
  { id: 'kitchen', name: 'Cuisine', rect: { x: 1, y: 6, w: 10, h: 7 }, floor: 'tile', floorColor: '#3d3f45', hasSink: true },
  { id: 'living', name: 'Salon', rect: { x: 12, y: 6, w: 17, h: 7 }, floor: 'wood', floorColor: '#4a3426' },
  { id: 'office', name: 'Bureau', rect: { x: 30, y: 6, w: 8, h: 7 }, floor: 'carpet', floorColor: '#2c3a4a' },
  { id: 'bathroom', name: 'Salle de bain', rect: { x: 39, y: 6, w: 8, h: 7 }, floor: 'tile', floorColor: '#3b4c55', hasSink: true },
  { id: 'cellar', name: 'Cave & garage', rect: { x: 1, y: 14, w: 10, h: 8 }, floor: 'concrete', floorColor: '#2c2b29' },
  { id: 'hall', name: 'Hall', rect: { x: 12, y: 14, w: 17, h: 8 }, floor: 'stone', floorColor: '#45403a', camera: true },
  { id: 'corridor', name: 'Couloir', rect: { x: 30, y: 14, w: 17, h: 2 }, floor: 'wood', floorColor: '#3e2c20' },
  { id: 'bedroom1', name: 'Chambre bleue', rect: { x: 30, y: 17, w: 8, h: 5 }, floor: 'carpet', floorColor: '#243049' },
  { id: 'bedroom2', name: 'Chambre de maître', rect: { x: 39, y: 17, w: 8, h: 5 }, floor: 'carpet', floorColor: '#43242c' },
  { id: 'exterior', name: 'Allée extérieure', rect: { x: 1, y: 23, w: 46, h: 4 }, floor: 'gravel', floorColor: '#34332f', outdoor: true, camera: true },
  // ── Étage ──
  { id: 'library', name: 'Bibliothèque', rect: upRect(1, 6, 12, 7), floor: 'wood', floorColor: '#3e2a1e', level: 1 },
  { id: 'guestroom', name: "Chambre d'amis", rect: upRect(1, 14, 12, 8), floor: 'carpet', floorColor: '#3a3226', level: 1 },
  { id: 'musicroom', name: 'Salon de musique', rect: upRect(14, 6, 14, 12), floor: 'wood', floorColor: '#4a3426', level: 1 },
  { id: 'suite', name: 'Suite parentale', rect: upRect(29, 6, 9, 12), floor: 'carpet', floorColor: '#3a2430', level: 1 },
  { id: 'bathroom2', name: "Salle de bain de l'étage", rect: upRect(39, 6, 8, 6), floor: 'tile', floorColor: '#3b4c55', hasSink: true, level: 1 },
  { id: 'studio', name: 'Atelier', rect: upRect(39, 13, 8, 9), floor: 'wood', floorColor: '#5a4632', level: 1 },
  { id: 'landing', name: 'Palier', rect: upRect(14, 19, 24, 3), floor: 'wood', floorColor: '#3e2c20', level: 1 },
];

export const DOORS: DoorDef[] = [
  { id: 'd_garden_kitchen', x: 5, y: 5, rooms: ['garden', 'kitchen'] },
  { id: 'd_garden_living_a', x: 19, y: 5, rooms: ['garden', 'living'] },
  { id: 'd_garden_living_b', x: 20, y: 5, rooms: ['garden', 'living'] },
  { id: 'd_kitchen_living', x: 11, y: 9, rooms: ['kitchen', 'living'] },
  { id: 'd_living_office', x: 29, y: 9, rooms: ['living', 'office'] },
  { id: 'd_living_hall_a', x: 20, y: 13, rooms: ['living', 'hall'] },
  { id: 'd_living_hall_b', x: 21, y: 13, rooms: ['living', 'hall'] },
  { id: 'd_kitchen_cellar', x: 5, y: 13, rooms: ['kitchen', 'cellar'], lockedBy: 'key_cellar', label: 'Porte de la cave' },
  { id: 'd_hall_corridor_a', x: 29, y: 14, rooms: ['hall', 'corridor'] },
  { id: 'd_hall_corridor_b', x: 29, y: 15, rooms: ['hall', 'corridor'] },
  { id: 'd_corridor_bathroom', x: 42, y: 13, rooms: ['corridor', 'bathroom'] },
  { id: 'd_corridor_bedroom1', x: 33, y: 16, rooms: ['corridor', 'bedroom1'] },
  { id: 'd_corridor_bedroom2', x: 43, y: 16, rooms: ['corridor', 'bedroom2'] },
  { id: 'd_hall_exterior_a', x: 20, y: 22, rooms: ['hall', 'exterior'] },
  { id: 'd_hall_exterior_b', x: 21, y: 22, rooms: ['hall', 'exterior'] },
  { id: 'd_cellar_exterior', x: 6, y: 22, rooms: ['cellar', 'exterior'], lockedBy: 'key_cellar', label: 'Porte du garage' },
  // ── Étage ──
  up({ id: 'd_library_guest', x: 6, y: 13, rooms: ['library', 'guestroom'] as [string, string] }),
  up({ id: 'd_library_music', x: 13, y: 9, rooms: ['library', 'musicroom'] as [string, string] }),
  up({ id: 'd_guest_landing', x: 13, y: 20, rooms: ['guestroom', 'landing'] as [string, string] }),
  up({ id: 'd_music_landing_a', x: 19, y: 18, rooms: ['musicroom', 'landing'] as [string, string] }),
  up({ id: 'd_music_landing_b', x: 20, y: 18, rooms: ['musicroom', 'landing'] as [string, string] }),
  up({ id: 'd_suite_landing', x: 33, y: 18, rooms: ['suite', 'landing'] as [string, string] }),
  up({ id: 'd_bath2_studio', x: 42, y: 12, rooms: ['bathroom2', 'studio'] as [string, string] }),
  up({ id: 'd_studio_landing', x: 38, y: 20, rooms: ['studio', 'landing'] as [string, string] }),
];

/** Mobilier principal (meubles nommés, cachettes) + ameublement/décoration (furnishing.ts). */
let allCache: FurnitureDef[] | null = null;
export function allFurniture(): FurnitureDef[] {
  return (allCache ??= [...FURNITURE, ...FURNISHING]);
}

export const FURNITURE: FurnitureDef[] = [
  // Cuisine
  { id: 'f_kitchen_counter', roomId: 'kitchen', name: 'Plan de travail', kind: 'counter', x: 1, y: 6, w: 3, h: 1, hiding: true },
  { id: 'f_kitchen_sink', roomId: 'kitchen', name: 'Évier', kind: 'sink', x: 7, y: 6, w: 2, h: 1 },
  { id: 'f_kitchen_table', roomId: 'kitchen', name: 'Table de cuisine', kind: 'table', x: 4, y: 9, w: 3, h: 2, hiding: true },
  // Salon
  { id: 'f_living_sofa', roomId: 'living', name: 'Canapé', kind: 'sofa', x: 13, y: 7, w: 4, h: 1, hiding: true },
  { id: 'f_living_table', roomId: 'living', name: 'Table basse', kind: 'table', x: 14, y: 9, w: 2, h: 1 },
  { id: 'f_living_piano', roomId: 'living', name: 'Piano à queue', kind: 'piano', x: 24, y: 7, w: 3, h: 2, hiding: true },
  { id: 'f_living_fireplace', roomId: 'living', name: 'Cheminée', kind: 'fireplace', x: 12, y: 11, w: 1, h: 2, hiding: true },
  // Bureau
  { id: 'f_office_desk', roomId: 'office', name: 'Bureau en chêne', kind: 'desk', x: 32, y: 8, w: 3, h: 1, hiding: true },
  { id: 'f_office_terminal', roomId: 'office', name: 'Moniteur de surveillance', kind: 'terminal', x: 37, y: 7, w: 1, h: 1 },
  { id: 'f_office_shelf', roomId: 'office', name: 'Bibliothèque', kind: 'shelf', x: 31, y: 12, w: 4, h: 1, hiding: true },
  // Salle de bain
  { id: 'f_bath_tub', roomId: 'bathroom', name: 'Baignoire', kind: 'bath', x: 44, y: 7, w: 3, h: 2, hiding: true },
  { id: 'f_bath_sink', roomId: 'bathroom', name: 'Lavabo', kind: 'sink', x: 39, y: 7, w: 1, h: 1 },
  // Cave
  { id: 'f_cellar_shelf', roomId: 'cellar', name: 'Étagères à vin', kind: 'shelf', x: 1, y: 15, w: 1, h: 5, hiding: true },
  { id: 'f_cellar_crate', roomId: 'cellar', name: 'Caisses', kind: 'crate', x: 8, y: 18, w: 2, h: 2, hiding: true },
  // Hall
  { id: 'f_hall_clock', roomId: 'hall', name: 'Horloge de parquet', kind: 'clock', x: 12, y: 14, w: 1, h: 1 },
  { id: 'f_hall_console', roomId: 'hall', name: 'Console', kind: 'table', x: 25, y: 14, w: 2, h: 1, hiding: true },
  { id: 'f_hall_stairs', roomId: 'hall', name: 'Escalier', kind: 'stairs', ...STAIRS, walkable: true },
  up({ id: 'f_landing_railing', roomId: 'landing', name: "Rambarde de l'escalier", kind: 'railing' as const, x: STAIRS.x, y: 19, w: STAIRS.w, h: 2 }),
  // Chambres
  { id: 'f_bed1', roomId: 'bedroom1', name: 'Lit', kind: 'bed', x: 30, y: 19, w: 2, h: 3, hiding: true },
  { id: 'f_wardrobe1', roomId: 'bedroom1', name: 'Armoire', kind: 'wardrobe', x: 37, y: 19, w: 1, h: 2, hiding: true },
  { id: 'f_bed2', roomId: 'bedroom2', name: 'Lit à baldaquin', kind: 'bed', x: 44, y: 19, w: 3, h: 3, hiding: true },
  { id: 'f_dresser2', roomId: 'bedroom2', name: 'Coiffeuse', kind: 'desk', x: 39, y: 21, w: 2, h: 1, hiding: true },
  // Jardin
  { id: 'f_garden_fountain', roomId: 'garden', name: 'Fontaine', kind: 'fountain', x: 9, y: 2, w: 2, h: 2, hiding: true },
  { id: 'f_garden_hedge', roomId: 'garden', name: 'Haie taillée', kind: 'hedge', x: 30, y: 1, w: 6, h: 1, hiding: true },
  { id: 'f_garden_tree', roomId: 'garden', name: 'Vieux chêne', kind: 'tree', x: 41, y: 2, w: 2, h: 2 },
  // Extérieur
  { id: 'f_ext_car', roomId: 'exterior', name: 'Voiture de collection', kind: 'car', x: 32, y: 24, w: 4, h: 2, hiding: true },
];

/** Points d'apparition des joueurs (hall d'entrée). */
export const PLAYER_SPAWNS: { x: number; y: number }[] = [
  { x: 18.5, y: 19.5 }, { x: 20.5, y: 19.5 }, { x: 22.5, y: 19.5 }, { x: 24.5, y: 19.5 },
  { x: 18.5, y: 17.5 }, { x: 20.5, y: 17.5 }, { x: 22.5, y: 17.5 }, { x: 24.5, y: 17.5 },
];

export const TILE_WALL = 0;

export interface WorldGrid {
  w: number;
  h: number;
  /** index de pièce + 1 (0 = mur) */
  rooms: Uint8Array;
  /** tuile bloquée par du mobilier */
  blocked: Uint8Array;
  /** index de porte + 1 si la tuile est une porte */
  doors: Uint8Array;
}

export function buildWorldGrid(): WorldGrid {
  const W = GRID_W;
  const size = W * WORLD_H;
  const g: WorldGrid = { w: W, h: WORLD_H, rooms: new Uint8Array(size), blocked: new Uint8Array(size), doors: new Uint8Array(size) };
  ROOMS.forEach((r, i) => {
    for (let y = r.rect.y; y < r.rect.y + r.rect.h; y++)
      for (let x = r.rect.x; x < r.rect.x + r.rect.w; x++) g.rooms[y * W + x] = i + 1;
  });
  DOORS.forEach((d, i) => {
    const idx = d.y * W + d.x;
    g.rooms[idx] = ROOMS.findIndex((r) => r.id === d.rooms[0]) + 1;
    g.doors[idx] = i + 1;
  });
  for (const f of allFurniture()) {
    if (f.walkable) continue;
    for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) g.blocked[y * W + x] = 1;
  }
  return g;
}

export function roomAt(g: WorldGrid, x: number, y: number): RoomDef | null {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= g.w || ty >= g.h) return null;
  const r = g.rooms[ty * g.w + tx];
  return r ? ROOMS[r - 1] : null;
}

export function doorAt(g: WorldGrid, tx: number, ty: number): DoorDef | null {
  if (tx < 0 || ty < 0 || tx >= g.w || ty >= g.h) return null;
  const d = g.doors[ty * g.w + tx];
  return d ? DOORS[d - 1] : null;
}

export const roomById = (id: string | undefined) => ROOMS.find((r) => r.id === id);
export const roomName = (id: string | undefined) => roomById(id)?.name ?? 'un endroit inconnu';
export const furnitureById = (id: string) => allFurniture().find((f) => f.id === id);

/** Pièces adjacentes (reliées par une porte, même verrouillée : le son passe). */
export function adjacentRooms(roomId: string): string[] {
  const out = new Set<string>();
  for (const d of DOORS) {
    if (d.rooms[0] === roomId) out.add(d.rooms[1]);
    if (d.rooms[1] === roomId) out.add(d.rooms[0]);
  }
  return [...out];
}

/** Retourne une position libre aléatoire dans une pièce. */
export function randomFreeTile(g: WorldGrid, roomId: string, rnd: () => number): { x: number; y: number } {
  const r = roomById(roomId)!;
  for (let i = 0; i < 200; i++) {
    const x = r.rect.x + Math.floor(rnd() * r.rect.w);
    const y = r.rect.y + Math.floor(rnd() * r.rect.h);
    const idx = y * g.w + x;
    if (!g.blocked[idx] && !g.doors[idx]) return { x: x + 0.5, y: y + 0.5 };
  }
  return { x: r.rect.x + r.rect.w / 2, y: r.rect.y + r.rect.h / 2 };
}
