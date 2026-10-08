/**
 * Matériaux réalistes (PBR) de la villa : textures photo (parquet, brique, carrelage, herbe)
 * et textures générées (papiers peints, marbre, béton, gravier, tissus, plâtre).
 * Toutes les textures sont mises en cache : un matériau = une instance partagée.
 */
import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

const loader = new THREE.TextureLoader();
const cache = new Map<string, THREE.Texture>();

function photo(name: string, color = false): THREE.Texture {
  const key = `${name}|${color}`;
  let t = cache.get(key);
  if (!t) {
    t = loader.load(`/textures/${name}`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (color) t.colorSpace = THREE.SRGBColorSpace;
    cache.set(key, t);
  }
  return t;
}

/** Copie d'une texture avec sa propre répétition (l'image reste partagée). */
function rep<T extends THREE.Texture>(t: T, x: number, y: number): T {
  const c = t.clone() as T;
  c.repeat.set(x, y);
  c.needsUpdate = true;
  return c;
}

function canvasTex(key: string, size: number, draw: (x: CanvasRenderingContext2D, s: number) => void, color = true): THREE.CanvasTexture {
  let t = cache.get(key) as THREE.CanvasTexture | undefined;
  if (!t) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    draw(c.getContext('2d')!, size);
    t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (color) t.colorSpace = THREE.SRGBColorSpace;
    cache.set(key, t);
  }
  return t;
}

const rand = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

function noise(x: CanvasRenderingContext2D, s: number, amount: number, seed = 7) {
  const r = rand(seed);
  const img = x.getImageData(0, 0, s, s);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * amount;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  x.putImageData(img, 0, 0);
}

/** Papier peint à motif (damas, rayures, uni) — 1 m de texture (motif répété ×2 sauf carrelage). */
export function wallpaperTex(base: string, accent: string, kind: 'damask' | 'stripes' | 'plain' | 'tiles') {
  return canvasTex(`wp|${base}|${accent}|${kind}`, 256, (x, s) => {
    x.fillStyle = base;
    x.fillRect(0, 0, s, s);
    x.fillStyle = accent;
    x.strokeStyle = accent;
    if (kind === 'stripes')
      for (let i = 0; i < s; i += 32) {
        x.globalAlpha = 0.55;
        x.fillRect(i, 0, 10, s);
        x.globalAlpha = 0.25;
        x.fillRect(i + 16, 0, 3, s);
      }
    if (kind === 'damask') {
      x.globalAlpha = 0.28;
      for (const [cx, cy] of [[64, 64], [192, 192], [192, 64], [64, 192]] as const) {
        const big = (cx + cy) % 256 === 128;
        x.beginPath();
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) x.ellipse(cx + Math.cos(a) * (big ? 22 : 10), cy + Math.sin(a) * (big ? 30 : 12), big ? 10 : 5, big ? 18 : 7, a, 0, Math.PI * 2);
        x.fill();
        x.beginPath();
        x.arc(cx, cy, big ? 9 : 4, 0, Math.PI * 2);
        x.fill();
      }
    }
    if (kind === 'tiles') {
      x.globalAlpha = 0.6;
      x.lineWidth = 3;
      for (let i = 0; i <= s; i += 64) {
        x.beginPath();
        x.moveTo(i, 0);
        x.lineTo(i, s);
        x.moveTo(0, i);
        x.lineTo(s, i);
        x.stroke();
      }
    }
    x.globalAlpha = 1;
    noise(x, s, 10);
  });
}

export function marbleTex() {
  return canvasTex('marble', 512, (x, s) => {
    x.fillStyle = '#d9d4cb';
    x.fillRect(0, 0, s, s);
    const r = rand(42);
    x.strokeStyle = 'rgba(90,85,80,0.35)';
    for (let k = 0; k < 14; k++) {
      x.lineWidth = 0.5 + r() * 2;
      x.beginPath();
      let px = r() * s;
      let py = 0;
      x.moveTo(px, py);
      while (py < s) {
        px += (r() - 0.5) * 40;
        py += 10 + r() * 30;
        x.lineTo(px, py);
      }
      x.stroke();
    }
    // joints de dalles 1 m
    x.strokeStyle = 'rgba(40,36,32,0.6)';
    x.lineWidth = 2;
    x.strokeRect(0, 0, s, s);
    noise(x, s, 8);
  });
}

export function concreteTex() {
  return canvasTex('concrete', 256, (x, s) => {
    x.fillStyle = '#5b5852';
    x.fillRect(0, 0, s, s);
    noise(x, s, 40, 3);
    const r = rand(9);
    x.fillStyle = 'rgba(0,0,0,0.12)';
    for (let i = 0; i < 30; i++) {
      x.beginPath();
      x.arc(r() * s, r() * s, 4 + r() * 20, 0, Math.PI * 2);
      x.fill();
    }
  });
}

export function gravelTex() {
  return canvasTex('gravel', 256, (x, s) => {
    x.fillStyle = '#5f5a52';
    x.fillRect(0, 0, s, s);
    const r = rand(5);
    for (let i = 0; i < 2200; i++) {
      const v = 60 + r() * 90;
      x.fillStyle = `rgb(${v},${v - 4},${v - 10})`;
      x.beginPath();
      x.ellipse(r() * s, r() * s, 1 + r() * 2.5, 1 + r() * 2, r() * 3, 0, Math.PI * 2);
      x.fill();
    }
  });
}

export function fabricTex(color: string) {
  return canvasTex(`fabric|${color}`, 128, (x, s) => {
    x.fillStyle = color;
    x.fillRect(0, 0, s, s);
    x.globalAlpha = 0.12;
    x.fillStyle = '#000';
    for (let i = 0; i < s; i += 2) x.fillRect(i, 0, 1, s);
    x.fillStyle = '#fff';
    for (let i = 0; i < s; i += 3) x.fillRect(0, i, s, 1);
    x.globalAlpha = 1;
    noise(x, s, 14);
  });
}

export function plasterTex() {
  return canvasTex('plaster', 256, (x, s) => {
    x.fillStyle = '#e9e4da';
    x.fillRect(0, 0, s, s);
    noise(x, s, 12, 11);
  });
}

export function rugTex(base: string, border: string) {
  return canvasTex(`rug|${base}|${border}`, 512, (x, s) => {
    x.fillStyle = base;
    x.fillRect(0, 0, s, s);
    x.strokeStyle = border;
    x.lineWidth = 26;
    x.strokeRect(30, 30, s - 60, s - 60);
    x.lineWidth = 6;
    x.strokeRect(70, 70, s - 140, s - 140);
    x.fillStyle = border;
    x.globalAlpha = 0.5;
    x.beginPath();
    x.ellipse(s / 2, s / 2, s * 0.18, s * 0.12, 0, 0, Math.PI * 2);
    x.fill();
    x.globalAlpha = 1;
    noise(x, s, 18);
  });
}

// ───────────── matériaux de base ─────────────

const matCache = new Map<string, THREE.MeshStandardMaterial>();
function mat(key: string, make: () => THREE.MeshStandardMaterial) {
  let m = matCache.get(key);
  if (!m) matCache.set(key, (m = make()));
  return m;
}

export const MAT = {
  hardwood: (w: number, h: number, tint = '#ffffff') =>
    mat(`hardwood|${w}|${h}|${tint}`, () =>
      new THREE.MeshStandardMaterial({
        color: tint,
        map: rep(photo('hardwood2_diffuse.jpg', true), w / 2, h / 2),
        bumpMap: rep(photo('hardwood2_bump.jpg'), w / 2, h / 2),
        bumpScale: 0.6,
        roughnessMap: rep(photo('hardwood2_roughness.jpg'), w / 2, h / 2),
        roughness: 0.9,
      }),
    ),
  tiles: (w: number, h: number) =>
    mat(`tiles|${w}|${h}`, () =>
      new THREE.MeshStandardMaterial({
        map: rep(photo('FloorsCheckerboard_S_Diffuse.jpg', true), w / 2, h / 2),
        normalMap: rep(photo('FloorsCheckerboard_S_Normal.jpg'), w / 2, h / 2),
        roughness: 0.25,
        metalness: 0.05,
      }),
    ),
  brick: (w: number, h: number) =>
    mat(`brick|${w}|${h}`, () =>
      new THREE.MeshStandardMaterial({
        color: '#b9a99a',
        map: rep(photo('brick_diffuse.jpg', true), w, h),
        bumpMap: rep(photo('brick_bump.jpg'), w, h),
        bumpScale: 1,
        roughnessMap: rep(photo('brick_roughness.jpg'), w, h),
      }),
    ),
  grass: (w: number, h: number) =>
    mat(`grass|${w}|${h}`, () => new THREE.MeshStandardMaterial({ color: '#7d8f78', map: rep(photo('grasslight-big.jpg', true), w / 4, h / 4), roughness: 1 })),
  marble: (w: number, h: number) => mat(`marble|${w}|${h}`, () => new THREE.MeshStandardMaterial({ map: rep(marbleTex(), w, h), roughness: 0.18, metalness: 0.02 })),
  concrete: (w: number, h: number) => mat(`concrete|${w}|${h}`, () => new THREE.MeshStandardMaterial({ map: rep(concreteTex(), w / 2, h / 2), roughness: 0.95 })),
  gravel: (w: number, h: number) => mat(`gravel|${w}|${h}`, () => new THREE.MeshStandardMaterial({ map: rep(gravelTex(), w / 1.5, h / 1.5), roughness: 1 })),
  wallpaper: (base: string, accent: string, kind: 'damask' | 'stripes' | 'plain' | 'tiles', height: number) =>
    mat(`wp|${base}|${accent}|${kind}|${height}`, () =>
      new THREE.MeshStandardMaterial({ map: rep(wallpaperTex(base, accent, kind), kind === 'tiles' ? 1 : 2, kind === 'tiles' ? height : height * 2), roughness: kind === 'tiles' ? 0.3 : 0.85 }),
    ),
  plaster: () => mat('plaster', () => new THREE.MeshStandardMaterial({ map: rep(plasterTex(), 2, 2), roughness: 0.95 })),
  fabric: (color: string) => mat(`fabric|${color}`, () => new THREE.MeshStandardMaterial({ map: rep(fabricTex(color), 2, 2), roughness: 1 })),
  rug: (base: string, border: string) => mat(`rug|${base}|${border}`, () => new THREE.MeshStandardMaterial({ map: rugTex(base, border), roughness: 1 })),
  wood: (color = '#5a3a22') =>
    mat(`wood|${color}`, () =>
      new THREE.MeshStandardMaterial({ color, map: rep(photo('hardwood2_diffuse.jpg', true), 0.5, 0.5), roughness: 0.55, metalness: 0.0 }),
    ),
  lacquer: (color: string) => mat(`lacquer|${color}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.15, metalness: 0.1 })),
  metal: (color = '#b7b9bd', rough = 0.3) => mat(`metal|${color}|${rough}`, () => new THREE.MeshStandardMaterial({ color, metalness: 1, roughness: rough })),
  porcelain: () => mat('porcelain', () => new THREE.MeshStandardMaterial({ color: '#f4f4f1', roughness: 0.08, metalness: 0 })),
  paint: (color: string, rough = 0.6) => mat(`paint|${color}|${rough}`, () => new THREE.MeshStandardMaterial({ color, roughness: rough })),
  glow: (color: string, intensity = 2) => mat(`glow|${color}|${intensity}`, () => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity })),
  water: () =>
    mat('water', () =>
      new THREE.MeshStandardMaterial({ color: '#1c2f3d', normalMap: rep(photo('Water_1_M_Normal.jpg'), 2, 2), roughness: 0.05, metalness: 0.4 }),
    ),
  glass: () => mat('glass', () => new THREE.MeshStandardMaterial({ color: '#16202e', roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.55 })),
};

/** Éclairage d'environnement HDR (ciel de nuit) : reflets réalistes sur les matériaux PBR. */
export function loadEnvironment(renderer: THREE.WebGLRenderer, scene: THREE.Scene, intensity = 0.25) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  new RGBELoader().load(
    '/textures/moonless_golf_1k.hdr',
    (hdr) => {
      const env = pmrem.fromEquirectangular(hdr).texture;
      scene.environment = env;
      scene.environmentIntensity = intensity;
      hdr.dispose();
      pmrem.dispose();
    },
    undefined,
    () => pmrem.dispose(),
  );
}
