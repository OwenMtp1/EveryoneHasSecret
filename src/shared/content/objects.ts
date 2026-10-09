/**
 * Types d'objets — catalogue VISUEL et GÉNÉRIQUE (partagé avec le navigateur).
 *
 * Ce fichier ne contient AUCUN contenu d'enquête : le texte des documents, les codes, les personnes
 * impliquées et l'emplacement des preuves sont générés côté serveur à chaque partie
 * (server/game/case) et n'arrivent au client qu'une fois découverts.
 *
 * Le moteur ne connaît pas « le téléphone de la victime » : il connaît des tags et des capacités
 * génériques (verrou à code, lecteur de carte, contenant, document brûlable…).
 *
 * Objets volontairement absents (exclus du jeu, ni sous ce nom ni sous un autre) : horloge et montre,
 * enregistreur audio, dictaphone, disque dur externe, tableau blanc, plateau à boissons,
 * badge d'accès, disjoncteur secondaire, sonnette connectée, caméra de surveillance.
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
  | 'gloves'
  | 'document'
  | 'destructible'
  | 'device'
  | 'media'
  | 'container'
  | 'personal';

export type UseEffect =
  | 'unlock' // clé : porte, contenant ou meuble verrouillé correspondant, à proximité
  | 'force' // force une porte verrouillée (bruit + trace)
  | 'toggle_light'
  | 'read' // document : lecture du contenu
  | 'device' // appareil : contenu derrière un code éventuel
  | 'open' // contenant : ouverture (code ou clé)
  | 'insert' // support (carte mémoire, clé USB) : lu dans un appareil compatible
  | 'wear' // gants : ne laissent plus d'empreintes
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
const PAPER = '#efe7d4';

export interface ObjectTypeDef {
  type: string;
  name: string;
  icon: string;
  /** description générique (le contenu d'une preuve vient du serveur) */
  description: string;
  tags: ObjectTag[];
  useEffect?: UseEffect;
  /** clés de porte : serrure ouverte */
  unlocks?: string;
  /** classe d'arme pour l'autopsie */
  weaponClass?: 'sharp' | 'blunt' | 'strangle';
  /** support lisible par ces appareils */
  readBy?: string[];
  /** objets d'ambiance présents dans toutes les parties (les preuves sont placées par l'affaire) */
  spawnRooms: string[];
  spawnChance: number;
  /** objet placé uniquement par l'affaire */
  eventOnly?: boolean;
  model?: ModelPart[];
}

const doc = (color = PAPER, w = 0.21, d = 0.15): ModelPart[] => [{ kind: 'box', size: [w, 0.004, d], p: [0, 0.002, 0], r: [0, 0.3, 0], color }];

export const OBJECT_TYPES: ObjectTypeDef[] = [
  // ── appareils et supports numériques ──
  { type: 'phone', name: 'Téléphone', icon: '📱', description: 'Un smartphone. L’écran s’allume : il demande un code.', tags: ['device', 'personal'], useEffect: 'device', spawnRooms: [], spawnChance: 0, eventOnly: true, model: [{ kind: 'box', size: [0.075, 0.009, 0.155], p: [0, 0.005, 0], color: BLACK, rough: 0.2, metal: 0.3 }, { kind: 'box', size: [0.068, 0.002, 0.145], p: [0, 0.0105, 0], color: '#0b1a2a', emissive: '#1e4a7a' }] },
  { type: 'laptop', name: 'Ordinateur portable', icon: '💻', description: 'Un ordinateur portable protégé par un mot de passe.', tags: ['device'], useEffect: 'device', spawnRooms: [], spawnChance: 0, eventOnly: true, model: [{ kind: 'box', size: [0.34, 0.018, 0.24], p: [0, 0.009, 0], color: '#9a9ea6', metal: 0.7, rough: 0.35 }, { kind: 'box', size: [0.34, 0.22, 0.01], p: [0, 0.12, -0.12], r: [-0.25, 0, 0], color: '#9a9ea6', metal: 0.7, rough: 0.35 }, { kind: 'box', size: [0.31, 0.19, 0.002], p: [0, 0.12, -0.112], r: [-0.25, 0, 0], color: '#0d1724', emissive: '#16324f' }] },
  { type: 'usb_key', name: 'Clé USB', icon: '🔌', description: 'Une petite clé USB. Il faut un ordinateur pour la lire.', tags: ['media'], useEffect: 'insert', readBy: ['laptop'], spawnRooms: [], spawnChance: 0, eventOnly: true, model: [{ kind: 'box', size: [0.05, 0.008, 0.018], p: [0, 0.004, 0], color: '#2c5aa8', rough: 0.4 }, { kind: 'box', size: [0.014, 0.005, 0.012], p: [0.031, 0.004, 0], color: STEEL, metal: 0.9 }] },
  { type: 'camera', name: 'Appareil photo', icon: '📷', description: 'Un appareil photo compact. Son logement de carte mémoire est vide.', tags: ['device'], useEffect: 'device', spawnRooms: [], spawnChance: 0, eventOnly: true, model: [{ kind: 'box', size: [0.11, 0.065, 0.045], p: [0, 0.033, 0], color: '#232326', rough: 0.4 }, { kind: 'cyl', size: [0.024, 0.03], p: [0, 0.033, 0.034], r: [1.5708, 0, 0], color: '#111', metal: 0.5 }] },
  { type: 'memory_card', name: 'Carte mémoire', icon: '💾', description: 'Une carte SD. À lire dans un appareil photo ou un ordinateur.', tags: ['media', 'destructible'], useEffect: 'insert', readBy: ['camera', 'laptop'], spawnRooms: [], spawnChance: 0, eventOnly: true, model: [{ kind: 'box', size: [0.024, 0.003, 0.032], p: [0, 0.002, 0], color: '#2a2a30' }] },
  // ── documents ──
  { type: 'letter', name: 'Lettre', icon: '✉️', description: 'Une lettre.', tags: ['document', 'destructible'], useEffect: 'read', spawnRooms: [], spawnChance: 0, eventOnly: true, model: [...doc('#efe4c8', 0.2, 0.14), { kind: 'box', size: [0.04, 0.005, 0.04], p: [0, 0.004, 0], r: [0, 0.4, 0], color: '#8a1c22' }] },
  { type: 'diary', name: 'Journal intime', icon: '📔', description: 'Un carnet relié de cuir, rempli d’une écriture serrée.', tags: ['document', 'destructible', 'personal'], useEffect: 'read', spawnRooms: [], spawnChance: 0, eventOnly: true, model: [{ kind: 'box', size: [0.15, 0.025, 0.21], p: [0, 0.013, 0], r: [0, 0.2, 0], color: '#5a2e1c', rough: 0.7 }] },
  { type: 'note', name: 'Note manuscrite', icon: '📝', description: 'Un papier griffonné à la main.', tags: ['document', 'destructible'], useEffect: 'read', spawnRooms: [], spawnChance: 0, eventOnly: true, model: doc('#f6efa0', 0.08, 0.08) },
  { type: 'receipt', name: 'Ticket de caisse', icon: '🧾', description: 'Un ticket de caisse froissé, horodaté.', tags: ['document', 'destructible'], useEffect: 'read', spawnRooms: [], spawnChance: 0, eventOnly: true, model: doc('#fbfbf6', 0.06, 0.14) },
  { type: 'report', name: 'Dossier', icon: '📁', description: 'Une chemise cartonnée contenant des documents.', tags: ['document', 'destructible'], useEffect: 'read', spawnRooms: [], spawnChance: 0, eventOnly: true, model: [{ kind: 'box', size: [0.24, 0.012, 0.32], p: [0, 0.006, 0], r: [0, -0.2, 0], color: '#c9a35b' }] },
  { type: 'newspaper', name: 'Coupure de presse', icon: '📰', description: 'Un article de journal découpé.', tags: ['document', 'destructible'], useEffect: 'read', spawnRooms: [], spawnChance: 0, eventOnly: true, model: doc('#ddd8c9', 0.18, 0.24) },
  { type: 'map', name: 'Carte annotée', icon: '🗺️', description: 'Une carte de randonnée pliée, couverte d’annotations.', tags: ['document', 'destructible'], useEffect: 'read', spawnRooms: [], spawnChance: 0, eventOnly: true, model: doc('#cfe0c3', 0.22, 0.16) },
  { type: 'bank_statement', name: 'Relevé bancaire', icon: '🏦', description: 'Un relevé de compte imprimé.', tags: ['document', 'destructible'], useEffect: 'read', spawnRooms: [], spawnChance: 0, eventOnly: true, model: doc('#eef2f6', 0.21, 0.29) },
  { type: 'photo', name: 'Photographie', icon: '🖼️', description: 'Une photographie.', tags: ['document', 'destructible'], useEffect: 'read', spawnRooms: [], spawnChance: 0, eventOnly: true, model: [{ kind: 'box', size: [0.15, 0.004, 0.1], p: [0, 0.002, 0], r: [0, -0.3, 0], color: '#f4f4f0' }, { kind: 'box', size: [0.13, 0.005, 0.08], p: [0, 0.003, 0], r: [0, -0.3, 0], color: '#3a3430' }] },
  // ── clés et contenants ──
  { type: 'key', name: 'Clé', icon: '🗝️', description: 'Une clé.', tags: ['key'], useEffect: 'unlock', spawnRooms: [], spawnChance: 0, eventOnly: true, model: [{ kind: 'torus', size: [0.022, 0.006], p: [-0.05, 0.006, 0], r: [1.5708, 0, 0], color: '#5c5a55', metal: 0.8, rough: 0.5 }, { kind: 'box', size: [0.08, 0.008, 0.008], p: [0.01, 0.006, 0], color: '#5c5a55', metal: 0.8, rough: 0.5 }, { kind: 'box', size: [0.012, 0.008, 0.025], p: [0.045, 0.006, 0.012], color: '#5c5a55', metal: 0.8, rough: 0.5 }] },
  { type: 'key_cellar', name: 'Clé de la cave', icon: '🗝️', description: 'Une vieille clé en fer. Une étiquette : « Cave ».', tags: ['key'], useEffect: 'unlock', unlocks: 'key_cellar', spawnRooms: ['office', 'bedroom2', 'garden', 'bathroom', 'suite', 'studio'], spawnChance: 1, model: [{ kind: 'torus', size: [0.022, 0.006], p: [-0.05, 0.006, 0], r: [1.5708, 0, 0], color: '#5c5a55', metal: 0.8, rough: 0.5 }, { kind: 'box', size: [0.08, 0.008, 0.008], p: [0.01, 0.006, 0], color: '#5c5a55', metal: 0.8, rough: 0.5 }] },
  { type: 'code_box', name: 'Coffret à code', icon: '🧰', description: 'Un petit coffret métallique fermé par une molette à quatre chiffres.', tags: ['container'], useEffect: 'open', spawnRooms: [], spawnChance: 0, eventOnly: true, model: [{ kind: 'box', size: [0.26, 0.14, 0.18], p: [0, 0.07, 0], color: '#3d4148', metal: 0.6, rough: 0.4 }, { kind: 'cyl', size: [0.02, 0.01], p: [0.08, 0.09, 0.092], r: [1.5708, 0, 0], color: BRASS, metal: 0.9 }] },
  { type: 'locked_box', name: 'Boîte cadenassée', icon: '📦', description: 'Une boîte en bois fermée par un cadenas.', tags: ['container'], useEffect: 'open', spawnRooms: [], spawnChance: 0, eventOnly: true, model: [{ kind: 'box', size: [0.3, 0.16, 0.2], p: [0, 0.08, 0], color: '#6b4a2c', rough: 0.8 }, { kind: 'box', size: [0.03, 0.04, 0.012], p: [0, 0.12, 0.106], color: BRASS, metal: 0.9 }] },
  // ── armes possibles ──
  { type: 'candlestick', name: 'Chandelier en bronze', icon: '🕯️', description: 'Lourd, ancien, gravé aux initiales V.B.', tags: ['weapon', 'lethal', 'blunt'], weaponClass: 'blunt', spawnRooms: [], spawnChance: 0, eventOnly: true, model: [{ kind: 'cyl', size: [0.07, 0.02], p: [0, 0.01, 0], color: BRASS, metal: 0.8, rough: 0.3 }, { kind: 'cyl', size: [0.016, 0.24], p: [0, 0.14, 0], color: BRASS, metal: 0.8, rough: 0.3 }, { kind: 'cyl', size: [0.035, 0.03], p: [0, 0.27, 0], color: BRASS, metal: 0.8, rough: 0.3 }] },
  { type: 'statuette', name: 'Statuette en marbre', icon: '🗿', description: 'Une statuette de marbre, étonnamment lourde.', tags: ['weapon', 'lethal', 'blunt'], weaponClass: 'blunt', spawnRooms: [], spawnChance: 0, eventOnly: true, model: [{ kind: 'box', size: [0.1, 0.04, 0.1], p: [0, 0.02, 0], color: '#d9d6cf', rough: 0.3 }, { kind: 'cyl', size: [0.035, 0.22], p: [0, 0.15, 0], color: '#e6e3dc', rough: 0.3 }, { kind: 'sphere', size: [0.04], p: [0, 0.29, 0], color: '#e6e3dc', rough: 0.3 }] },
  { type: 'fire_poker', name: 'Tisonnier', icon: '🔥', description: 'Un tisonnier en fer forgé.', tags: ['weapon', 'lethal', 'blunt'], weaponClass: 'blunt', spawnRooms: [], spawnChance: 0, eventOnly: true, model: [{ kind: 'cyl', size: [0.008, 0.7], p: [0, 0.01, 0], r: [0, 0, 1.5708], color: '#2a2a2a', metal: 0.8, rough: 0.5 }] },
  { type: 'letter_opener', name: 'Coupe-papier', icon: '🗡️', description: 'Un coupe-papier en argent, étonnamment pointu.', tags: ['weapon', 'lethal', 'sharp'], weaponClass: 'sharp', spawnRooms: [], spawnChance: 0, eventOnly: true, model: [{ kind: 'box', size: [0.17, 0.004, 0.02], p: [0.06, 0.008, 0], color: STEEL, metal: 0.95, rough: 0.15 }, { kind: 'box', size: [0.08, 0.014, 0.022], p: [-0.065, 0.01, 0], color: '#d8d8dc', metal: 0.9, rough: 0.2 }] },
  { type: 'knife', name: 'Couteau de cuisine', icon: '🔪', description: 'Une lame longue et parfaitement aiguisée.', tags: ['weapon', 'lethal', 'sharp'], weaponClass: 'sharp', spawnRooms: ['kitchen'], spawnChance: 1, model: [{ kind: 'box', size: [0.2, 0.006, 0.035], p: [0.07, 0.012, 0], color: STEEL, metal: 0.9, rough: 0.2 }, { kind: 'box', size: [0.11, 0.022, 0.03], p: [-0.085, 0.014, 0], color: BLACK }] },
  { type: 'rope', name: 'Corde', icon: '🪢', description: 'Une corde de chanvre rêche, assez longue.', tags: ['weapon', 'lethal', 'strangle'], weaponClass: 'strangle', spawnRooms: ['cellar', 'garden'], spawnChance: 0.9, model: [{ kind: 'torus', size: [0.1, 0.018], p: [0, 0.018, 0], r: [1.5708, 0, 0], color: '#8a6a3c' }] },
  // ── dissimulation et manipulation ──
  { type: 'lighter', name: 'Briquet', icon: '🔥', description: 'Un briquet tempête en laiton : de quoi brûler un papier.', tags: ['fire'], spawnRooms: ['living', 'garden', 'office', 'studio'], spawnChance: 1, model: [{ kind: 'box', size: [0.04, 0.06, 0.016], p: [0, 0.03, 0], color: BRASS, metal: 0.9, rough: 0.25 }] },
  { type: 'cloth', name: 'Torchon', icon: '🧻', description: 'Un torchon propre. Pour essuyer… n’importe quoi.', tags: ['cleaning'], spawnRooms: ['kitchen', 'bathroom', 'bathroom2'], spawnChance: 1, model: [{ kind: 'box', size: [0.26, 0.012, 0.2], p: [0, 0.006, 0], r: [0, 0.3, 0], color: '#e8e2d2' }] },
  { type: 'gloves', name: 'Gants de jardinage', icon: '🧤', description: 'En les portant, on ne laisse plus d’empreintes sur ce qu’on touche.', tags: ['gloves'], useEffect: 'wear', spawnRooms: ['garden', 'cellar', 'studio'], spawnChance: 1, model: [{ kind: 'box', size: [0.1, 0.02, 0.16], p: [0, 0.01, 0], r: [0, 0.4, 0], color: '#6d7d3b', rough: 0.9 }, { kind: 'box', size: [0.1, 0.02, 0.16], p: [0.05, 0.03, 0.02], r: [0, -0.2, 0], color: '#6d7d3b', rough: 0.9 }] },
  { type: 'flashlight', name: 'Lampe torche', icon: '🔦', description: 'Elle fonctionne encore. Utile si le courant saute.', tags: ['light'], useEffect: 'toggle_light', spawnRooms: ['kitchen', 'hall', 'bedroom1', 'guestroom'], spawnChance: 1, model: [{ kind: 'cyl', size: [0.02, 0.16], p: [-0.02, 0.022, 0], r: [0, 0, 1.5708], color: BLACK, rough: 0.4 }, { kind: 'cyl', size: [0.026, 0.004], p: [0.1, 0.03, 0], r: [0, 0, 1.5708], color: '#fff6d8', emissive: '#fff1c4' }] },
  // ── objets personnels et traces ──
  { type: 'bracelet', name: 'Bracelet', icon: '📿', description: 'Un bracelet.', tags: ['personal'], useEffect: 'read', spawnRooms: [], spawnChance: 0, eventOnly: true, model: [{ kind: 'torus', size: [0.035, 0.005], p: [0, 0.005, 0], r: [1.5708, 0, 0], color: '#c9a35b', metal: 0.9, rough: 0.2 }] },
  { type: 'scarf', name: 'Écharpe', icon: '🧣', description: 'Une écharpe.', tags: ['personal'], useEffect: 'read', spawnRooms: [], spawnChance: 0, eventOnly: true, model: [{ kind: 'box', size: [0.5, 0.02, 0.14], p: [0, 0.01, 0], r: [0, 0.6, 0], color: '#7a2433', rough: 0.95 }] },
  { type: 'car_keys', name: 'Clés de voiture', icon: '🚗', description: 'Un trousseau de clés de voiture.', tags: ['personal'], useEffect: 'read', spawnRooms: [], spawnChance: 0, eventOnly: true, model: [{ kind: 'box', size: [0.035, 0.012, 0.06], p: [0, 0.006, 0], color: BLACK }, { kind: 'torus', size: [0.016, 0.003], p: [0, 0.004, -0.04], r: [1.5708, 0, 0], color: STEEL, metal: 0.9 }] },
];

export const objectTypeDef = (type: string) => OBJECT_TYPES.find((o) => o.type === type);
