/**
 * Configuration du pipeline des personnages : choix des avatars Rocketbox et des animations.
 * Les métadonnées (noms, tenues…) vivent dans src/shared/content/cast.ts ; elles doivent rester
 * cohérentes avec cette table (même castId → même avatar).
 */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const OUT = join(ROOT, 'public', 'characters');
/** Fichiers intermédiaires (conversions FBX, textures redimensionnées) */
export const WORK = process.env.CAST_WORK_DIR ?? join(tmpdir(), 'cast-pipeline');
/** Convertisseur FBX → glTF (paquet npm « fbx2gltf », binaire Linux) */
export const FBX2GLTF = process.env.FBX2GLTF ?? '/tmp/claude-0/fbx/node_modules/fbx2gltf/bin/Linux/FBX2glTF';

/** castId → avatar Rocketbox. 20 femmes, 20 hommes ; pas d'uniformes. */
export const CAST_SOURCES = {
  f01: 'Female_Adult_01',
  f02: 'Female_Adult_02',
  f03: 'Female_Adult_03',
  f04: 'Female_Adult_04',
  f05: 'Female_Adult_05',
  f06: 'Female_Adult_06',
  f07: 'Female_Adult_07',
  f08: 'Female_Adult_08',
  f09: 'Female_Adult_09',
  f10: 'Female_Adult_11',
  f11: 'Female_Adult_12',
  f12: 'Female_Adult_13',
  f13: 'Female_Adult_14',
  f14: 'Female_Adult_15',
  f15: 'Female_Adult_17',
  f16: 'Female_Party_01',
  f17: 'Female_Party_02',
  f18: 'Business_Female_01',
  f19: 'Business_Female_02',
  f20: 'Business_Female_03',
  m01: 'Male_Adult_01',
  m02: 'Male_Adult_02',
  m03: 'Male_Adult_03',
  m04: 'Male_Adult_04',
  m05: 'Male_Adult_05',
  m06: 'Male_Adult_06',
  m07: 'Male_Adult_07',
  m08: 'Male_Adult_08',
  m09: 'Male_Adult_09',
  m10: 'Male_Adult_10',
  m11: 'Male_Adult_12',
  m12: 'Male_Adult_13',
  m13: 'Male_Adult_17',
  m14: 'Male_Adult_18',
  m15: 'Male_Adult_20',
  m16: 'Business_Male_04',
  m17: 'Business_Male_05',
  m18: 'Business_Male_07',
  m19: 'Wood_Male_01',
  m20: 'Delivery_Male_01',
};

/** Tailles des textures (px) */
export const TEX = { head: 1024, body: 1024, hair: 512, glasses: 256, normal: 512 };

/**
 * Clips partagés (un fichier par genre). `loop` : cycle ; `locomotion` : la translation horizontale
 * de la racine est retirée (en place) et la vitesse mesurée est consignée dans le fichier.
 * Pas d'animation « mort / allongé » dans Rocketbox : la pose au sol est faite par le code.
 */
export const CLIPS = [
  { name: 'idle', f: 'static/f_idle_neutral_01', m: 'static/m_idle_neutral_01', loop: true },
  { name: 'idle2', f: 'static/f_idle_look_around_01', m: 'static/m_idle_look_around_01', loop: true },
  { name: 'walk_slow', f: 'xy/f_walk_neutral_01', m: 'xy/m_walk_neutral_01', loop: true, locomotion: true },
  { name: 'walk', f: 'xy/f_walk_fast_02', m: 'xy/m_walk_fast_02', loop: true, locomotion: true },
  { name: 'run', f: 'xy/f_run_neutral_01', m: 'xy/m_run_neutral_01', loop: true, locomotion: true },
  { name: 'crouch', f: 'static/f_crouch_idle', m: 'static/m_crouch_idle', loop: true },
  { name: 'search', f: 'static/f_crouch_gestic', m: 'static/m_crouch_gestic', loop: true },
  { name: 'talk', f: 'static/f_gestic_talk_neutral_01', m: 'static/m_gestic_talk_neutral_01', loop: true },
  { name: 'listen', f: 'static/f_gestic_listen_neutral_01', m: 'static/m_gestic_listen_neutral_01', loop: true },
  { name: 'point', f: 'static/f_gestic_presentation_right_01', m: 'static/m_gestic_presentation_right_01', loop: false },
  { name: 'wave', f: 'static/f_wave_01', m: 'static/m_wave_01', loop: false },
  { name: 'shrug', f: 'static/f_gestic_shrug_01', m: 'static/m_gestic_shrug_01', loop: false },
  { name: 'laugh', f: 'static/f_gestic_laugh_low', m: 'static/m_gestic_laugh_low', loop: false },
  { name: 'examine', f: 'static/f_documents_check', m: 'static/m_documents_check', loop: false },
  { name: 'sit', f: 'static/f_sit_chair_idle_neutral_01', m: 'static/m_sit_chair_idle_neutral_01', loop: true },
  { name: 'sit_talk', f: 'static/f_sit_chair_gestic_shrug_01', m: 'static/m_sit_chair_gestic_shrug_01', loop: true },
];

export const animPath = (p) => `Assets/Animations/all_animations_max_motextr_${p}.max.fbx`;
