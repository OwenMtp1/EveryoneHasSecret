import { FURNISHING } from './furnishing';
import { GAME_CONFIG } from '../config';
import { GRID_W, LEVEL_HEIGHT, LEVEL_STRIDE, WORLD_H, gridX, levelBase, levelOf, localX, type Level } from './levels';

export { GRID_W, LEVELS, LEVEL_HEIGHT, LEVEL_STRIDE, WORLD_H, WORLD_W, gridX, levelBase, levelOf, levelOffset, localX, type Level } from './levels';

/**
 * La Villa Beaumont — premier environnement.
 * Le plan est décrit en données (pièces rectangulaires, portes, escaliers/échelles, mobilier) puis
 * converti en grille de tuiles par buildWorldGrid(). Ajouter une pièce = ajouter une entrée.
 *
 * Niveaux (voir levels.ts) : sous-sol (−1), rez-de-chaussée (0), étage (1, avec les deux cabanes
 * perchées du verger), grenier (2). Chaque niveau occupe sa propre bande de la grille ; on décrit
 * tout en coordonnées LOCALES (repère du rez-de-chaussée) et gridX() place dans la bonne bande.
 *
 * Passages entre niveaux (PORTALS) : un escalier ou une échelle est une rampe praticable posée dans
 * le niveau du bas ; au-dessus, le niveau du haut a une trémie (vide) entourée d'une rambarde ou
 * d'une cage. En haut de la rampe, une transition invisible fait passer d'une bande à l'autre.
 * Serveur (GameInstance) et prédiction client (GameView3D) partagent stepMove() : mêmes règles.
 */

export interface RoomDef {
  id: string;
  name: string;
  /** Rectangle en coordonnées de GRILLE (x déjà décalé dans la bande du niveau). */
  rect: { x: number; y: number; w: number; h: number };
  floor: 'wood' | 'tile' | 'stone' | 'grass' | 'gravel' | 'carpet' | 'concrete';
  floorColor: string;
  outdoor?: boolean;
  /** Le sol salit les chaussures (boue). */
  muddy?: boolean;
  /** Couverte par la caméra de sécurité. */
  hasSink?: boolean;
  /** −1 = sous-sol, 0 = rez-de-chaussée (défaut), 1 = étage, 2 = grenier */
  level?: Level;
  /** Plateforme de cabane perchée (extérieure, en hauteur). */
  treehouse?: boolean;
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
    | 'fountain'
    | 'hedge'
    | 'tree'
    | 'big_tree'
    | 'car'
    | 'fireplace'
    | 'crate'
    | 'stairs'
    | 'ladder'
    | 'rope_ladder'
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
    | 'chest'
    | 'washing_machine'
    | 'dryer'
    | 'ironing_board'
    | 'laundry_basket'
    | 'drying_rack'
    | 'billiard'
    | 'cue_rack'
    | 'games_shelf'
    | 'darts'
    | 'jukebox'
    | 'arcade'
    | 'safe'
    | 'filing_cabinet'
    | 'boiler'
    | 'water_heater'
    | 'wine_rack'
    | 'boxes'
    | 'mannequin'
    | 'rocking_horse'
    | 'toolbox'
    | 'freezer'
    | 'bicycle'
    | 'umbrella_stand'
    | 'cushions'
    | 'lantern'
    | 'post'
    | 'shed'
    | 'swing'
    | 'planter'
    | 'barbecue'
    | 'bins'
    | 'mailbox'
    | 'dollhouse';
  x: number;
  y: number;
  w: number;
  h: number;
  /** Peut servir de cachette. */
  hiding?: boolean;
  /** Contenant fermé : à clé (clé à trouver) ou à code (combinaison). Données pour l'enquête. */
  lock?: 'key' | 'code';
  /** On peut marcher dessus (escalier, échelle). */
  walkable?: boolean;
  /** Orientation forcée : côté du mur contre lequel le meuble est adossé (sinon : mur le plus proche). */
  facing?: 'n' | 's' | 'e' | 'w';
}

/** Escalier ou échelle entre un niveau et celui du dessus. */
export interface PortalDef {
  id: string;
  kind: 'stairs' | 'ladder' | 'rope_ladder';
  name: string;
  /** niveau du bas (la rampe y est posée) ; on arrive au niveau + 1 */
  level: Level;
  /** emprise de la rampe, coordonnées LOCALES du niveau du bas */
  x: number;
  y: number;
  w: number;
  h: number;
  /** sens de la montée */
  dir: 'n' | 's' | 'e' | 'w';
  /** pièce du bas qui contient la rampe */
  roomId: string;
}

/** Décalage, dans la grille, des tuiles de l'étage (compatibilité). */
export const LEVEL_OFFSET_X = LEVEL_STRIDE;

const lvlRect = (l: Level, x: number, y: number, w: number, h: number) => ({ x: gridX(l, x), y, w, h });
type RoomExtra = Partial<Pick<RoomDef, 'outdoor' | 'muddy' | 'hasSink' | 'treehouse'>>;
function room(level: Level, id: string, name: string, x: number, y: number, w: number, h: number, floor: RoomDef['floor'], floorColor: string, extra: RoomExtra = {}): RoomDef {
  const r: RoomDef = { id, name, rect: lvlRect(level, x, y, w, h), floor, floorColor, ...extra };
  if (level !== 0) r.level = level;
  return r;
}

/*
 * Plan (coordonnées locales, 1 tuile = 1 m ; murs d'une tuile entre les pièces) :
 *
 *  REZ-DE-CHAUSSÉE (maison x1..46, y6..21 ; jardin au nord, allée au sud, verger à l'est)
 *   y6..12  Cuisine 1-9 | Salle à manger 11-18 | Salon 20-33 | Salle de jeux 35-46
 *   y14..21 Garage 1-9 | Buanderie 11-15 | Hall 17-27 | Couloir 29-42 (y14-15) | Vestiaire 44-46
 *           Bureau 29-38 (y17-21) · Toilettes 40-42 (y17-19)
 *  ÉTAGE   palier-couloir sur toute la longueur (y14-15), chambres au nord (y6-12) et au sud (y17-21) ;
 *           l'escalier du hall monte dans une cage fermée (x25-27, y16-19) jusqu'au palier.
 *  GRENIER sous le faîtage (x30-46, y9-18), échelle escamotable depuis le bout du palier.
 *  SOUS-SOL chaufferie sous la buanderie et le hall, cave à vin (fermée à clé) sous le garage.
 *  VERGER  deux cabanes perchées (bande de l'étage, h = 3,3 m) reliées au sol par des échelles.
 */
export const ROOMS: RoomDef[] = [
  // ── Extérieurs (rez-de-chaussée) ──
  room(0, 'garden', 'Jardin', 1, 1, 47, 4, 'grass', '#1f3a26', { outdoor: true, muddy: true }),
  room(0, 'orchard', 'Verger', 48, 1, 17, 26, 'grass', '#22402a', { outdoor: true, muddy: true }),
  room(0, 'exterior', 'Allée extérieure', 1, 23, 47, 4, 'gravel', '#34332f', { outdoor: true }),
  // ── Rez-de-chaussée ──
  room(0, 'kitchen', 'Cuisine', 1, 6, 9, 7, 'tile', '#3d3f45', { hasSink: true }),
  room(0, 'dining', 'Salle à manger', 11, 6, 8, 7, 'wood', '#4a3020'),
  room(0, 'living', 'Salon', 20, 6, 14, 7, 'wood', '#4a3426'),
  room(0, 'gamesroom', 'Salle de jeux', 35, 6, 12, 7, 'carpet', '#2f4a3a'),
  room(0, 'garage', 'Garage', 1, 14, 9, 8, 'concrete', '#2c2b29'),
  room(0, 'laundry', 'Buanderie', 11, 14, 5, 8, 'tile', '#3b4c55', { hasSink: true }),
  room(0, 'hall', 'Hall', 17, 14, 11, 8, 'stone', '#45403a'),
  room(0, 'corridor', 'Couloir', 29, 14, 14, 2, 'wood', '#3e2c20'),
  room(0, 'office', 'Bureau', 29, 17, 10, 5, 'carpet', '#2c3a4a'),
  room(0, 'wc', 'Toilettes', 40, 17, 3, 3, 'tile', '#3b4c55', { hasSink: true }),
  room(0, 'mudroom', 'Vestiaire de jardin', 44, 14, 3, 8, 'stone', '#3a3630'),
  // ── Sous-sol ──
  room(-1, 'cellar', 'Cave à vin', 1, 14, 9, 8, 'stone', '#2c2b29'),
  room(-1, 'basement', 'Sous-sol (chaufferie)', 11, 14, 12, 8, 'concrete', '#2a2a28'),
  // ── Étage ──
  room(1, 'landing', 'Palier', 1, 14, 46, 2, 'wood', '#3e2c20'),
  room(1, 'library', 'Bibliothèque', 1, 6, 9, 7, 'wood', '#3e2a1e'),
  room(1, 'bedroom2', 'Chambre de maître', 11, 6, 9, 7, 'carpet', '#43242c'),
  room(1, 'suite', 'Suite parentale', 21, 6, 11, 7, 'carpet', '#3a2430'),
  room(1, 'bathroom2', 'Salle de bain de la suite', 33, 6, 5, 7, 'tile', '#3b4c55', { hasSink: true }),
  room(1, 'kidsroom', "Chambre d'enfant", 39, 6, 8, 7, 'carpet', '#2f4a5a'),
  room(1, 'guestroom', "Chambre d'amis", 1, 17, 9, 5, 'carpet', '#3a3226'),
  room(1, 'bathroom', 'Salle de bain', 11, 17, 5, 5, 'tile', '#3b4c55', { hasSink: true }),
  room(1, 'bedroom1', 'Chambre bleue', 17, 17, 7, 5, 'carpet', '#243049'),
  room(1, 'studio', 'Atelier', 29, 17, 9, 5, 'wood', '#5a4632'),
  room(1, 'musicroom', 'Salon de musique', 39, 17, 8, 5, 'wood', '#4a3426'),
  // ── Cabanes perchées (bande de l'étage, au-dessus du verger) ──
  room(1, 'treehouse1', 'Cabane du vieux chêne', 50, 4, 5, 4, 'wood', '#6a4a2a', { outdoor: true, treehouse: true }),
  room(1, 'treehouse2', 'Cabane du tilleul', 57, 17, 5, 4, 'wood', '#6a4a2a', { outdoor: true, treehouse: true }),
  // ── Grenier ──
  room(2, 'attic', 'Grenier', 30, 9, 17, 10, 'wood', '#4a3a28'),
];

/** Porte décrite en coordonnées locales d'un niveau. */
const door = (l: Level, id: string, x: number, y: number, a: string, b: string, extra: Partial<DoorDef> = {}): DoorDef => ({ id, x: gridX(l, x), y, rooms: [a, b], ...extra });
const GARAGE_LOCK = { lockedBy: 'key_cellar', label: 'Porte du garage' };

export const DOORS: DoorDef[] = [
  // ── Rez-de-chaussée ──
  door(0, 'd_garden_kitchen', 5, 5, 'garden', 'kitchen'),
  door(0, 'd_garden_living_a', 26, 5, 'garden', 'living'),
  door(0, 'd_garden_living_b', 27, 5, 'garden', 'living'),
  door(0, 'd_kitchen_dining', 10, 9, 'kitchen', 'dining'),
  door(0, 'd_dining_living', 19, 9, 'dining', 'living'),
  door(0, 'd_dining_hall', 18, 13, 'dining', 'hall'),
  door(0, 'd_living_hall_a', 21, 13, 'living', 'hall'),
  door(0, 'd_living_hall_b', 22, 13, 'living', 'hall'),
  door(0, 'd_living_games', 34, 9, 'living', 'gamesroom'),
  door(0, 'd_kitchen_garage', 5, 13, 'kitchen', 'garage'),
  door(0, 'd_garage_laundry', 10, 18, 'garage', 'laundry'),
  door(0, 'd_laundry_hall', 16, 15, 'laundry', 'hall'),
  door(0, 'd_hall_corridor_a', 28, 14, 'hall', 'corridor'),
  door(0, 'd_hall_corridor_b', 28, 15, 'hall', 'corridor'),
  door(0, 'd_corridor_games', 40, 13, 'corridor', 'gamesroom'),
  door(0, 'd_corridor_office', 33, 16, 'corridor', 'office'),
  door(0, 'd_corridor_wc', 41, 16, 'corridor', 'wc'),
  door(0, 'd_corridor_mudroom', 43, 15, 'corridor', 'mudroom'),
  door(0, 'd_mudroom_orchard', 47, 19, 'mudroom', 'orchard'),
  door(0, 'd_hall_exterior_a', 20, 22, 'hall', 'exterior'),
  door(0, 'd_hall_exterior_b', 21, 22, 'hall', 'exterior'),
  // porte basculante du garage (trois battants, une seule serrure)
  door(0, 'd_garage_exterior_a', 3, 22, 'garage', 'exterior', GARAGE_LOCK),
  door(0, 'd_garage_exterior_b', 4, 22, 'garage', 'exterior', GARAGE_LOCK),
  door(0, 'd_garage_exterior_c', 5, 22, 'garage', 'exterior', GARAGE_LOCK),
  // ── Sous-sol ──
  door(-1, 'd_basement_cellar', 10, 17, 'basement', 'cellar', { lockedBy: 'key_cellar', label: 'Porte de la cave' }),
  // ── Étage ──
  door(1, 'd_library_landing', 5, 13, 'library', 'landing'),
  door(1, 'd_master_landing', 15, 13, 'bedroom2', 'landing'),
  door(1, 'd_suite_landing', 26, 13, 'suite', 'landing'),
  door(1, 'd_suite_bath2', 32, 9, 'suite', 'bathroom2'),
  door(1, 'd_kids_landing', 42, 13, 'kidsroom', 'landing'),
  door(1, 'd_guest_landing', 5, 16, 'guestroom', 'landing'),
  door(1, 'd_bath_landing', 13, 16, 'bathroom', 'landing'),
  door(1, 'd_bedroom1_landing', 20, 16, 'bedroom1', 'landing'),
  door(1, 'd_studio_landing', 33, 16, 'studio', 'landing'),
  door(1, 'd_music_landing', 42, 16, 'musicroom', 'landing'),
];

// ───────────────────────── escaliers et échelles ─────────────────────────

export const PORTALS: PortalDef[] = [
  { id: 'hall_stairs', kind: 'stairs', name: 'Escalier', level: 0, x: 25, y: 16, w: 3, h: 4, dir: 'n', roomId: 'hall' },
  { id: 'cellar_stairs', kind: 'stairs', name: 'Escalier de la cave', level: -1, x: 14, y: 17, w: 2, h: 4, dir: 'n', roomId: 'basement' },
  { id: 'attic_ladder', kind: 'ladder', name: 'Échelle du grenier', level: 1, x: 44, y: 15, w: 2, h: 1, dir: 'e', roomId: 'landing' },
  { id: 'treehouse1_ladder', kind: 'ladder', name: 'Échelle de la cabane', level: 0, x: 52, y: 8, w: 1, h: 2, dir: 'n', roomId: 'orchard' },
  { id: 'treehouse2_ladder', kind: 'rope_ladder', name: 'Échelle de corde', level: 0, x: 59, y: 21, w: 1, h: 2, dir: 'n', roomId: 'orchard' },
];
/** Escalier principal du hall (coordonnées de grille du rez-de-chaussée). */
export const STAIRS = PORTALS[0];

const upperOf = (p: PortalDef) => (p.level + 1) as Level;
/** Longueur de la rampe (dans le sens de la montée). */
export const rampLength = (p: PortalDef) => (p.dir === 'n' || p.dir === 's' ? p.h : p.w);
/** Abscisse curviligne (0 = première marche, longueur = haut) d'un point local. */
function along(p: PortalDef, x: number, y: number) {
  switch (p.dir) {
    case 's': return y - p.y;
    case 'n': return p.y + p.h - y;
    case 'e': return x - p.x;
    default: return p.x + p.w - x;
  }
}
const across = (p: PortalDef, x: number, y: number) => (p.dir === 'n' || p.dir === 's' ? x : y);
const acrossRange = (p: PortalDef): [number, number] => (p.dir === 'n' || p.dir === 's' ? [p.x, p.x + p.w] : [p.y, p.y + p.h]);
/** Point local à l'abscisse s, position transversale c. */
function pointAt(p: PortalDef, s: number, c: number) {
  switch (p.dir) {
    case 's': return { x: c, y: p.y + s };
    case 'n': return { x: c, y: p.y + p.h - s };
    case 'e': return { x: p.x + s, y: c };
    default: return { x: p.x + p.w - s, y: c };
  }
}
const inRect = (p: { x: number; y: number; w: number; h: number }, x: number, y: number) => x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h;
/** La position de grille (gx, y) est-elle sur la rampe p ? */
const onRamp = (p: PortalDef, gx: number, y: number) => levelOf(gx) === p.level && inRect(p, localX(gx), y);
/** Recentre latéralement pour que le corps tienne dans la largeur de la rampe. */
function clampAcross(p: PortalDef, c: number) {
  const [a, b] = acrossRange(p);
  const m = GAME_CONFIG.playerRadius + 0.03;
  return b - a <= 2 * m ? (a + b) / 2 : Math.min(b - m, Math.max(a + m, c));
}

/** Tuiles (coordonnées de grille) en bas de chaque rampe, d'où l'on y entre. */
export function portalEntryTiles(p: PortalDef): [number, number][] {
  const out: [number, number][] = [];
  const [a, b] = acrossRange(p);
  for (let c = a; c < b; c++) {
    const q = pointAt(p, -0.5, c + 0.5);
    out.push([gridX(p.level, Math.floor(q.x)), Math.floor(q.y)]);
  }
  return out;
}
/** Tuiles d'arrivée au niveau du haut (juste après le haut de la rampe). */
export function portalArrivalTiles(p: PortalDef): [number, number][] {
  const out: [number, number][] = [];
  const [a, b] = acrossRange(p);
  for (let c = a; c < b; c++) {
    const q = pointAt(p, rampLength(p) + 0.5, c + 0.5);
    out.push([gridX(upperOf(p), Math.floor(q.x)), Math.floor(q.y)]);
  }
  return out;
}
/** Trémies : tuiles du niveau du haut situées au-dessus d'une rampe (clé "x,y" de grille). */
export const VOID_TILES = new Set<string>();
for (const p of PORTALS)
  for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) VOID_TILES.add(`${gridX(upperOf(p), x)},${y}`);
export const isVoidTile = (gx: number, y: number) => VOID_TILES.has(`${gx},${y}`);

/** Hauteur du sol (m) sous une position de la grille : niveau + rampe éventuelle. */
export function elevationAt(x: number, y: number): number {
  const l = levelOf(x);
  const base = levelBase(l);
  for (const p of PORTALS) {
    if (!onRamp(p, x, y)) continue;
    const t = along(p, localX(x), y) / rampLength(p);
    return base + Math.min(1, Math.max(0, t)) * LEVEL_HEIGHT;
  }
  return base;
}

/** Transition de niveau : retourne la nouvelle position si l'on vient de franchir le haut d'une rampe. */
export function applyPortal(x: number, y: number): { x: number; y: number } | null {
  const l = levelOf(x);
  const lx = localX(x);
  for (const p of PORTALS) {
    const len = rampLength(p);
    const [a, b] = acrossRange(p);
    const c = across(p, lx, y);
    if (c < a || c >= b) continue;
    const s = along(p, lx, y);
    if (l === p.level && s > len - 0.3 && s < len) {
      const q = pointAt(p, len + 0.6, clampAcross(p, c));
      return { x: gridX(upperOf(p), q.x), y: q.y };
    }
    if (l === upperOf(p) && s > len && s < len + 0.4) {
      const q = pointAt(p, len - 0.55, clampAcross(p, c));
      return { x: gridX(p.level, q.x), y: q.y };
    }
  }
  return null;
}

/** Rampes : on n'y entre (et n'en sort) que par la première marche ; les côtés sont des garde-corps. */
export function stepAllowed(ax: number, ay: number, bx: number, by: number): boolean {
  for (const p of PORTALS) {
    const a = onRamp(p, ax, ay);
    const b = onRamp(p, bx, by);
    if (a === b) continue;
    if (Math.min(along(p, localX(ax), ay), along(p, localX(bx), by)) >= 0.6) return false;
  }
  return true;
}

/**
 * Un pas de déplacement (axe x puis axe y, puis transition de niveau). Si le pas entier est refusé,
 * on avance jusqu'au contact (recherche dichotomique) : on glisse le long des murs et l'on atteint
 * toujours les seuils des escaliers, quelle que soit la cadence. Partagé serveur / prédiction client.
 * Retourne true en cas de changement de niveau.
 */
export function stepMove(p: { x: number; y: number }, vx: number, vy: number, fits: (x: number, y: number) => boolean): boolean {
  const axis = (dx: number, dy: number) => {
    if (!dx && !dy) return;
    const ok = (t: number) => fits(p.x + dx * t, p.y + dy * t) && stepAllowed(p.x, p.y, p.x + dx * t, p.y + dy * t);
    if (ok(1)) {
      p.x += dx;
      p.y += dy;
      return;
    }
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 6; i++) {
      const mid = (lo + hi) / 2;
      if (ok(mid)) lo = mid;
      else hi = mid;
    }
    p.x += dx * lo;
    p.y += dy * lo;
  };
  axis(vx, 0);
  axis(0, vy);
  const portal = applyPortal(p.x, p.y);
  if (portal && fits(portal.x, portal.y)) {
    p.x = portal.x;
    p.y = portal.y;
    return true;
  }
  return false;
}

// ───────────────────────── mobilier ─────────────────────────

/** Mobilier principal (meubles nommés, cachettes) + ameublement/décoration (furnishing.ts). */
let allCache: FurnitureDef[] | null = null;
export function allFurniture(): FurnitureDef[] {
  return (allCache ??= [...FURNITURE, ...FURNISHING]);
}

type FurnitureRow = Omit<FurnitureDef, 'x'> & { x: number };
const at = (l: Level, f: FurnitureRow): FurnitureDef => ({ ...f, x: gridX(l, f.x) });
const g0 = (f: FurnitureRow) => at(0, f);
const g1 = (f: FurnitureRow) => at(1, f);
const g2 = (f: FurnitureRow) => at(2, f);
const gB = (f: FurnitureRow) => at(-1, f);

/** Pièce d'une tuile (coordonnées de grille) d'après les rectangles. */
const roomOfTile = (gx: number, y: number) => ROOMS.find((r) => inRect(r.rect, gx, y));

/** Rampes praticables (escaliers, échelles) et garde-corps des trémies situées dans une pièce. */
function portalFurniture(): FurnitureDef[] {
  const out: FurnitureDef[] = [];
  for (const p of PORTALS) {
    out.push({ id: `f_${p.id}`, roomId: p.roomId, name: p.name, kind: p.kind, x: gridX(p.level, p.x), y: p.y, w: p.w, h: p.h, walkable: true, facing: p.dir });
    const gx = gridX(upperOf(p), p.x);
    const upper = roomOfTile(gx, p.y);
    if (upper && !upper.treehouse) out.push({ id: `f_${p.id}_railing`, roomId: upper.id, name: `Garde-corps (${p.name.toLowerCase()})`, kind: 'railing', x: gx, y: p.y, w: p.w, h: p.h, facing: p.dir });
  }
  return out;
}

export const FURNITURE: FurnitureDef[] = [
  // ── Cuisine ──
  g0({ id: 'f_kitchen_counter', roomId: 'kitchen', name: 'Tiroirs du plan de travail', kind: 'counter', x: 1, y: 6, w: 3, h: 1, hiding: true }),
  g0({ id: 'f_kitchen_sink', roomId: 'kitchen', name: 'Évier', kind: 'sink', x: 7, y: 6, w: 2, h: 1 }),
  g0({ id: 'f_kitchen_table', roomId: 'kitchen', name: 'Table de cuisine', kind: 'table', x: 4, y: 9, w: 3, h: 2 }),
  // ── Salle à manger ──
  g0({ id: 'f_dining_table', roomId: 'dining', name: 'Table de salle à manger', kind: 'table', x: 13, y: 8, w: 4, h: 3 }),
  g0({ id: 'f_dining_buffet', roomId: 'dining', name: 'Tiroirs du buffet', kind: 'sideboard', x: 12, y: 6, w: 3, h: 1, facing: 'n', hiding: true }),
  // ── Salon ──
  g0({ id: 'f_living_fireplace', roomId: 'living', name: 'Cheminée', kind: 'fireplace', x: 23, y: 6, w: 2, h: 1, facing: 'n', hiding: true }),
  g0({ id: 'f_living_sofa', roomId: 'living', name: 'Sous les coussins du canapé', kind: 'sofa', x: 22, y: 10, w: 4, h: 1, facing: 's', hiding: true }),
  g0({ id: 'f_living_table', roomId: 'living', name: 'Table basse', kind: 'table', x: 23, y: 8, w: 2, h: 1 }),
  g0({ id: 'f_living_piano', roomId: 'living', name: 'Piano à queue', kind: 'piano', x: 30, y: 6, w: 3, h: 2, facing: 'n', hiding: true }),
  // ── Salle de jeux ──
  g0({ id: 'f_games_billiard', roomId: 'gamesroom', name: 'Table de billard', kind: 'billiard', x: 39, y: 8, w: 4, h: 2 }),
  g0({ id: 'f_games_shelf', roomId: 'gamesroom', name: 'Boîtes de jeux de société', kind: 'games_shelf', x: 44, y: 6, w: 2, h: 1, facing: 'n', hiding: true }),
  // ── Bureau ──
  g0({ id: 'f_office_desk', roomId: 'office', name: 'Tiroir verrouillé du bureau en chêne', kind: 'desk', x: 33, y: 21, w: 3, h: 1, facing: 's', hiding: true, lock: 'key' }),
  g0({ id: 'f_office_safe', roomId: 'office', name: 'Coffre-fort', kind: 'safe', x: 38, y: 21, w: 1, h: 1, facing: 'e', hiding: true, lock: 'code' }),
  g0({ id: 'f_office_terminal', roomId: 'office', name: 'Poste informatique', kind: 'terminal', x: 38, y: 17, w: 1, h: 1, facing: 'e' }),
  g0({ id: 'f_office_shelf', roomId: 'office', name: 'Derrière les livres de la bibliothèque', kind: 'shelf', x: 29, y: 17, w: 1, h: 3, facing: 'w', hiding: true }),
  // ── Buanderie, toilettes ──
  g0({ id: 'f_laundry_sink', roomId: 'laundry', name: 'Évier de la buanderie', kind: 'sink', x: 13, y: 14, w: 1, h: 1, facing: 'n' }),
  g0({ id: 'f_wc_toilet', roomId: 'wc', name: 'Réservoir de la chasse d’eau', kind: 'toilet', x: 42, y: 17, w: 1, h: 1, facing: 'n', hiding: true }),
  g0({ id: 'f_wc_sink', roomId: 'wc', name: 'Meuble sous le lave-mains', kind: 'sink', x: 40, y: 17, w: 1, h: 1, facing: 'n', hiding: true }),
  // ── Garage ──
  g0({ id: 'f_garage_car', roomId: 'garage', name: 'Coffre de la voiture', kind: 'car', x: 3, y: 15, w: 2, h: 4, hiding: true }),
  g0({ id: 'f_garage_toolbox', roomId: 'garage', name: 'Caisse à outils', kind: 'toolbox', x: 6, y: 21, w: 1, h: 1, facing: 's', hiding: true }),
  // ── Hall ──
  g0({ id: 'f_hall_console', roomId: 'hall', name: 'Tiroir de la console', kind: 'table', x: 23, y: 14, w: 2, h: 1, facing: 'n', hiding: true }),
  // ── Sous-sol ──
  gB({ id: 'f_cellar_shelf', roomId: 'cellar', name: 'Casiers à vin', kind: 'wine_rack', x: 1, y: 15, w: 1, h: 5, facing: 'w', hiding: true }),
  gB({ id: 'f_cellar_crate', roomId: 'cellar', name: 'Caisses de grands crus', kind: 'crate', x: 8, y: 20, w: 2, h: 2, hiding: true }),
  gB({ id: 'f_basement_boiler', roomId: 'basement', name: 'Chaudière au fioul', kind: 'boiler', x: 17, y: 14, w: 2, h: 1, facing: 'n' }),
  gB({ id: 'f_basement_heater', roomId: 'basement', name: 'Derrière le ballon d’eau chaude', kind: 'water_heater', x: 19, y: 14, w: 1, h: 1, facing: 'n', hiding: true }),
  // ── Étage ──
  g1({ id: 'f_bed1', roomId: 'bedroom1', name: 'Sous le matelas', kind: 'bed', x: 17, y: 19, w: 2, h: 3, facing: 's', hiding: true }),
  g1({ id: 'f_wardrobe1', roomId: 'bedroom1', name: 'Armoire', kind: 'wardrobe', x: 23, y: 17, w: 1, h: 2, facing: 'e', hiding: true }),
  g1({ id: 'f_bed2', roomId: 'bedroom2', name: 'Sous le matelas du lit à baldaquin', kind: 'bed', x: 14, y: 6, w: 3, h: 3, facing: 'n', hiding: true }),
  g1({ id: 'f_dresser2', roomId: 'bedroom2', name: 'Tiroirs de la coiffeuse', kind: 'desk', x: 11, y: 12, w: 2, h: 1, facing: 's', hiding: true }),
  g1({ id: 'f_suite_fireplace', roomId: 'suite', name: 'Cheminée de la suite', kind: 'fireplace', x: 23, y: 6, w: 2, h: 1, facing: 'n' }),
  g1({ id: 'f_bath_tub', roomId: 'bathroom', name: 'Sous le tablier de la baignoire', kind: 'bath', x: 13, y: 20, w: 3, h: 2, facing: 's', hiding: true }),
  g1({ id: 'f_bath_sink', roomId: 'bathroom', name: 'Lavabo', kind: 'sink', x: 11, y: 17, w: 1, h: 1, facing: 'n' }),
  g1({ id: 'f_bath2_sink', roomId: 'bathroom2', name: 'Double vasque', kind: 'sink', x: 33, y: 6, w: 2, h: 1, facing: 'n' }),
  // ── Grenier ──
  g2({ id: 'f_attic_trunk', roomId: 'attic', name: 'Malle cadenassée', kind: 'chest', x: 31, y: 9, w: 2, h: 1, facing: 'n', hiding: true, lock: 'key' }),
  // ── Jardin, verger, allée ──
  g0({ id: 'f_garden_fountain', roomId: 'garden', name: 'Fontaine', kind: 'fountain', x: 9, y: 2, w: 2, h: 2, hiding: true }),
  g0({ id: 'f_garden_hedge', roomId: 'garden', name: 'Haie taillée', kind: 'hedge', x: 30, y: 1, w: 6, h: 1, hiding: true }),
  g0({ id: 'f_orchard_oak', roomId: 'orchard', name: 'Vieux chêne', kind: 'big_tree', x: 55, y: 5, w: 2, h: 2 }),
  g0({ id: 'f_orchard_linden', roomId: 'orchard', name: 'Grand tilleul', kind: 'big_tree', x: 62, y: 18, w: 2, h: 2 }),
  g0({ id: 'f_ext_car', roomId: 'exterior', name: 'Voiture de collection', kind: 'car', x: 32, y: 24, w: 4, h: 2, hiding: true }),
  ...portalFurniture(),
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
export const roomLevel = (id: string | undefined): Level => roomById(id)?.level ?? 0;
export const furnitureById = (id: string) => allFurniture().find((f) => f.id === id);

/** Pièces adjacentes (reliées par une porte, même verrouillée, ou par un escalier : le son passe). */
export function adjacentRooms(roomId: string): string[] {
  const out = new Set<string>();
  for (const d of DOORS) {
    if (d.rooms[0] === roomId) out.add(d.rooms[1]);
    if (d.rooms[1] === roomId) out.add(d.rooms[0]);
  }
  for (const p of PORTALS) {
    const [ax, ay] = portalArrivalTiles(p)[0];
    const upper = roomOfTile(ax, ay)?.id;
    if (!upper) continue;
    if (p.roomId === roomId) out.add(upper);
    if (upper === roomId) out.add(p.roomId);
  }
  // espaces extérieurs contigus (sans mur entre eux)
  const r = roomById(roomId);
  if (r?.outdoor && !r.treehouse)
    for (const o of ROOMS)
      if (o !== r && o.outdoor && !o.treehouse && (o.level ?? 0) === (r.level ?? 0) && o.rect.x <= r.rect.x + r.rect.w && r.rect.x <= o.rect.x + o.rect.w && o.rect.y <= r.rect.y + r.rect.h && r.rect.y <= o.rect.y + o.rect.h) out.add(o.id);
  return [...out];
}

/** Retourne une position libre aléatoire dans une pièce. */
export function randomFreeTile(g: WorldGrid, roomId: string, rnd: () => number): { x: number; y: number } {
  const r = roomById(roomId)!;
  for (let i = 0; i < 200; i++) {
    const x = r.rect.x + Math.floor(rnd() * r.rect.w);
    const y = r.rect.y + Math.floor(rnd() * r.rect.h);
    const idx = y * g.w + x;
    if (!g.blocked[idx] && !g.doors[idx] && !onAnyRamp(x + 0.5, y + 0.5)) return { x: x + 0.5, y: y + 0.5 };
  }
  return { x: r.rect.x + r.rect.w / 2, y: r.rect.y + r.rect.h / 2 };
}
const onAnyRamp = (gx: number, y: number) => PORTALS.some((p) => onRamp(p, gx, y));

/** Emprise de la maison (murs compris), coordonnées locales : sert au toit, au terrain, aux vues. */
export const HOUSE = { x0: 0, x1: 48, z0: 5, z1: 23 } as const;
