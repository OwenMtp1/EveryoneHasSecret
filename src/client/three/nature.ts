/**
 * Nature stylisée (esprit « jeu d'aventure ») : feuillages en touffes arrondies et irrégulières avec dégradé de
 * couleur (clair au sommet, sombre dessous), forêt instanciée, ciel nocturne (dégradé, lune, étoiles, collines),
 * touffes d'herbe et fleurs. Tout est procédural : aucun fichier à télécharger.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Bruit de valeur 3D lissé, déterministe (pour déformer les touffes). */
function hash(x: number, y: number, z: number) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise3(x: number, y: number, z: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const f = (t: number) => t * t * (3 - 2 * t);
  const xf = f(x - xi);
  const yf = f(y - yi);
  const zf = f(z - zi);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash(xi + dx, yi + dy, zi + dz);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), xf), l(c(0, 1, 0), c(1, 1, 0), xf), yf),
    l(l(c(0, 0, 1), c(1, 0, 1), xf), l(c(0, 1, 1), c(1, 1, 1), xf), yf),
    zf,
  );
}

/**
 * Touffe de feuillage : sphère subdivisée, bosselée par un bruit, aplatie dessous, couleurs par sommet
 * (dégradé vertical + taches). `seed` change la forme ; le résultat est mis en cache.
 */
const clumpCache = new Map<string, THREE.BufferGeometry>();
export function foliageClump(radius: number, seed = 0, top = '#84bc56', bottom = '#3a6a38', detail = 3): THREE.BufferGeometry {
  const key = `${radius}|${seed}|${top}|${bottom}|${detail}`;
  const hit = clumpCache.get(key);
  if (hit) return hit;
  const g = new THREE.IcosahedronGeometry(radius, detail);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const ct = new THREE.Color(top);
  const cb = new THREE.Color(bottom);
  const c = new THREE.Color();
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const n = noise3(v.x * 2.2 + seed * 7.1, v.y * 2.2 + seed * 3.3, v.z * 2.2 - seed * 5.7);
    const n2 = noise3(v.x * 6 + seed, v.y * 6, v.z * 6);
    let r = radius * (0.84 + n * 0.3 + n2 * 0.06);
    // dessous plus plat (comme un vrai houppier)
    if (v.y < -0.2) r *= 1 + (v.y + 0.2) * 0.35;
    pos.setXYZ(i, v.x * r, v.y * r, v.z * r);
    const k = THREE.MathUtils.clamp((v.y + 1) / 2 + (n2 - 0.5) * 0.35, 0, 1);
    c.copy(cb).lerp(ct, k * k * (3 - 2 * k));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  clumpCache.set(key, g);
  return g;
}

let _foliageMat: THREE.MeshStandardMaterial | null = null;
/** Matériau commun des feuillages (couleurs portées par les sommets). */
export const foliageMaterial = () => (_foliageMat ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 }));
let _barkMat: THREE.MeshStandardMaterial | null = null;
export const barkMaterial = () => (_barkMat ??= new THREE.MeshStandardMaterial({ color: '#5a3d28', roughness: 1 }));

/** Houppier complet (plusieurs touffes fusionnées) pour un arbre de jardin. */
export function crownGeometry(size: number, seed: number, palette: [string, string] = ['#88c15a', '#3a6838'], detail = 3): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const blobs: [number, number, number, number][] = [
    [0, 0, 0, 1],
    [0.55, -0.15, 0.25, 0.72],
    [-0.5, -0.1, -0.2, 0.75],
    [0.1, 0.45, -0.25, 0.68],
    [-0.15, -0.05, 0.55, 0.62],
  ];
  blobs.forEach(([x, y, z, r], i) => {
    parts.push(foliageClump(size * r, seed * 5 + i, palette[0], palette[1], detail).clone().translate(x * size, y * size, z * size));
  });
  const m = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  return m;
}

/** Sapin stylisé : trois cônes empilés, couleurs par sommet. */
function firGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const tiers: [number, number, number][] = [
    [1.6, 2.2, 1.4],
    [1.25, 1.9, 2.5],
    [0.85, 1.6, 3.5],
  ];
  for (const [r, h, y] of tiers) {
    const cone = new THREE.ConeGeometry(r, h, 9, 2).translate(0, y, 0);
    const pos = cone.getAttribute('position') as THREE.BufferAttribute;
    const col = new Float32Array(pos.count * 3);
    const a = new THREE.Color('#1d3b2c');
    const b = new THREE.Color('#4c7d4a');
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      c.copy(a).lerp(b, THREE.MathUtils.clamp((pos.getY(i) - y + h / 2) / h, 0, 1) * 0.9);
      col.set([c.r, c.g, c.b], i * 3);
    }
    cone.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts.push(cone.toNonIndexed());
  }
  const trunk = new THREE.CylinderGeometry(0.16, 0.24, 1.2, 7).translate(0, 0.6, 0).toNonIndexed();
  const tc = new Float32Array(trunk.getAttribute('position').count * 3);
  const brown = new THREE.Color('#4a3322');
  for (let i = 0; i < tc.length; i += 3) tc.set([brown.r, brown.g, brown.b], i);
  trunk.setAttribute('color', new THREE.BufferAttribute(tc, 3));
  for (const p of parts) p.deleteAttribute('uv');
  trunk.deleteAttribute('uv');
  const m = mergeGeometries([...parts, trunk])!;
  m.computeVertexNormals();
  return m;
}

/**
 * Forêt autour de la propriété : feuillus (tronc + houppier) et sapins, en instances (3 appels de dessin
 * pour des centaines d'arbres), tailles, teintes et rotations variées. `avoid` exclut des zones (allée…).
 */
export function buildForest(opts: { cx: number; cz: number; count: number; rMin: number; rMax: number; avoid?: (x: number, z: number) => boolean }): THREE.Group {
  const g = new THREE.Group();
  const rnd = mulberry(1234);
  const leafy: THREE.Matrix4[] = [];
  const firs: THREE.Matrix4[] = [];
  const tints: THREE.Color[] = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  for (let i = 0; i < opts.count; i++) {
    const a = rnd() * Math.PI * 2;
    const r = opts.rMin + rnd() * (opts.rMax - opts.rMin);
    const x = opts.cx + Math.cos(a) * r;
    const z = opts.cz + Math.sin(a) * r * 0.8;
    if (opts.avoid?.(x, z)) continue;
    const s = 0.8 + rnd() * 0.9;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * Math.PI * 2);
    m.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s, s * (0.9 + rnd() * 0.3), s));
    if (rnd() < 0.42) firs.push(m.clone());
    else {
      leafy.push(m.clone());
      tints.push(new THREE.Color().setHSL(0.26 + rnd() * 0.08, 0.25 + rnd() * 0.2, 0.6 + rnd() * 0.25));
    }
  }
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.34, 3, 7).translate(0, 1.5, 0), barkMaterial(), leafy.length);
  const crowns = new THREE.InstancedMesh(crownGeometry(2.1, 3, ['#5c9446', '#1a3824'], 2).translate(0, 4.3, 0), foliageMaterial(), leafy.length);
  leafy.forEach((mm, i) => {
    trunks.setMatrixAt(i, mm);
    crowns.setMatrixAt(i, mm);
    crowns.setColorAt(i, tints[i]);
  });
  const fir = new THREE.InstancedMesh(firGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }), firs.length);
  firs.forEach((mm, i) => fir.setMatrixAt(i, mm.clone().scale(new THREE.Vector3(1.3, 1.5, 1.3))));
  for (const im of [trunks, crowns, fir]) {
    // hors de la zone d'ombre de la lune : ne projette pas (sinon toute la forêt passe dans la carte d'ombre)
    im.castShadow = false;
    im.receiveShadow = true;
    im.computeBoundingSphere();
    g.add(im);
  }
  return g;
}

/**
 * Ciel de nuit d'orage : dôme en dégradé (bleu nuit → horizon bleuté), lune voilée avec halo, quelques étoiles
 * entre les nuages, collines lointaines en silhouette. Non affecté par le brouillard.
 */
export function buildSky(radius = 170): THREE.Group {
  const g = new THREE.Group();
  // le ciel suit la caméra (horizontalement) : jamais de bord visible, même loin de la villa (cinématique)
  const follow = (o: THREE.Object3D) => {
    o.frustumCulled = false;
    o.matrixAutoUpdate = false;
    o.onBeforeRender = (_r, _s, cam) => {
      o.matrixWorld.makeTranslation(cam.position.x, 0, cam.position.z);
    };
  };
  const moonDir = new THREE.Vector3(-0.45, 0.42, -0.78).normalize();
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color('#060a18') },
        mid: { value: new THREE.Color('#14203d') },
        horizon: { value: new THREE.Color('#2c3b5e') },
        moonDir: { value: moonDir },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 top, mid, horizon, moonDir;
        varying vec3 vDir;
        float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
          return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
        void main() {
          float y = max(vDir.y, 0.0);
          vec3 c = mix(horizon, mid, smoothstep(0.0, 0.25, y));
          c = mix(c, top, smoothstep(0.25, 0.9, y));
          // nuages d'orage : bandes sombres, bords éclairés par la lune
          vec2 uv = vDir.xz / (vDir.y + 0.35) * 2.2;
          float cl = n(uv) * 0.6 + n(uv * 2.3) * 0.3 + n(uv * 5.1) * 0.1;
          float clouds = smoothstep(0.45, 0.8, cl) * smoothstep(0.02, 0.25, y);
          float md = max(dot(vDir, moonDir), 0.0);
          vec3 cloudCol = mix(vec3(0.05, 0.06, 0.1), vec3(0.32, 0.36, 0.48), pow(md, 6.0));
          c = mix(c, cloudCol, clouds * 0.85);
          // lune et halo
          c += vec3(0.55, 0.62, 0.8) * pow(md, 90.0) * 0.9 * (1.0 - clouds * 0.6);
          c += vec3(0.95, 0.97, 1.0) * smoothstep(0.9993, 0.9996, md) * (1.0 - clouds * 0.7);
          // étoiles entre les nuages
          vec2 sp = vDir.xz / (vDir.y + 0.05) * 90.0;
          float st = step(0.996, h(floor(sp))) * smoothstep(0.2, 0.6, y) * (1.0 - clouds);
          c += vec3(st) * 0.6;
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  );
  dome.renderOrder = -10;
  follow(dome);
  g.add(dome);
  // collines lointaines : anneau de silhouettes irrégulières
  const seg = 160;
  const shape: number[] = [];
  const idx: number[] = [];
  const R = radius * 0.82;
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const hgt = 7 + noise3(Math.cos(a) * 3, Math.sin(a) * 3, 0.5) * 16 + noise3(Math.cos(a) * 9, Math.sin(a) * 9, 2) * 5;
    shape.push(Math.cos(a) * R, -3, Math.sin(a) * R, Math.cos(a) * R, hgt, Math.sin(a) * R);
    if (i < seg) {
      const b = i * 2;
      idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }
  }
  const hills = new THREE.BufferGeometry();
  hills.setAttribute('position', new THREE.Float32BufferAttribute(shape, 3));
  hills.setIndex(idx);
  const hm = new THREE.Mesh(hills, new THREE.MeshBasicMaterial({ color: '#0b1220', side: THREE.DoubleSide, fog: false }));
  hm.renderOrder = -9;
  follow(hm);
  g.add(hm);
  return g;
}

/**
 * Touffes d'herbe et fleurs du jardin (instances) : rompt l'uniformité de la pelouse près de la maison.
 * `inside(x, z)` dit si un point est sur une pelouse praticable (pas sur une allée, ni dans la maison).
 */
export function buildGroundCover(area: { x0: number; z0: number; x1: number; z1: number }, count: number, inside: (x: number, z: number) => boolean): THREE.Group {
  const g = new THREE.Group();
  const rnd = mulberry(99);
  const tuft = new THREE.ConeGeometry(0.07, 0.34, 3).translate(0, 0.17, 0);
  const tuftParts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    tuftParts.push(tuft.clone().rotateZ(Math.cos(a) * 0.35).rotateX(Math.sin(a) * 0.35).translate(Math.cos(a) * 0.05, 0, Math.sin(a) * 0.05));
  }
  const tuftGeo = mergeGeometries(tuftParts)!;
  const flowerGeo = mergeGeometries([new THREE.CylinderGeometry(0.008, 0.008, 0.3, 4).translate(0, 0.15, 0).toNonIndexed(), new THREE.IcosahedronGeometry(0.05, 0).translate(0, 0.31, 0)])!;
  const grassMat = new THREE.MeshStandardMaterial({ color: '#4f7a3a', roughness: 1 });
  const flowerMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7 });
  const tufts: THREE.Matrix4[] = [];
  const flowers: { m: THREE.Matrix4; c: THREE.Color }[] = [];
  const palette = ['#e8d34a', '#f2f2f0', '#c95a8a', '#7a6ad8', '#e07a3a'];
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    const x = area.x0 + rnd() * (area.x1 - area.x0);
    const z = area.z0 + rnd() * (area.z1 - area.z0);
    if (!inside(x, z)) continue;
    const s = 0.7 + rnd() * 0.8;
    m.compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6.28), new THREE.Vector3(s, s, s));
    if (rnd() < 0.16) flowers.push({ m: m.clone(), c: new THREE.Color(palette[Math.floor(rnd() * palette.length)]) });
    else tufts.push(m.clone());
  }
  const ti = new THREE.InstancedMesh(tuftGeo, grassMat, tufts.length);
  tufts.forEach((mm, i) => ti.setMatrixAt(i, mm));
  const fi = new THREE.InstancedMesh(flowerGeo, flowerMat, flowers.length);
  flowers.forEach((f, i) => (fi.setMatrixAt(i, f.m), fi.setColorAt(i, f.c)));
  for (const im of [ti, fi]) {
    im.receiveShadow = true;
    im.computeBoundingSphere();
    g.add(im);
  }
  return g;
}

/** Générateur pseudo-aléatoire déterministe : même nature pour tous les joueurs. */
function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
