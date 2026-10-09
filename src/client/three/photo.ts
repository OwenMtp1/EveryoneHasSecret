/**
 * Générateur de photos (preuves, souvenirs) avec les VRAIS personnages du catalogue :
 * rendu hors écran des modèles CAST posés (animations capturées), décor simple par lieu, puis
 * « effet photo » (grain, vignette, léger virage des couleurs, date incrustée).
 * Résultats mis en cache (même spécification → même image). Rendu sérialisé sur un seul contexte WebGL.
 *
 * Sert aussi aux vignettes du catalogue (renderCastShot), générées par scripts/characters/render-thumbs.mjs.
 */
import * as THREE from 'three';
import { buildCast, loadCast, type CastActivity, type CastInstance } from './cast3d';

export type PhotoScene = 'portrait' | 'group' | 'restaurant' | 'beach' | 'cliff' | 'party' | 'office' | 'street' | 'car' | 'villa';

export interface PhotoSpec {
  castIds: string[];
  scene: PhotoScene;
  caption?: string;
  seed?: number;
}

const PHOTO_W = 480;
const PHOTO_H = 320;
/** suréchantillonnage (anticrénelage des mèches et des contours) */
const SS = 2;

let renderer: THREE.WebGLRenderer | null = null;
function getRenderer(w: number, h: number): THREE.WebGLRenderer {
  if (!renderer) {
    const canvas = document.createElement('canvas');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: false });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }
  renderer.setPixelRatio(1);
  renderer.setSize(w * SS, h * SS, false);
  return renderer;
}

/** Générateur pseudo-aléatoire déterministe (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0 || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ───────────── décors ─────────────

interface Backdrop {
  /** hauteur des yeux de l'appareil */
  eye: number;
  fov: number;
  /** activités plausibles des personnages dans ce lieu */
  activities: CastActivity[];
  exposure: number;
  /** décor en intérieur : pas de soleil */
  sit?: boolean;
}

function gradientTexture(stops: [number, string][], w = 4, h = 256): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d')!;
  const g = x.createLinearGradient(0, 0, 0, h);
  for (const [o, col] of stops) g.addColorStop(o, col);
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Texture de bruit coloré (sable, crépi, asphalte, herbe…) */
function noiseTexture(base: string, spread: number, rand: () => number, repeat = 8, size = 128): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d')!;
  x.fillStyle = base;
  x.fillRect(0, 0, size, size);
  const img = x.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rand() - 0.5) * spread;
    img.data[i] = Math.max(0, Math.min(255, img.data[i] + n));
    img.data[i + 1] = Math.max(0, Math.min(255, img.data[i + 1] + n));
    img.data[i + 2] = Math.max(0, Math.min(255, img.data[i + 2] + n * 0.9));
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildBackdrop(scene: THREE.Scene, kind: PhotoScene, rand: () => number): Backdrop {
  const add = <T extends THREE.Object3D>(o: T) => {
    scene.add(o);
    return o;
  };
  const mat = (color: string | THREE.Texture, o: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial(typeof color === 'string' ? { color, roughness: 0.85, ...o } : { map: color, roughness: 0.9, ...o });
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, ry = 0) => {
    const b = add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m));
    b.position.set(x, y, z);
    b.rotation.y = ry;
    b.castShadow = b.receiveShadow = true;
    return b;
  };
  const ground = (m: THREE.Material, size = 60) => {
    const g = add(new THREE.Mesh(new THREE.PlaneGeometry(size, size), m));
    g.rotation.x = -Math.PI / 2;
    g.receiveShadow = true;
    return g;
  };
  const sun = (color: string, intensity: number, pos: [number, number, number]) => {
    const d = new THREE.DirectionalLight(color, intensity);
    d.position.set(...pos);
    d.castShadow = true;
    d.shadow.mapSize.set(1024, 1024);
    const cam = d.shadow.camera as THREE.OrthographicCamera;
    cam.left = cam.bottom = -4;
    cam.right = cam.top = 4;
    cam.near = 0.5;
    cam.far = 30;
    d.shadow.bias = -0.0005;
    d.shadow.normalBias = 0.02;
    add(d);
    add(d.target);
    return d;
  };
  const sky = (top: string, bottom: string) => (scene.background = gradientTexture([[0, top], [1, bottom]]));
  const wall = (color: string | THREE.Texture, z = -2.6, w = 14, h = 6) => {
    const m = add(new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat(color)));
    m.position.set(0, h / 2, z);
    m.receiveShadow = true;
    return m;
  };

  switch (kind) {
    case 'portrait':
    case 'group': {
      if (kind === 'portrait') {
        scene.background = gradientTexture([[0, '#8b939c'], [1, '#4d5258']]);
        add(new THREE.HemisphereLight('#f4efe6', '#3c3a36', 1.3));
        sun('#fff2e0', 2.2, [-2.5, 4, 5]);
        const fill = add(new THREE.DirectionalLight('#cfd9ff', 0.6));
        fill.position.set(3, 2, 3);
        return { eye: 1.55, fov: 30, activities: ['idle'], exposure: 1.05 };
      }
      // jardin de la villa : pelouse, haie, ciel d'été
      sky('#7fb2e6', '#dfeaf2');
      add(new THREE.HemisphereLight('#dce9ff', '#4f6b35', 1.1));
      sun('#fff1d8', 2.6, [4, 7, 5]);
      ground(mat(noiseTexture('#5f8a3c', 40, rand, 20)));
      box(16, 1.6, 0.8, mat(noiseTexture('#2f5a26', 60, rand, 6)), 0, 0.8, -4);
      for (let i = 0; i < 3; i++) box(0.5, 3.5 + rand(), 0.5, mat('#2c4a22'), -5 + i * 5 + rand(), 1.8, -5.2);
      return { eye: 1.5, fov: 40, activities: ['idle', 'wave', 'laugh', 'talk', 'listen'], exposure: 1 };
    }
    case 'restaurant': {
      scene.background = new THREE.Color('#2a1d15');
      add(new THREE.HemisphereLight('#ffd9a8', '#2b1a10', 0.7));
      wall(noiseTexture('#7a4b2e', 18, rand, 3), -1.8);
      // lambris, tableaux, appliques
      box(14, 1.0, 0.05, mat('#3c2416'), 0, 0.5, -1.75);
      for (const x of [-1.6, 1.4]) {
        box(0.9, 0.65, 0.04, mat('#1d140e'), x, 1.85, -1.74);
        box(0.8, 0.55, 0.02, mat(['#8a6a3c', '#4f6a72'][x > 0 ? 1 : 0]), x, 1.85, -1.72);
        const lamp = add(new THREE.PointLight('#ffb36b', 5, 6, 1.5));
        lamp.position.set(x + 0.9, 2.1, -1.4);
      }
      const key = sun('#ffcf96', 1.6, [1.5, 3.5, 3]);
      key.castShadow = true;
      ground(mat(noiseTexture('#5b3b25', 30, rand, 10)));
      return { eye: 1.3, fov: 42, activities: ['sit', 'sit_talk'], exposure: 1.15, sit: true };
    }
    case 'beach': {
      sky('#4c9be0', '#cfe6f5');
      add(new THREE.HemisphereLight('#e8f3ff', '#c9b07a', 1.2));
      sun('#fff4dd', 2.8, [3, 8, 6]);
      ground(mat(noiseTexture('#d9c08e', 26, rand, 24)));
      const sea = add(new THREE.Mesh(new THREE.PlaneGeometry(200, 60), mat('#2d7fae', { roughness: 0.25, metalness: 0.1 })));
      sea.rotation.x = -Math.PI / 2;
      sea.position.set(0, 0.02, -36);
      const foam = add(new THREE.Mesh(new THREE.PlaneGeometry(200, 0.6), mat('#eef6f8', { roughness: 0.6 })));
      foam.rotation.x = -Math.PI / 2;
      foam.position.set(0, 0.03, -6.2);
      // parasol
      const pole = box(0.05, 2.2, 0.05, mat('#ddd'), 2.6, 1.1, -2.2);
      pole.castShadow = true;
      const top = add(new THREE.Mesh(new THREE.ConeGeometry(1.2, 0.45, 12, 1, true), mat('#d9453a', { side: THREE.DoubleSide })));
      top.position.set(2.6, 2.2, -2.2);
      top.castShadow = true;
      return { eye: 1.5, fov: 40, activities: ['idle', 'wave', 'laugh', 'idle2'], exposure: 1 };
    }
    case 'cliff': {
      sky('#6d8fb3', '#e5dccd');
      add(new THREE.HemisphereLight('#dfe8f5', '#5d5348', 1.1));
      sun('#ffe2b8', 2.4, [-4, 5, 4]);
      // plateau rocheux, vide derrière, mer en contrebas
      const rock = box(12, 4, 7, mat(noiseTexture('#7d7468', 50, rand, 4)), 0, -2, 0.5);
      rock.receiveShadow = true;
      const sea = add(new THREE.Mesh(new THREE.PlaneGeometry(400, 200), mat('#2b5f80', { roughness: 0.35 })));
      sea.rotation.x = -Math.PI / 2;
      sea.position.set(0, -38, -90);
      for (let i = 0; i < 4; i++) {
        const r = add(new THREE.Mesh(new THREE.DodecahedronGeometry(0.25 + rand() * 0.35), mat('#6e665b')));
        r.position.set(-4 + rand() * 8, 0.1, -2.5 + rand() * 1.5);
      }
      // garde-corps en bois au bord
      for (let x = -5; x <= 5; x += 1.25) box(0.07, 1.0, 0.07, mat('#5a4330'), x, 0.5, -2.9);
      box(10.2, 0.06, 0.06, mat('#5a4330'), 0, 0.95, -2.9);
      return { eye: 1.6, fov: 42, activities: ['idle', 'point', 'idle2', 'listen'], exposure: 1 };
    }
    case 'party': {
      scene.background = new THREE.Color('#0d0a14');
      add(new THREE.HemisphereLight('#6a4f8a', '#110b18', 0.6));
      wall('#2a2033', -2.4);
      ground(mat('#1e1820', { roughness: 0.5 }));
      const cols = ['#ff4f9a', '#4fc3ff', '#ffd24f', '#8aff7a'];
      for (let i = 0; i < 4; i++) {
        const l = add(new THREE.PointLight(cols[i], 9, 7, 1.4));
        l.position.set(-3 + i * 2, 2.4, -0.5 + (i % 2));
      }
      // guirlande
      for (let i = 0; i < 22; i++) {
        const b = add(new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: cols[i % 4] })));
        b.position.set(-4 + i * 0.38, 2.45 - Math.sin((i / 21) * Math.PI) * 0.35, -2.3);
      }
      const flash = sun('#ffffff', 1.4, [0.3, 1.8, 6]); // flash de l'appareil
      flash.shadow.radius = 2;
      return { eye: 1.45, fov: 42, activities: ['talk', 'laugh', 'listen', 'wave'], exposure: 1.1 };
    }
    case 'office': {
      scene.background = new THREE.Color('#c9d2da');
      add(new THREE.HemisphereLight('#f4f8ff', '#6d6a64', 1.2));
      wall('#d8d6cf', -2.6);
      // fenêtre lumineuse
      const win = add(new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.5), new THREE.MeshBasicMaterial({ color: '#eaf3ff' })));
      win.position.set(-1.6, 1.7, -2.58);
      for (const x of [-2.9, -1.6, -0.3]) box(0.06, 1.5, 0.06, mat('#9aa0a6'), x, 1.7, -2.55);
      box(3.2, 0.05, 1.0, mat('#e9e6df'), 1.9, 0.75, -1.6);
      box(0.6, 0.4, 0.05, mat('#151618'), 1.9, 1.0, -1.85);
      ground(mat(noiseTexture('#6b6f75', 16, rand, 12)));
      sun('#ffffff', 1.6, [-3, 4, 3]);
      return { eye: 1.55, fov: 40, activities: ['talk', 'listen', 'idle', 'shrug'], exposure: 1.05 };
    }
    case 'street': {
      sky('#9db7d0', '#e8ecef');
      add(new THREE.HemisphereLight('#e6eef7', '#5d5a55', 1.1));
      sun('#fff0dc', 2.2, [5, 6, 3]);
      ground(mat(noiseTexture('#8d8a86', 30, rand, 16)));
      const facades = ['#c9b79c', '#d9cfc0', '#b9806a', '#e2d6b6'];
      for (let i = 0; i < 5; i++) {
        const w = 3 + rand() * 1.5;
        const h = 7 + rand() * 5;
        const x = -8 + i * 3.8;
        box(w, h, 1, mat(facades[i % facades.length]), x, h / 2, -4.5);
        for (let fy = 1.2; fy < h - 1; fy += 2.4)
          for (let fx = -w / 2 + 0.7; fx < w / 2 - 0.4; fx += 1.1) box(0.6, 1.1, 0.05, mat('#3b4552', { roughness: 0.3 }), x + fx, fy + 0.4, -3.97);
      }
      box(30, 0.15, 2.2, mat('#a9a49c'), 0, 0.07, -2.9);
      return { eye: 1.55, fov: 42, activities: ['idle', 'talk', 'listen', 'idle2'], exposure: 1 };
    }
    case 'car': {
      sky('#89a9c8', '#e9e2d4');
      add(new THREE.HemisphereLight('#e6eef7', '#55504a', 1.1));
      sun('#ffe9c9', 2.3, [4, 6, 4]);
      ground(mat(noiseTexture('#7c7a77', 34, rand, 18)));
      // voiture : caisse, habitacle vitré, roues
      const paint = mat(['#6b1a1a', '#1d2f4a', '#2f3133', '#c9c4b8'][Math.floor(rand() * 4)], { roughness: 0.35, metalness: 0.4 });
      box(4.3, 0.75, 1.8, paint, 0.4, 0.62, -2.3);
      box(2.3, 0.6, 1.6, mat('#1c232b', { roughness: 0.15, metalness: 0.3 }), 0.2, 1.28, -2.3);
      for (const [x, z] of [[-1, -1.42], [1.8, -1.42], [-1, -3.18], [1.8, -3.18]]) {
        const w = add(new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.25, 18), mat('#111')));
        w.rotation.x = Math.PI / 2;
        w.position.set(x, 0.34, z);
      }
      return { eye: 1.5, fov: 42, activities: ['idle', 'listen', 'talk', 'idle2'], exposure: 1 };
    }
    case 'villa': {
      sky('#7aa6d6', '#f0e6d6');
      add(new THREE.HemisphereLight('#e9f0ff', '#6b5d4a', 1.1));
      sun('#ffe8c6', 2.5, [-4, 7, 5]);
      ground(mat(noiseTexture('#b8a98e', 40, rand, 20)));
      // façade claire, fenêtres à volets, porte, perron
      box(16, 7, 0.6, mat(noiseTexture('#e6dcc8', 14, rand, 4)), 0, 3.5, -4.2);
      for (const x of [-5, -2.4, 2.4, 5])
        for (const y of [1.6, 4.6]) {
          box(1.0, 1.5, 0.05, mat('#2a3440', { roughness: 0.25 }), x, y, -3.88);
          box(0.42, 1.55, 0.06, mat('#5e7d6a'), x - 0.73, y, -3.86);
          box(0.42, 1.55, 0.06, mat('#5e7d6a'), x + 0.73, y, -3.86);
        }
      box(1.4, 2.4, 0.08, mat('#4a3020'), 0, 1.2, -3.86);
      box(3.2, 0.3, 1.4, mat('#cfc6b5'), 0, 0.15, -3.2);
      for (const x of [-1.9, 1.9]) {
        const pot = box(0.5, 0.5, 0.5, mat('#9c5a3c'), x, 0.25, -2.7);
        pot.castShadow = true;
        const shrub = add(new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), mat('#3d6a2f')));
        shrub.position.set(x, 0.85, -2.7);
      }
      return { eye: 1.5, fov: 42, activities: ['idle', 'wave', 'laugh', 'listen'], exposure: 1 };
    }
  }
}

// ───────────── personnages ─────────────

const _box = new THREE.Box3();
const _p = new THREE.Vector3();

interface Placed {
  inst: CastInstance;
  /** hauteur de la tête (m) */
  head: number;
}

function placeCast(scene: THREE.Scene, ids: string[], bd: Backdrop, rand: () => number): Placed[] {
  const n = ids.length;
  const spacing = bd.sit ? 0.75 : 0.62;
  const out: Placed[] = [];
  ids.forEach((id, i) => {
    const inst = buildCast(id);
    if (!inst) return;
    const x = (i - (n - 1) / 2) * spacing + (rand() - 0.5) * 0.06;
    const z = (n > 2 ? -Math.abs(x) * 0.18 : 0) + (rand() - 0.5) * 0.12;
    inst.root.position.set(x, 0, z);
    // légèrement tournés vers le centre du groupe / l'appareil
    inst.root.rotation.y = -x * 0.22 + (rand() - 0.5) * 0.25;
    const act = bd.activities[Math.floor(rand() * bd.activities.length)];
    inst.setActivity(act === 'idle' ? null : act, { time: rand() * 30, fade: 0 });
    // laisse le mélange se stabiliser (quelques pas de temps)
    for (let k = 0; k < 4; k++) inst.update(1 / 30, 0);
    scene.add(inst.root);
    inst.root.updateMatrixWorld(true);
    inst.head.getWorldPosition(_p);
    out.push({ inst, head: _p.y });
    if (bd.sit) seatUnder(scene, inst);
  });
  return out;
}

/** Chaise sous le bassin d'un personnage assis + table devant le groupe (restaurant). */
function seatUnder(scene: THREE.Scene, inst: CastInstance) {
  let hips: THREE.Object3D | null = null;
  inst.root.traverse((o) => {
    if (!hips && o.name === 'Hips') hips = o;
  });
  if (!hips) return;
  (hips as THREE.Object3D).getWorldPosition(_p);
  const seatY = Math.max(0.3, _p.y - 0.12);
  const wood = new THREE.MeshStandardMaterial({ color: '#4a2c1a', roughness: 0.7 });
  const chair = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.05, 0.44), wood);
  seat.position.y = seatY;
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.55, 0.05), wood);
  back.position.set(0, seatY + 0.3, -0.22);
  chair.add(seat, back);
  for (const [lx, lz] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, seatY, 0.04), wood);
    leg.position.set(lx, seatY / 2, lz);
    chair.add(leg);
  }
  // la chaise suit l'orientation du personnage, centrée sous le bassin
  chair.position.set(_p.x, 0, _p.z);
  chair.rotation.y = inst.root.rotation.y;
  chair.translateZ(-0.03);
  chair.traverse((o) => ((o as THREE.Mesh).castShadow = (o as THREE.Mesh).receiveShadow = true));
  scene.add(chair);
}

function addTable(scene: THREE.Scene, placed: Placed[]) {
  if (!placed.length) return;
  _box.makeEmpty();
  for (const p of placed) _box.expandByPoint(p.inst.root.position);
  const w = _box.max.x - _box.min.x + 1.2;
  const cloth = new THREE.MeshStandardMaterial({ color: '#efe9de', roughness: 0.9 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, 0.6), cloth);
  top.position.set((_box.max.x + _box.min.x) / 2, 0.74, _box.max.z + 0.5);
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, 0.6), cloth);
  skirt.position.set(top.position.x, 0.5, top.position.z);
  top.receiveShadow = skirt.receiveShadow = true;
  scene.add(top, skirt);
  // verres et bougie
  const glass = new THREE.MeshStandardMaterial({ color: '#d8e4ea', roughness: 0.05, transparent: true, opacity: 0.45 });
  for (const p of placed) {
    const g = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.14, 12), glass);
    g.position.set(p.inst.root.position.x + 0.15, 0.84, top.position.z - 0.18);
    scene.add(g);
  }
  const candle = new THREE.PointLight('#ffb35a', 2.5, 3, 1.6);
  candle.position.set(top.position.x, 1.0, top.position.z);
  scene.add(candle);
}

// ───────────── post-traitement « photo » ─────────────

function photoFinish(src: HTMLCanvasElement, w: number, h: number, rand: () => number, opts: { caption?: string; grain: number; vignette: number; warm: boolean }): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d')!;
  x.imageSmoothingQuality = 'high';
  x.drawImage(src, 0, 0, w, h);
  if (opts.warm) {
    // léger virage chaud et noirs un peu relevés (tirage argentique)
    x.globalCompositeOperation = 'soft-light';
    x.fillStyle = 'rgba(255,214,170,0.35)';
    x.fillRect(0, 0, w, h);
    x.globalCompositeOperation = 'lighten';
    x.fillStyle = 'rgba(28,24,30,1)';
    x.fillRect(0, 0, w, h);
    x.globalCompositeOperation = 'source-over';
  }
  if (opts.vignette > 0) {
    const g = x.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.6);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${opts.vignette})`);
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);
  }
  if (opts.grain > 0) {
    const img = x.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (rand() + rand() - 1) * opts.grain;
      d[i] += n;
      d[i + 1] += n;
      d[i + 2] += n;
    }
    x.putImageData(img, 0, 0);
  }
  if (opts.caption) {
    // date incrustée façon appareil compact
    x.font = `bold ${Math.round(h * 0.055)}px "Courier New", monospace`;
    x.textAlign = 'right';
    x.textBaseline = 'bottom';
    x.shadowColor = 'rgba(255,90,0,0.6)';
    x.shadowBlur = 4;
    x.fillStyle = '#ffae3b';
    x.fillText(opts.caption, w - h * 0.05, h - h * 0.04);
    x.shadowBlur = 0;
  }
  return c;
}

// ───────────── API ─────────────

const cache = new Map<string, Promise<string>>();
let queue: Promise<unknown> = Promise.resolve();
/** un seul rendu à la fois (contexte WebGL partagé) */
function serial<T>(job: () => Promise<T>): Promise<T> {
  const p = queue.then(job, job);
  queue = p.catch(() => undefined);
  return p;
}

function disposeScene(scene: THREE.Scene, placed: Placed[]) {
  for (const p of placed) {
    scene.remove(p.inst.root);
    p.inst.dispose();
  }
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as THREE.SkinnedMesh).isSkinnedMesh) return;
    m.geometry.dispose();
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      (mat as THREE.MeshStandardMaterial).map?.dispose();
      mat.dispose();
    }
  });
  (scene.background as THREE.Texture | null)?.dispose?.();
}

/**
 * Photo des personnages du catalogue dans un décor. Résout une URL `data:image/jpeg` (480×320).
 * Les personnages inconnus sont ignorés ; même spécification → même image (cache).
 */
export function renderPhoto(spec: PhotoSpec): Promise<string> {
  const key = JSON.stringify([spec.castIds, spec.scene, spec.caption ?? '', spec.seed ?? 0]);
  let p = cache.get(key);
  if (!p) {
    p = serial(async () => {
      await Promise.all(spec.castIds.map((id) => loadCast(id)));
      const rand = rng((spec.seed ?? 1) * 7919 + spec.castIds.join('').length);
      const scene = new THREE.Scene();
      const bd = buildBackdrop(scene, spec.scene, rand);
      const placed = placeCast(scene, spec.castIds, bd, rand);
      if (bd.sit) addTable(scene, placed);
      const r = getRenderer(PHOTO_W, PHOTO_H);
      r.toneMappingExposure = bd.exposure;
      const cam = new THREE.PerspectiveCamera(bd.fov, PHOTO_W / PHOTO_H, 0.05, 400);
      frame(cam, placed, spec.scene === 'portrait' || (placed.length === 1 && spec.scene !== 'restaurant') ? 'bust' : bd.sit ? 'seated' : 'full', bd.eye, rand);
      r.render(scene, cam);
      const out = photoFinish(r.domElement, PHOTO_W, PHOTO_H, rand, { caption: spec.caption, grain: 14, vignette: 0.45, warm: true });
      disposeScene(scene, placed);
      return out.toDataURL('image/jpeg', 0.86);
    });
    cache.set(key, p);
    p.catch(() => cache.delete(key));
  }
  return p;
}

/** Cadre la caméra sur le groupe : buste, assis (attablés) ou en pied. */
function frame(cam: THREE.PerspectiveCamera, placed: Placed[], mode: 'bust' | 'seated' | 'full', eye: number, rand: () => number) {
  if (!placed.length) {
    cam.position.set(0, eye, 4);
    cam.lookAt(0, 1, 0);
    return;
  }
  _box.makeEmpty();
  for (const p of placed) {
    _box.expandByPoint(_p.set(p.inst.root.position.x - 0.32, 0, p.inst.root.position.z));
    _box.expandByPoint(_p.set(p.inst.root.position.x + 0.32, p.head + 0.16, p.inst.root.position.z));
  }
  const top = _box.max.y + (mode === 'full' ? 0.15 : 0.08);
  const bottom = mode === 'bust' ? _box.max.y - 0.75 : mode === 'seated' ? Math.max(0.35, _box.max.y - 1.05) : -0.05;
  const cx = (_box.max.x + _box.min.x) / 2;
  const width = _box.max.x - _box.min.x + 0.2;
  const vfov = THREE.MathUtils.degToRad(cam.fov);
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * cam.aspect);
  const dist = Math.max((top - bottom) / 2 / Math.tan(vfov / 2), width / 2 / Math.tan(hfov / 2)) * 1.08 + _box.max.z;
  const cy = (top + bottom) / 2;
  const camY = mode === 'full' ? Math.min(eye, cy + 0.6) : cy + 0.1;
  const yaw = (rand() - 0.5) * 0.18;
  cam.position.set(cx + Math.sin(yaw) * dist, camY, Math.cos(yaw) * dist);
  cam.lookAt(cx, cy, 0);
  cam.updateProjectionMatrix();
}

/**
 * Vignette de studio d'un personnage (fond neutre, éclairage constant) — sans effet photo.
 * `thumb` : portrait 256×320 (tête et épaules) ; `card` : en pied 240×480.
 */
export function renderCastShot(id: string, kind: 'thumb' | 'card'): Promise<string> {
  return serial(async () => {
    await loadCast(id);
    const [w, h] = kind === 'thumb' ? [256, 320] : [240, 480];
    const scene = new THREE.Scene();
    scene.background = gradientTexture([[0, '#9aa1a8'], [1, '#5b6066']]);
    scene.add(new THREE.HemisphereLight('#f4efe6', '#4a4640', 1.35));
    const key = new THREE.DirectionalLight('#fff3e2', 2.1);
    key.position.set(-2, 3.5, 4);
    const fill = new THREE.DirectionalLight('#dbe4ff', 0.7);
    fill.position.set(3, 2, 3);
    const rim = new THREE.DirectionalLight('#ffffff', 0.9);
    rim.position.set(0.5, 3, -4);
    scene.add(key, fill, rim);
    const inst = buildCast(id);
    if (!inst) throw new Error(`Personnage ${id} indisponible`);
    inst.root.rotation.y = kind === 'thumb' ? 0.12 : 0.2;
    // pose d'attente fixe (bras le long du corps), même instant pour tous
    inst.setActivity('idle', { time: 0.6, fade: 0 });
    for (let k = 0; k < 3; k++) inst.update(1 / 60, 0);
    inst.setVisibleBody(true);
    scene.add(inst.root);
    inst.root.updateMatrixWorld(true);
    inst.head.getWorldPosition(_p);
    const r = getRenderer(w, h);
    r.toneMappingExposure = 1.05;
    const cam = new THREE.PerspectiveCamera(kind === 'thumb' ? 22 : 24, w / h, 0.05, 50);
    if (kind === 'thumb') {
      // cadrage proportionnel à la taille du personnage (même composition pour tous)
      const k = inst.member.heightM / 1.75;
      const cy = _p.y - 0.11 * k;
      const span = 0.64 * k;
      const dist = span / 2 / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
      cam.position.set(_p.x, cy + 0.04, dist);
      cam.lookAt(_p.x, cy, 0);
    } else {
      _box.setFromObject(inst.root, true);
      const top = _box.max.y + 0.06;
      const span = top + 0.1;
      const dist = span / 2 / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
      cam.position.set(0, top / 2 + 0.1, dist);
      cam.lookAt(0, top / 2 - 0.02, 0);
    }
    r.render(scene, cam);
    const out = photoFinish(r.domElement, w, h, rng(1), { grain: 0, vignette: 0.18, warm: false });
    disposeScene(scene, [{ inst, head: 0 }]);
    return out.toDataURL('image/jpeg', 0.9);
  });
}
