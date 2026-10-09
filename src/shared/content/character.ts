/**
 * Contenu de personnalisation des personnages — 100 % data-driven.
 * Ajouter une coiffure / tenue / teinte = ajouter une entrée ici. Aucun composant à modifier.
 *
 * Repère SVG de l'avatar : viewBox 0 0 200 320, tête centrée en (100, 72).
 */
import type { Appearance, Character } from '../types';
import type { CastMember } from './cast';

export interface SkinTone {
  id: string;
  name: string;
  color: string;
}

export interface HairColor {
  id: string;
  name: string;
  color: string;
}

/**
 * Coiffure 3D décrite par des primitives (mètres, repère centré sur la tête, +z = visage).
 * cap = calotte (demi-ellipsoïde), sphere / box / capsule = volumes.
 */
export interface HairPart3D {
  kind: 'cap' | 'sphere' | 'box' | 'capsule';
  p: [number, number, number];
  s: [number, number, number];
  r?: [number, number, number];
  /** couche rasée (plus sombre / translucide) */
  shade?: boolean;
}

export interface HairStyle {
  id: string;
  name: string;
  parts3d: HairPart3D[];
  /** Couche derrière la tête (cheveux longs, chignon…) */
  back?: string;
  /** Couche devant (frange, dessus) */
  front: string;
  /** Couche translucide (côtés rasés) */
  shade?: string;
}

export type TopStyle =
  | 'tee'
  | 'shirt'
  | 'hoodie'
  | 'blazer'
  | 'sweater'
  | 'tank'
  | 'dress'
  | 'gown'
  | 'jacket'
  | 'polo'
  | 'coat'
  | 'turtleneck';
export type BottomStyle = 'pants' | 'jeans' | 'shorts' | 'skirt' | 'joggers';
export type OutfitDetail = 'none' | 'tie' | 'bowtie' | 'logo' | 'belt' | 'scarf' | 'zip' | 'vest';
export type OutfitPattern = 'none' | 'stripes' | 'checks' | 'dots';

export interface Outfit {
  id: string;
  name: string;
  category: 'casual' | 'élégant' | 'professionnel' | 'streetwear' | 'soirée' | 'sportif';
  top: { style: TopStyle; color: string; accent: string; pattern?: OutfitPattern; patternColor?: string };
  bottom: { style: BottomStyle; color: string };
  shoes: string;
  detail: OutfitDetail;
  detailColor?: string;
  /** Description des fibres textiles (indice médico-légal). */
  fiber: string;
}

export const SKIN_TONES: SkinTone[] = [
  { id: 'porcelain', name: 'Porcelaine', color: '#f6dcc8' },
  { id: 'ivory', name: 'Ivoire', color: '#edc6a6' },
  { id: 'sand', name: 'Sable', color: '#e0ac85' },
  { id: 'honey', name: 'Miel', color: '#c98e62' },
  { id: 'caramel', name: 'Caramel', color: '#b07448' },
  { id: 'hazel', name: 'Noisette', color: '#8d5a36' },
  { id: 'cocoa', name: 'Cacao', color: '#6b4128' },
  { id: 'ebony', name: 'Ébène', color: '#4a2c1d' },
];

export const HAIR_COLORS: HairColor[] = [
  { id: 'black', name: 'Noir', color: '#1b1714' },
  { id: 'darkbrown', name: 'Brun', color: '#3b2619' },
  { id: 'chestnut', name: 'Châtain', color: '#6b4428' },
  { id: 'auburn', name: 'Auburn', color: '#8e3b1f' },
  { id: 'copper', name: 'Roux', color: '#b4532a' },
  { id: 'blond', name: 'Blond', color: '#d4b06a' },
  { id: 'platinum', name: 'Platine', color: '#e9dcb6' },
  { id: 'grey', name: 'Gris', color: '#9c9a96' },
];

const SLICK_FRONT =
  'M68,72 C64,38 82,28 100,28 C118,28 136,38 132,72 C126,52 114,44 100,44 C86,44 74,52 68,72 Z';

export const HAIR_STYLES: HairStyle[] = [
  {
    id: 'buzz',
    name: 'Rasé court',
    parts3d: [{ kind: 'cap', p: [0, 0.005, -0.005], s: [0.131, 0.152, 0.141] }],
    front: 'M70,70 C68,40 84,32 100,32 C116,32 132,40 130,70 C126,54 116,46 100,46 C84,46 74,54 70,70 Z',
  },
  {
    id: 'classic',
    name: 'Raie sur le côté',
    parts3d: [{ kind: 'cap', p: [0, 0.012, -0.01], s: [0.138, 0.16, 0.15] }, { kind: 'box', p: [0.025, 0.125, 0.03], s: [0.2, 0.05, 0.2], r: [0.15, 0, -0.18] }],
    front:
      'M67,78 C62,40 80,26 102,26 C124,26 140,42 133,78 C130,60 124,50 112,48 C98,58 82,52 76,48 C70,56 68,66 67,78 Z',
  },
  {
    id: 'quiff',
    name: 'Banane',
    parts3d: [{ kind: 'cap', p: [0, 0.01, -0.01], s: [0.136, 0.156, 0.146] }, { kind: 'box', p: [0, 0.155, 0.06], s: [0.17, 0.09, 0.13], r: [-0.45, 0, 0] }],
    front:
      'M68,72 C62,38 78,18 104,14 C132,12 144,34 134,72 C130,54 122,46 108,46 C94,46 80,50 72,58 Z',
  },
  {
    id: 'curly',
    name: 'Bouclé volumineux',
    parts3d: [{ kind: 'sphere', p: [0, 0.07, -0.05], s: [0.18, 0.16, 0.16] }, { kind: 'sphere', p: [0.11, 0.1, 0.04], s: [0.07, 0.07, 0.07] }, { kind: 'sphere', p: [-0.11, 0.1, 0.04], s: [0.07, 0.07, 0.07] }, { kind: 'sphere', p: [0, 0.15, 0.06], s: [0.08, 0.06, 0.07] }],
    back: 'M100,16 C140,14 152,44 150,72 C150,98 138,110 128,96 L72,96 C62,110 50,98 50,72 C48,44 60,14 100,16 Z',
    front:
      'M62,62 C60,34 80,24 100,24 C120,24 140,34 138,62 C134,56 128,52 122,56 C118,48 110,46 104,52 C98,44 88,46 84,54 C78,50 70,52 66,60 Z',
  },
  {
    id: 'long',
    name: 'Long lisse',
    parts3d: [{ kind: 'cap', p: [0, 0.012, -0.01], s: [0.138, 0.16, 0.15] }, { kind: 'box', p: [0, -0.12, -0.1], s: [0.27, 0.38, 0.07] }, { kind: 'box', p: [0.125, -0.06, -0.02], s: [0.03, 0.26, 0.14] }, { kind: 'box', p: [-0.125, -0.06, -0.02], s: [0.03, 0.26, 0.14] }],
    back: 'M64,64 C60,30 82,24 100,24 C118,24 140,30 136,64 L142,168 C122,176 78,176 58,168 Z',
    front:
      'M66,78 C62,36 80,28 100,28 C120,28 138,36 134,78 C128,56 116,46 100,46 C86,46 74,56 66,78 Z',
  },
  {
    id: 'bob',
    name: 'Carré',
    parts3d: [{ kind: 'cap', p: [0, 0.015, -0.005], s: [0.142, 0.165, 0.152] }, { kind: 'box', p: [0, -0.04, -0.035], s: [0.3, 0.17, 0.23] }],
    back: 'M62,64 C58,30 82,22 100,22 C118,22 142,30 138,64 L140,116 C128,122 116,118 112,112 L88,112 C84,118 72,122 60,116 Z',
    front: 'M64,70 C60,34 80,24 100,24 C120,24 140,34 136,70 L134,58 C120,53 80,53 66,58 Z',
  },
  {
    id: 'ponytail',
    name: 'Queue de cheval',
    parts3d: [{ kind: 'cap', p: [0, 0.01, -0.01], s: [0.134, 0.155, 0.145] }, { kind: 'sphere', p: [0, 0.03, -0.15], s: [0.05, 0.05, 0.05] }, { kind: 'capsule', p: [0, -0.1, -0.2], s: [0.04, 0.2, 0.04], r: [0.35, 0, 0] }],
    back: 'M120,40 C152,40 160,82 152,132 C148,152 136,152 138,128 C142,96 138,70 124,60 Z',
    front: SLICK_FRONT,
  },
  {
    id: 'bun',
    name: 'Chignon',
    parts3d: [{ kind: 'cap', p: [0, 0.01, -0.01], s: [0.134, 0.155, 0.145] }, { kind: 'sphere', p: [0, 0.12, -0.11], s: [0.075, 0.07, 0.075] }],
    back: 'M84,22 a16,16 0 1,0 32,0 a16,16 0 1,0 -32,0 Z',
    front: SLICK_FRONT,
  },
  {
    id: 'wavy',
    name: 'Long ondulé',
    parts3d: [{ kind: 'cap', p: [0, 0.015, -0.01], s: [0.142, 0.165, 0.153] }, { kind: 'box', p: [0, -0.14, -0.09], s: [0.31, 0.42, 0.09], r: [0.08, 0, 0] }, { kind: 'sphere', p: [0.12, -0.33, -0.07], s: [0.06, 0.06, 0.06] }, { kind: 'sphere', p: [-0.12, -0.33, -0.07], s: [0.06, 0.06, 0.06] }, { kind: 'box', p: [0.13, -0.08, 0], s: [0.04, 0.3, 0.13] }, { kind: 'box', p: [-0.13, -0.08, 0], s: [0.04, 0.3, 0.13] }],
    back: 'M64,62 C56,30 82,22 100,22 C118,22 144,30 136,62 C148,90 134,110 146,140 C150,160 130,170 120,160 C110,170 90,170 80,160 C70,170 50,160 54,140 C66,110 52,90 64,62 Z',
    front:
      'M66,80 C60,36 84,24 104,26 C124,28 140,40 134,80 C130,62 124,52 116,48 C104,60 84,62 72,58 C68,64 66,72 66,80 Z',
  },
  {
    id: 'mohawk',
    name: 'Crête',
    parts3d: [{ kind: 'cap', p: [0, 0.003, -0.003], s: [0.128, 0.149, 0.138], shade: true }, { kind: 'box', p: [0, 0.155, -0.01], s: [0.045, 0.1, 0.27] }],
    shade: 'M70,70 C68,44 82,36 100,36 C118,36 132,44 130,70 C126,56 116,50 100,50 C84,50 74,56 70,70 Z',
    front: 'M90,52 C88,30 94,10 100,6 C106,10 112,30 110,52 Z',
  },
];

export const OUTFITS: Outfit[] = [
  { id: 'casual_white', name: 'Casual blanc', category: 'casual', top: { style: 'tee', color: '#e9e6df', accent: '#c9c4ba' }, bottom: { style: 'jeans', color: '#3c5a86' }, shoes: '#f2f2f2', detail: 'none', fiber: 'coton blanc' },
  { id: 'weekend_grey', name: 'Week-end', category: 'casual', top: { style: 'hoodie', color: '#7d8087', accent: '#5f6268' }, bottom: { style: 'joggers', color: '#2f3238' }, shoes: '#d8d8d8', detail: 'none', fiber: 'molleton gris' },
  { id: 'street_neon', name: 'Streetwear néon', category: 'streetwear', top: { style: 'hoodie', color: '#141416', accent: '#2a2a2e' }, bottom: { style: 'joggers', color: '#141416' }, shoes: '#b6ff3b', detail: 'logo', detailColor: '#b6ff3b', fiber: 'polyester noir' },
  { id: 'suit_charcoal', name: 'Costume anthracite', category: 'professionnel', top: { style: 'blazer', color: '#34363c', accent: '#f1f1ee' }, bottom: { style: 'pants', color: '#34363c' }, shoes: '#1c1612', detail: 'tie', detailColor: '#7a1f2b', fiber: 'laine anthracite' },
  { id: 'tuxedo', name: 'Smoking', category: 'soirée', top: { style: 'blazer', color: '#111114', accent: '#fafafa' }, bottom: { style: 'pants', color: '#111114' }, shoes: '#0a0a0a', detail: 'bowtie', detailColor: '#0a0a0a', fiber: 'satin noir' },
  { id: 'gown_red', name: 'Robe de soirée rouge', category: 'soirée', top: { style: 'gown', color: '#9b1626', accent: '#c22a3c' }, bottom: { style: 'pants', color: '#9b1626' }, shoes: '#2a0a0e', detail: 'none', fiber: 'soie rouge' },
  { id: 'little_black', name: 'Petite robe noire', category: 'élégant', top: { style: 'dress', color: '#18171c', accent: '#2c2a32' }, bottom: { style: 'pants', color: '#18171c' }, shoes: '#0a0a0a', detail: 'belt', detailColor: '#c9a45c', fiber: 'crêpe noir' },
  { id: 'lab_coat', name: 'Blouse de médecin', category: 'professionnel', top: { style: 'coat', color: '#f4f6f7', accent: '#9fc3d6' }, bottom: { style: 'pants', color: '#2b3a55' }, shoes: '#262626', detail: 'none', fiber: 'coton blanc épais' },
  { id: 'trench', name: 'Trench beige', category: 'élégant', top: { style: 'coat', color: '#b79a6d', accent: '#8d7450' }, bottom: { style: 'pants', color: '#4a3a2c' }, shoes: '#2a1d14', detail: 'belt', detailColor: '#6f5a3e', fiber: 'gabardine beige' },
  { id: 'sport_red', name: 'Sportif', category: 'sportif', top: { style: 'tank', color: '#c4302b', accent: '#ffffff' }, bottom: { style: 'shorts', color: '#1d1d22' }, shoes: '#f0f0f0', detail: 'none', fiber: 'synthétique rouge' },
  { id: 'track_blue', name: 'Survêtement bleu', category: 'sportif', top: { style: 'jacket', color: '#1f4fa8', accent: '#ffffff' }, bottom: { style: 'joggers', color: '#1f4fa8' }, shoes: '#ffffff', detail: 'zip', detailColor: '#ffffff', fiber: 'nylon bleu' },
  { id: 'polo_green', name: 'Polo de golf', category: 'casual', top: { style: 'polo', color: '#2f6b4f', accent: '#e8e2d0' }, bottom: { style: 'pants', color: '#cdbf9c' }, shoes: '#6b4a2e', detail: 'none', fiber: 'piqué vert' },
  { id: 'sailor', name: 'Marinière', category: 'casual', top: { style: 'sweater', color: '#f3efe6', accent: '#1d2c55', pattern: 'stripes', patternColor: '#1d2c55' }, bottom: { style: 'pants', color: '#1d2c55' }, shoes: '#f3efe6', detail: 'none', fiber: 'jersey rayé bleu marine' },
  { id: 'rock_leather', name: 'Cuir rock', category: 'streetwear', top: { style: 'jacket', color: '#1a1a1c', accent: '#59595e' }, bottom: { style: 'jeans', color: '#22252e' }, shoes: '#0d0d0d', detail: 'zip', detailColor: '#b5b5b5', fiber: 'cuir noir' },
  { id: 'lumberjack', name: 'Chemise à carreaux', category: 'casual', top: { style: 'shirt', color: '#a3282c', accent: '#1d1d1d', pattern: 'checks', patternColor: '#1d1d1d' }, bottom: { style: 'jeans', color: '#33507a' }, shoes: '#5a3a1e', detail: 'none', fiber: 'flanelle rouge' },
  { id: 'boheme', name: 'Bohème', category: 'élégant', top: { style: 'dress', color: '#c99a2e', accent: '#7a4f12', pattern: 'dots', patternColor: '#f6ead0' }, bottom: { style: 'pants', color: '#c99a2e' }, shoes: '#7a4f12', detail: 'none', fiber: 'viscose moutarde' },
  { id: 'butler', name: 'Majordome', category: 'professionnel', top: { style: 'blazer', color: '#121216', accent: '#f4f4f2' }, bottom: { style: 'pants', color: '#121216' }, shoes: '#050505', detail: 'vest', detailColor: '#6e6e72', fiber: 'laine noire' },
  { id: 'gardener', name: 'Jardinier', category: 'casual', top: { style: 'shirt', color: '#8a8152', accent: '#5f5934' }, bottom: { style: 'pants', color: '#4c5232' }, shoes: '#3b2a1a', detail: 'belt', detailColor: '#3b2a1a', fiber: 'toile kaki' },
  { id: 'blue_suit', name: 'Tailleur bleu roi', category: 'professionnel', top: { style: 'blazer', color: '#24439c', accent: '#f3f3f3' }, bottom: { style: 'skirt', color: '#24439c' }, shoes: '#111111', detail: 'scarf', detailColor: '#e3b23c', fiber: 'laine bleu roi' },
  { id: 'velvet', name: 'Col roulé velours', category: 'élégant', top: { style: 'turtleneck', color: '#6a1d34', accent: '#4f1526' }, bottom: { style: 'pants', color: '#1f1c22' }, shoes: '#1a1210', detail: 'none', fiber: 'velours bordeaux' },
];

export const APPEARANCES: { id: Appearance; name: string }[] = [
  { id: 'masculine', name: 'Masculine' },
  { id: 'feminine', name: 'Féminine' },
];

export const findSkinTone = (id: string) => SKIN_TONES.find((s) => s.id === id) ?? SKIN_TONES[2];
export const findHairColor = (id: string) => HAIR_COLORS.find((s) => s.id === id) ?? HAIR_COLORS[1];
export const findHairStyle = (id: string) => HAIR_STYLES.find((s) => s.id === id) ?? HAIR_STYLES[1];
export const findOutfit = (id: string) => OUTFITS.find((s) => s.id === id) ?? OUTFITS[0];

/** Personnage de partie à partir du catalogue (les champs de repli sont déduits de façon stable). */
export function characterFromCast(m: CastMember): Character {
  let h = 0;
  for (const ch of m.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return {
    castId: m.id,
    firstName: m.firstName,
    lastName: m.lastName,
    appearance: m.gender,
    skinTone: SKIN_TONES[h % SKIN_TONES.length].id,
    hairStyleId: HAIR_STYLES[(h >> 3) % HAIR_STYLES.length].id,
    hairColor: HAIR_COLORS[(h >> 6) % HAIR_COLORS.length].id,
    outfitId: OUTFITS[(h >> 9) % OUTFITS.length].id,
  };
}
