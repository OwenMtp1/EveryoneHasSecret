/**
 * La Villa Beaumont — premier environnement.
 * Le plan est décrit en données (pièces rectangulaires, portes, mobilier) puis
 * converti en grille de tuiles par buildWorldGrid(). Ajouter une pièce = ajouter une entrée.
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
    | 'crate';
  x: number;
  y: number;
  w: number;
  h: number;
  /** Peut servir de cachette. */
  hiding?: boolean;
}

export const WORLD_W = 48;
export const WORLD_H = 28;

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
];

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
  const size = WORLD_W * WORLD_H;
  const g: WorldGrid = { w: WORLD_W, h: WORLD_H, rooms: new Uint8Array(size), blocked: new Uint8Array(size), doors: new Uint8Array(size) };
  ROOMS.forEach((r, i) => {
    for (let y = r.rect.y; y < r.rect.y + r.rect.h; y++)
      for (let x = r.rect.x; x < r.rect.x + r.rect.w; x++) g.rooms[y * WORLD_W + x] = i + 1;
  });
  DOORS.forEach((d, i) => {
    const idx = d.y * WORLD_W + d.x;
    g.rooms[idx] = ROOMS.findIndex((r) => r.id === d.rooms[0]) + 1;
    g.doors[idx] = i + 1;
  });
  for (const f of FURNITURE)
    for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) g.blocked[y * WORLD_W + x] = 1;
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
export const furnitureById = (id: string) => FURNITURE.find((f) => f.id === id);

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
