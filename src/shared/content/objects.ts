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
}

export const OBJECT_TYPES: ObjectTypeDef[] = [
  { type: 'knife', name: 'Couteau de cuisine', icon: '🔪', description: 'Une lame longue et parfaitement aiguisée.', tags: ['weapon', 'lethal', 'sharp'], weaponClass: 'sharp', spawnRooms: ['kitchen'], spawnChance: 1 },
  { type: 'candlestick', name: 'Chandelier en bronze', icon: '🕯️', description: 'Lourd, ancien, gravé aux initiales V.B.', tags: ['weapon', 'lethal', 'blunt'], weaponClass: 'blunt', spawnRooms: ['living', 'office', 'hall'], spawnChance: 1 },
  { type: 'rope', name: 'Corde', icon: '🪢', description: 'Une corde de chanvre rêche, assez longue.', tags: ['weapon', 'lethal', 'strangle'], weaponClass: 'strangle', spawnRooms: ['cellar', 'garden'], spawnChance: 0.9 },
  { type: 'letter_opener', name: 'Coupe-papier', icon: '🗡️', description: 'Un coupe-papier en argent, étonnamment pointu.', tags: ['weapon', 'lethal', 'sharp'], weaponClass: 'sharp', spawnRooms: ['office'], spawnChance: 0.8 },
  { type: 'wine_bottle', name: 'Bouteille de vin', icon: '🍾', description: 'Un grand cru de 1982. Lourde.', tags: ['weapon', 'lethal', 'blunt'], weaponClass: 'blunt', spawnRooms: ['cellar', 'kitchen', 'living'], spawnChance: 0.9 },
  { type: 'key_cellar', name: 'Clé en fer', icon: '🗝️', description: 'Une vieille clé. Une étiquette : « Cave ».', tags: ['key'], useEffect: 'unlock', unlocks: 'key_cellar', spawnRooms: ['office', 'bedroom2', 'garden', 'bathroom'], spawnChance: 1 },
  { type: 'screwdriver', name: 'Tournevis', icon: '🪛', description: 'Assez solide pour forcer une serrure… bruyamment.', tags: ['tool'], useEffect: 'force', spawnRooms: ['garden', 'exterior', 'cellar'], spawnChance: 0.8 },
  { type: 'flashlight', name: 'Lampe torche', icon: '🔦', description: 'Elle fonctionne encore. Utile si le courant saute.', tags: ['light'], useEffect: 'toggle_light', spawnRooms: ['kitchen', 'hall', 'bedroom1'], spawnChance: 1 },
  { type: 'cloth', name: 'Torchon', icon: '🧻', description: 'Un torchon propre. Pour nettoyer… n’importe quoi.', tags: ['cleaning'], spawnRooms: ['kitchen', 'bathroom'], spawnChance: 1 },
  { type: 'lighter', name: 'Briquet', icon: '🔥', description: 'Un briquet tempête en laiton.', tags: ['fire'], spawnRooms: ['living', 'garden', 'office'], spawnChance: 0.9 },
  { type: 'phone', name: 'Téléphone', icon: '📱', description: 'Un smartphone sans code. À qui est-il ?', tags: ['device'], useEffect: 'phone', spawnRooms: ['living', 'bedroom1', 'bedroom2'], spawnChance: 0.8 },
  { type: 'medicine', name: 'Somnifères', icon: '💊', description: 'Un flacon presque vide.', tags: ['medicine'], useEffect: 'calm', spawnRooms: ['bathroom', 'bedroom2'], spawnChance: 0.7 },
  { type: 'watch', name: 'Montre à gousset', icon: '⌚', description: 'Arrêtée à 23:12. Gravée « À V., pour toujours ».', tags: ['valuable'], spawnRooms: ['bedroom1', 'office', 'hall'], spawnChance: 0.6 },
  { type: 'badge', name: 'Badge d’accès', icon: '🪪', description: 'Badge de « Beaumont Industries ». Photo arrachée.', tags: [], spawnRooms: ['office', 'exterior'], spawnChance: 0.6 },
  { type: 'necklace', name: 'Collier Beaumont', icon: '📿', description: 'Des diamants. Il vaut plus que la villa elle-même.', tags: ['valuable'], spawnRooms: ['bedroom2'], spawnChance: 1 },
  { type: 'letter', name: 'Lettre', icon: '✉️', description: 'Une lettre pliée en quatre.', tags: ['document', 'destructible'], useEffect: 'read', spawnRooms: ['hall'], spawnChance: 0, eventOnly: true },
  { type: 'photo', name: 'Photographie', icon: '🖼️', description: 'Une photo compromettante.', tags: ['document', 'destructible'], useEffect: 'read', spawnRooms: [], spawnChance: 0, eventOnly: true },
];

export const objectTypeDef = (type: string) => OBJECT_TYPES.find((o) => o.type === type);
