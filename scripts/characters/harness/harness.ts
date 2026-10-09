/**
 * Banc d'essai (navigateur) des personnages du catalogue, piloté par Playwright :
 * vignettes (render-thumbs.mjs) et vérifications (verify.mjs). Utilise les VRAIS modules du client.
 */
import * as THREE from 'three';
import { CAST_IDS, castById } from '@shared/content/cast';
import type { Character, GestureKind } from '@shared/types';
import type { Pose } from '../../../src/client/three/gestures';
import { buildCharacter } from '../../../src/client/three/character3d';
import { buildCast, loadCast, preloadCast, type CastActivity } from '../../../src/client/three/cast3d';
import { renderCastShot, renderPhoto, type PhotoSpec } from '../../../src/client/three/photo';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;

function gridTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d')!;
  x.fillStyle = '#8c8a84';
  x.fillRect(0, 0, 256, 256);
  x.strokeStyle = '#3b3a37';
  x.lineWidth = 3;
  for (let i = 0; i <= 256; i += 64) {
    x.beginPath();
    x.moveTo(i, 0);
    x.lineTo(i, 256);
    x.moveTo(0, i);
    x.lineTo(256, i);
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(40, 40); // une case = 25 cm
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function stage() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#5d6670');
  scene.add(new THREE.HemisphereLight('#f0ece4', '#403c38', 1.3));
  const sun = new THREE.DirectionalLight('#fff3e0', 2);
  sun.position.set(-3, 6, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const cam = sun.shadow.camera as THREE.OrthographicCamera;
  cam.left = cam.bottom = -12;
  cam.right = cam.top = 12;
  scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ map: gridTexture(), roughness: 0.9 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  return scene;
}

const character = (id: string): Character => {
  const m = castById(id)!;
  return { firstName: m.firstName, lastName: m.lastName, appearance: m.gender, skinTone: 'medium', hairStyleId: 'short', hairColor: 'brown', outfitId: 'casual', castId: id };
};

interface LineupOpts {
  speed?: number;
  time?: number;
  activity?: CastActivity;
  gesture?: GestureKind;
  gestureAt?: number;
  dead?: boolean;
  angle?: number;
  /** cadrage : 'full' (en pied) ou 'head' */
  view?: 'full' | 'head';
  cols?: number;
  /** pose procédurale maintenue (comme la cinématique : assis…) */
  pose?: Pose;
}

/** Rangée de personnages via buildCharacter (chemin réel du jeu), animés `time` secondes. */
async function lineup(ids: string[], o: LineupOpts = {}) {
  await preloadCast(ids);
  const scene = stage();
  const cols = o.cols ?? ids.length;
  const rows = Math.ceil(ids.length / cols);
  const chars = ids.map((id, i) => {
    const c = id.startsWith('cast:') ? buildCast(id.slice(5))! : buildCharacter(character(id));
    c.root.position.set((i % cols - (cols - 1) / 2) * 0.9, 0, -Math.floor(i / cols) * 1.6);
    c.root.rotation.y = o.angle ?? 0;
    scene.add(c.root);
    if (o.dead) c.setDead(true, false);
    if (o.pose) c.setPose(() => o.pose!);
    if (o.activity) (c as unknown as { setActivity?: (a: CastActivity, x: object) => void }).setActivity?.(o.activity, { fade: 0 });
    return c;
  });
  const dt = 1 / 30;
  const steps = Math.round((o.time ?? 1) / dt);
  for (let s = 0; s < steps; s++) {
    if (o.gesture && Math.abs(s * dt - (o.gestureAt ?? 0)) < dt / 2) chars.forEach((c) => c.gesture(o.gesture!));
    for (const c of chars) c.update(dt, o.speed ?? 0);
  }
  const w = canvas.width;
  const h = canvas.height;
  renderer.setSize(w, h, false);
  const cam = new THREE.PerspectiveCamera(30, w / h, 0.05, 100);
  const width = cols * 0.9 + 0.4;
  if (o.view === 'head') {
    cam.position.set(0, 1.6, width * 0.75);
    cam.lookAt(0, 1.5, 0);
  } else {
    const dist = Math.max((2.1 + (rows - 1) * 0.6) / 2 / Math.tan(THREE.MathUtils.degToRad(15)), width / 2 / Math.tan(Math.atan(Math.tan(THREE.MathUtils.degToRad(15)) * cam.aspect)));
    cam.position.set(0, 1.3 + rows * 0.3, dist * 1.05);
    cam.lookAt(0, 0.9, -(rows - 1) * 0.8);
  }
  renderer.render(scene, cam);
  for (const c of chars) c.dispose();
  return true;
}

/**
 * Mesure du glissement des pieds : le personnage avance à `speed` (m/s) ; à chaque pas de temps on
 * relève la vitesse horizontale (monde) des orteils du pied le plus bas lorsqu'ils sont au sol (< 2,5 cm).
 * Un pied d'appui immobile → ~0 m/s. Renvoie la moyenne et le 90e centile.
 */
async function footSlide(id: string, speed: number, seconds = 3) {
  await loadCast(id);
  const c = buildCast(id)!;
  const scene = new THREE.Scene();
  scene.add(c.root);
  const feet: THREE.Object3D[] = [];
  c.root.traverse((o) => (o.name === 'L_Toe0' || o.name === 'R_Toe0') && feet.push(o));
  const dt = 1 / 60;
  const prev = feet.map(() => new THREE.Vector3());
  const cur = feet.map(() => new THREE.Vector3());
  const raw: [number, number][] = [];
  let minY = Infinity;
  // mise en régime
  for (let s = 0; s < 60; s++) c.update(dt, speed);
  for (let s = 0; s < seconds / dt; s++) {
    c.root.position.z += speed * dt;
    c.update(dt, speed);
    c.root.updateMatrixWorld(true);
    feet.forEach((f, i) => f.getWorldPosition(cur[i]));
    if (s > 0) {
      const low = cur[0].y < cur[1].y ? 0 : 1;
      minY = Math.min(minY, cur[low].y);
      raw.push([cur[low].y, Math.hypot(cur[low].x - prev[low].x, cur[low].z - prev[low].z) / dt]);
    }
    feet.forEach((_, i) => prev[i].copy(cur[i]));
  }
  const samples = raw.filter(([y]) => y < minY + 0.025).map(([, v]) => v);
  samples.sort((a, b) => a - b);
  const mean = samples.reduce((a, b) => a + b, 0) / Math.max(1, samples.length);
  c.dispose();
  return { id, speed, mean: +mean.toFixed(3), p90: +(samples[Math.floor(samples.length * 0.9)] ?? 0).toFixed(3), lowestToe: +minY.toFixed(3) };
}

/** Hauteur (m) et taille d'origine du modèle (boîte englobante au repos). */
async function measure(id: string) {
  await loadCast(id);
  const c = buildCast(id, { heightM: 1 })!;
  c.update(1 / 30, 0);
  const box = new THREE.Box3().setFromObject(c.root, true);
  c.dispose();
  return { id, height: +(box.max.y - box.min.y).toFixed(3) };
}

Object.assign(window, {
  harness: {
    ids: CAST_IDS,
    shot: (id: string, kind: 'thumb' | 'card') => renderCastShot(id, kind),
    photo: (spec: PhotoSpec) => renderPhoto(spec),
    lineup,
    footSlide,
    measure,
  },
});
document.title = 'ready';
