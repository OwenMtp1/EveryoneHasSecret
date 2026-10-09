/**
 * Types d'objets — data-driven.
 * Le moteur ne connaît pas « le couteau » : il connaît des tags (weapon, lethal, cleaning…)
 * et des effets d'utilisation génériques (useEffect). Ajouter un objet = ajouter une entrée.
 */

export type ObjectTag =
  | 'weapon'
  | 'lethal'
  | 'sharp'
  | 'blunt'
  | 'strangle'
  | 'key'
  | 'light'
  | 'cleaning'
  | 'fire'
  | 'document'
  | 'destructible'
  | 'valuable'
  | 'device'
  | 'tool'
  | 'medicine';

export type UseEffect =
  | 'unlock' // ouvre une porte verrouillée proche correspondant à unlocks
  | 'force' // force une porte verrouillée (bruit + trace)
  | 'toggle_light'
  | 'read' // lit un document (peut révéler un secret)
  | 'phone' // consulte un téléphone
  | 'calm'
  | 'none';

/** Pièce d'un modèle 3D d'objet (mètres, objet posé au sol, y = 0 au sol). */
export interface ModelPart {
  kind: 'box' | 'cyl' | 'sphere' | 'torus' | 'cone';
  /** box : [l, h, p] · cyl/cone : [rayon, hauteur] · sphere : [rayon] · torus : [rayon, épaisseur] */
  size: number[];
  p: [number, number, number];
  r?: [number, number, number];
  color: string;
  metal?: number;
  rough?: number;
  emissive?: string;
}

const STEEL = '#c9ccd2';
const BLACK = '#18181a';
const BRASS = '#b8913e';

export interface ObjectTypeDef {
  type: string;
  name: string;
  icon: string;
  description: string;
  tags: ObjectTag[];
  useEffect?: UseEffect;
  /** pour les clés : type de serrure ouverte */
  unlocks?: string;
  /** classe d'arme pour le médecin légiste */
  weaponClass?: 'sharp' | 'blunt' | 'strangle';
  /** pièces possibles d'apparition (tirage aléatoire → rejouabilité) */
  spawnRooms: string[];
  /** probabilité d'être présent dans la partie */
  spawnChance: number;
  /** objet généré par un événement / un secret uniquement */
  eventOnly?: boolean;
  /** modèle 3D (sinon : icône) */
  model?: ModelPart[];
}

export const OBJECT_TYPES: ObjectTypeDef[] = [
  { type: 'knife', name: 'Couteau de cuisine', icon: '🔪', description: 'Une lame longue et parfaitement aiguisée.', tags: ['weapon', 'lethal', 'sharp'], weaponClass: 'sharp', spawnRooms: ['kitchen'], spawnChance: 1, model: [{ kind: 'box', size: [0.2, 0.006, 0.035], p: [0.07, 0.012, 0], color: STEEL, metal: 0.9, rough: 0.2 }, { kind: 'box', size: [0.11, 0.022, 0.03], p: [-0.085, 0.014, 0], color: BLACK }] },
  { type: 'candlestick', name: 'Chandelier en bronze', icon: '🕯️', description: 'Lourd, ancien, gravé aux initiales V.B.', tags: ['weapon', 'lethal', 'blunt'], weaponClass: 'blunt', spawnRooms: ['living', 'office', 'hall', 'musicroom', 'library'], spawnChance: 1, model: [{ kind: 'cyl', size: [0.07, 0.02], p: [0, 0.01, 0], color: BRASS, metal: 0.8, rough: 0.3 }, { kind: 'cyl', size: [0.016, 0.24], p: [0, 0.14, 0], color: BRASS, metal: 0.8, rough: 0.3 }, { kind: 'cyl', size: [0.035, 0.03], p: [0, 0.27, 0], color: BRASS, metal: 0.8, rough: 0.3 }, { kind: 'cyl', size: [0.014, 0.09], p: [0, 0.33, 0], color: '#f1ead8' }, { kind: 'sphere', size: [0.012], p: [0, 0.385, 0], color: '#ffb347', emissive: '#ff9a2a' }] },
  { type: 'rope', name: 'Corde', icon: '🪢', description: 'Une corde de chanvre rêche, assez longue.', tags: ['weapon', 'lethal', 'strangle'], weaponClass: 'strangle', spawnRooms: ['cellar', 'garden', 'garage', 'attic'], spawnChance: 0.9, model: [{ kind: 'torus', size: [0.1, 0.018], p: [0, 0.018, 0], r: [1.5708, 0, 0], color: '#8a6a3c' }, { kind: 'torus', size: [0.085, 0.018], p: [0.02, 0.05, 0.01], r: [1.5708, 0, 0.3], color: '#7c5e34' }] },
  { type: 'letter_opener', name: 'Coupe-papier', icon: '🗡️', description: 'Un coupe-papier en argent, étonnamment pointu.', tags: ['weapon', 'lethal', 'sharp'], weaponClass: 'sharp', spawnRooms: ['office', 'library'], spawnChance: 0.8, model: [{ kind: 'box', size: [0.17, 0.004, 0.02], p: [0.06, 0.008, 0], color: STEEL, metal: 0.95, rough: 0.15 }, { kind: 'box', size: [0.08, 0.014, 0.022], p: [-0.065, 0.01, 0], color: '#d8d8dc', metal: 0.9, rough: 0.2 }] },
  { type: 'wine_bottle', name: 'Bouteille de vin', icon: '🍾', description: 'Un grand cru de 1982. Lourde.', tags: ['weapon', 'lethal', 'blunt'], weaponClass: 'blunt', spawnRooms: ['cellar', 'kitchen', 'living'], spawnChance: 0.9, model: [{ kind: 'cyl', size: [0.04, 0.2], p: [0, 0.1, 0], color: '#1d3a24', rough: 0.1, metal: 0.2 }, { kind: 'cone', size: [0.04, 0.05], p: [0, 0.225, 0], color: '#1d3a24', rough: 0.1 }, { kind: 'cyl', size: [0.014, 0.07], p: [0, 0.28, 0], color: '#1d3a24', rough: 0.1 }, { kind: 'cyl', size: [0.0405, 0.07], p: [0, 0.1, 0], color: '#e9dfc5' }] },
  { type: 'key_cellar', name: 'Clé en fer', icon: '🗝️', description: 'Une vieille clé. Une étiquette : « Cave ».', tags: ['key'], useEffect: 'unlock', unlocks: 'key_cellar', spawnRooms: ['office', 'bedroom2', 'garden', 'bathroom', 'suite', 'studio', 'gamesroom', 'mudroom'], spawnChance: 1, model: [{ kind: 'torus', size: [0.022, 0.006], p: [-0.05, 0.006, 0], r: [1.5708, 0, 0], color: '#5c5a55', metal: 0.8, rough: 0.5 }, { kind: 'box', size: [0.08, 0.008, 0.008], p: [0.01, 0.006, 0], color: '#5c5a55', metal: 0.8, rough: 0.5 }, { kind: 'box', size: [0.012, 0.008, 0.025], p: [0.045, 0.006, 0.012], color: '#5c5a55', metal: 0.8, rough: 0.5 }] },
  { type: 'screwdriver', name: 'Tournevis', icon: '🪛', description: 'Assez solide pour forcer une serrure… bruyamment.', tags: ['tool'], useEffect: 'force', spawnRooms: ['garden', 'exterior', 'garage', 'basement', 'studio'], spawnChance: 0.8, model: [{ kind: 'cyl', size: [0.018, 0.1], p: [-0.06, 0.018, 0], r: [0, 0, 1.5708], color: '#d9a21b' }, { kind: 'cyl', size: [0.005, 0.12], p: [0.05, 0.018, 0], r: [0, 0, 1.5708], color: STEEL, metal: 0.9, rough: 0.3 }] },
  { type: 'flashlight', name: 'Lampe torche', icon: '🔦', description: 'Elle fonctionne encore. Utile si le courant saute.', tags: ['light'], useEffect: 'toggle_light', spawnRooms: ['kitchen', 'hall', 'bedroom1', 'guestroom', 'laundry', 'mudroom'], spawnChance: 1, model: [{ kind: 'cyl', size: [0.02, 0.16], p: [-0.02, 0.022, 0], r: [0, 0, 1.5708], color: BLACK, rough: 0.4 }, { kind: 'cyl', size: [0.03, 0.04], p: [0.08, 0.03, 0], r: [0, 0, 1.5708], color: '#2a2a2c', metal: 0.5 }, { kind: 'cyl', size: [0.026, 0.004], p: [0.1, 0.03, 0], r: [0, 0, 1.5708], color: '#fff6d8', emissive: '#fff1c4' }] },
  { type: 'cloth', name: 'Torchon', icon: '🧻', description: 'Un torchon propre. Pour nettoyer… n’importe quoi.', tags: ['cleaning'], spawnRooms: ['kitchen', 'bathroom', 'bathroom2', 'laundry', 'wc'], spawnChance: 1, model: [{ kind: 'box', size: [0.26, 0.012, 0.2], p: [0, 0.006, 0], r: [0, 0.3, 0], color: '#e8e2d2' }, { kind: 'box', size: [0.26, 0.004, 0.02], p: [0, 0.013, 0.05], r: [0, 0.3, 0], color: '#a8393f' }] },
  { type: 'lighter', name: 'Briquet', icon: '🔥', description: 'Un briquet tempête en laiton.', tags: ['fire'], spawnRooms: ['living', 'garden', 'office', 'studio'], spawnChance: 0.9, model: [{ kind: 'box', size: [0.04, 0.06, 0.016], p: [0, 0.03, 0], color: BRASS, metal: 0.9, rough: 0.25 }] },
  { type: 'phone', name: 'Téléphone', icon: '📱', description: 'Un smartphone sans code. À qui est-il ?', tags: ['device'], useEffect: 'phone', spawnRooms: ['living', 'bedroom1', 'bedroom2', 'guestroom', 'suite'], spawnChance: 0.8, model: [{ kind: 'box', size: [0.075, 0.009, 0.155], p: [0, 0.005, 0], color: BLACK, rough: 0.2, metal: 0.3 }, { kind: 'box', size: [0.068, 0.002, 0.145], p: [0, 0.0105, 0], color: '#0b1a2a', emissive: '#1e4a7a' }] },
  { type: 'medicine', name: 'Somnifères', icon: '💊', description: 'Un flacon presque vide.', tags: ['medicine'], useEffect: 'calm', spawnRooms: ['bathroom', 'bedroom2', 'bathroom2', 'suite'], spawnChance: 0.7, model: [{ kind: 'cyl', size: [0.025, 0.075], p: [0, 0.0375, 0], color: '#c8701a', rough: 0.15 }, { kind: 'cyl', size: [0.027, 0.02], p: [0, 0.085, 0], color: '#f2f2f2' }] },
  { type: 'watch', name: 'Montre à gousset', icon: '⌚', description: 'Arrêtée à 23:12. Gravée « À V., pour toujours ».', tags: ['valuable'], spawnRooms: ['bedroom1', 'office', 'hall', 'library', 'musicroom'], spawnChance: 0.6, model: [{ kind: 'cyl', size: [0.026, 0.01], p: [0, 0.005, 0], color: '#d6b25e', metal: 0.95, rough: 0.2 }, { kind: 'cyl', size: [0.021, 0.002], p: [0, 0.011, 0], color: '#f4efe2' }, { kind: 'torus', size: [0.03, 0.002], p: [0.06, 0.002, 0], r: [1.5708, 0, 0], color: '#d6b25e', metal: 0.95 }] },
  { type: 'badge', name: 'Badge d’accès', icon: '🪪', description: 'Badge de « Beaumont Industries ». Photo arrachée.', tags: [], spawnRooms: ['office', 'exterior'], spawnChance: 0.6, model: [{ kind: 'box', size: [0.085, 0.004, 0.055], p: [0, 0.002, 0], color: '#f4f4f4' }, { kind: 'box', size: [0.085, 0.005, 0.012], p: [0, 0.003, -0.018], color: '#1f4fa8' }] },
  { type: 'necklace', name: 'Collier Beaumont', icon: '📿', description: 'Des diamants. Il vaut plus que la villa elle-même.', tags: ['valuable'], spawnRooms: ['bedroom2'], spawnChance: 1, model: [{ kind: 'torus', size: [0.07, 0.005], p: [0, 0.005, 0], r: [1.5708, 0, 0], color: '#e7e9ee', metal: 1, rough: 0.1 }, { kind: 'sphere', size: [0.014], p: [0, 0.012, 0.075], color: '#dff6ff', metal: 0.3, rough: 0.05, emissive: '#7fd6ff' }, { kind: 'sphere', size: [0.009], p: [0.03, 0.01, 0.066], color: '#dff6ff', emissive: '#7fd6ff' }, { kind: 'sphere', size: [0.009], p: [-0.03, 0.01, 0.066], color: '#dff6ff', emissive: '#7fd6ff' }] },
  { type: 'letter', name: 'Lettre', icon: '✉️', description: 'Une lettre pliée en quatre.', tags: ['document', 'destructible'], useEffect: 'read', spawnRooms: ['hall'], spawnChance: 0, eventOnly: true, model: [{ kind: 'box', size: [0.2, 0.004, 0.14], p: [0, 0.002, 0], r: [0, 0.4, 0], color: '#efe4c8' }, { kind: 'box', size: [0.04, 0.005, 0.04], p: [0, 0.004, 0], r: [0, 0.4, 0], color: '#8a1c22' }] },
  { type: 'photo', name: 'Photographie', icon: '🖼️', description: 'Une photo compromettante.', tags: ['document', 'destructible'], useEffect: 'read', spawnRooms: [], spawnChance: 0, eventOnly: true, model: [{ kind: 'box', size: [0.15, 0.004, 0.1], p: [0, 0.002, 0], r: [0, -0.3, 0], color: '#f4f4f0' }, { kind: 'box', size: [0.13, 0.005, 0.08], p: [0, 0.003, 0], r: [0, -0.3, 0], color: '#3a3430' }] },
];

export const objectTypeDef = (type: string) => OBJECT_TYPES.find((o) => o.type === type);
