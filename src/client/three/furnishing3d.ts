/**
 * Modèles 3D de l'ameublement et de la décoration (types de meubles ajoutés après le prototype).
 * Repère local fourni par villa3d.oriented() : dos du meuble vers −z (contre le mur), largeur W sur x,
 * profondeur D sur z, sol en y = 0, centre de l'emprise en (0, 0, 0).
 *
 * Tous les matériaux viennent du cache MAT (fusion des maillages statiques par matériau : peu de draw calls).
 * La petite décoration (vases, livres, bougies, cadres…) est posée SUR les meubles.
 * Aucune lumière : les abat-jour sont simplement légèrement émissifs.
 */
import * as THREE from 'three';
import { LEVEL_HEIGHT, levelOf, type FurnitureDef } from '@shared/content/villa';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { cyl, type V3 } from './build';
import { MAT } from './materials';

// ───────────── primitives économes (beaucoup d'objets : on limite les triangles) ─────────────

function mesh(parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, pos: V3, rot: V3 = [0, 0, 0]) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(...pos);
  o.rotation.set(...rot);
  o.castShadow = true;
  o.receiveShadow = true;
  parent.add(o);
  return o;
}
/** Boîte, éventuellement à arêtes arrondies (1 segment d'arrondi : ~100 triangles au lieu de ~600). */
function box(parent: THREE.Object3D, size: V3, m: THREE.Material, pos: V3, rot: V3 = [0, 0, 0], rounded = 0) {
  const geo = rounded ? new RoundedBoxGeometry(size[0], size[1], size[2], 1, Math.min(rounded, size[0] / 2.1, size[1] / 2.1, size[2] / 2.1)) : new THREE.BoxGeometry(...size);
  return mesh(parent, geo, m, pos, rot);
}
function sphere(parent: THREE.Object3D, r: number, m: THREE.Material, pos: V3, scale: V3 = [1, 1, 1], ws = 10, hs = 7) {
  const o = mesh(parent, new THREE.SphereGeometry(r, ws, hs), m, pos);
  o.scale.set(...scale);
  return o;
}

// ───────────── matériaux partagés ─────────────

const M = {
  wood: () => MAT.wood('#5c3a22'),
  dark: () => MAT.wood('#2e1d12'),
  walnut: () => MAT.wood('#3a2416'),
  light: () => MAT.wood('#8a6440'),
  brass: () => MAT.metal('#b8913e', 0.3),
  chrome: () => MAT.metal('#d8dde2', 0.12),
  iron: () => MAT.metal('#3a3a3c', 0.55),
  shade: () => MAT.glow('#f3dcae', 0.35),
  paper: () => MAT.paint('#efe8d8', 0.9),
};
const BOOK_COLORS = ['#6a2424', '#24406a', '#2f4a28', '#7a5a22', '#3b2a4a', '#6a5a4a', '#1f1f1f'];
const SHEET_COLORS = ['#e8dfc8', '#d8cba8', '#c9b48a', '#6a2424', '#2f4a28'];
const FLOWER_COLORS = ['#c23a4a', '#e8c34a', '#f2efe6', '#8a3a8a'];
const LEAF_COLORS = ['#2f5a2a', '#3d6b33', '#24452a', '#4a7a3a'];
const book = (i: number) => MAT.paint(BOOK_COLORS[i % BOOK_COLORS.length], 0.7);
const leaf = (i: number) => MAT.paint(LEAF_COLORS[i % LEAF_COLORS.length], 0.85);

/** Tissu d'ameublement selon la pièce. */
function upholstery(roomId: string): THREE.Material {
  const c: Record<string, string> = {
    living: '#5b1f2a',
    office: '#4a2a1a',
    hall: '#3b4a2a',
    bedroom1: '#2f4a7a',
    bedroom2: '#7a2434',
    library: '#4a2a1a',
    guestroom: '#6a5a3a',
    musicroom: '#2f4a3c',
    suite: '#6a2a4a',
    landing: '#5b1f2a',
    corridor: '#5b1f2a',
    dining: '#8a3b26',
    gamesroom: '#1f5a52',
    kidsroom: '#3a6a8a',
    mudroom: '#4a5a28',
    basement: '#5a5040',
    attic: '#6a5a48',
  };
  return MAT.fabric(c[roomId] ?? '#5b4a3a');
}

/** Générateur pseudo-aléatoire déterministe (même rendu à chaque chargement). */
function rng(id: string) {
  let s = 7;
  for (let i = 0; i < id.length; i++) s = (s * 31 + id.charCodeAt(i)) % 2147483647;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function ico(parent: THREE.Object3D, r: number, m: THREE.Material, pos: V3, scale: V3 = [1, 1, 1], detail = 0) {
  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(r, detail), m);
  mesh.position.set(...pos);
  mesh.scale.set(...scale);
  mesh.rotation.set(pos[0] * 3.1, pos[1] * 5.3, pos[2] * 2.7);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function torus(parent: THREE.Object3D, r: number, tube: number, m: THREE.Material, pos: V3, rot: V3 = [Math.PI / 2, 0, 0], arc = Math.PI * 2) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 5, 16, arc), m);
  mesh.position.set(...pos);
  mesh.rotation.set(...rot);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

// ───────────── petite décoration (posée sur les meubles) ─────────────

function vase(g: THREE.Object3D, x: number, y: number, z: number, r: () => number) {
  const tall = 0.18 + r() * 0.14;
  const m = r() < 0.5 ? MAT.porcelain() : MAT.lacquer(['#2a4a6a', '#6a2a2a', '#c9a45c'][Math.floor(r() * 3)]);
  cyl(g, 0.04, 0.06, tall, m, [x, y + tall / 2, z], [0, 0, 0], 14);
  sphere(g, 0.065, m, [x, y + tall * 0.3, z], [1, 0.9, 1]);
  if (r() < 0.75) {
    const fm = MAT.paint(FLOWER_COLORS[Math.floor(r() * FLOWER_COLORS.length)], 0.8);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + r();
      const h = y + tall + 0.08 + r() * 0.1;
      cyl(g, 0.004, 0.004, h - y - tall + 0.05, leaf(1), [x + Math.cos(a) * 0.03, (h + y + tall) / 2, z + Math.sin(a) * 0.03], [Math.sin(a) * 0.2, 0, Math.cos(a) * 0.2], 4);
      ico(g, 0.032, fm, [x + Math.cos(a) * 0.05, h, z + Math.sin(a) * 0.05]);
    }
    for (let i = 0; i < 3; i++) ico(g, 0.05, leaf(i), [x + (r() - 0.5) * 0.08, y + tall + 0.03, z + (r() - 0.5) * 0.08], [1, 0.5, 1]);
  }
}

function bookStack(g: THREE.Object3D, x: number, y: number, z: number, r: () => number) {
  const n = 2 + Math.floor(r() * 2);
  let h = y;
  for (let i = 0; i < n; i++) {
    const t = 0.03 + r() * 0.025;
    box(g, [0.2 + r() * 0.06, t, 0.15 + r() * 0.04], book(Math.floor(r() * 7)), [x, h + t / 2, z], [0, (r() - 0.5) * 0.5, 0]);
    h += t;
  }
}

function candlestick(g: THREE.Object3D, x: number, y: number, z: number) {
  cyl(g, 0.035, 0.05, 0.02, M.brass(), [x, y + 0.01, z], [0, 0, 0], 12);
  cyl(g, 0.012, 0.016, 0.2, M.brass(), [x, y + 0.11, z], [0, 0, 0], 10);
  cyl(g, 0.012, 0.012, 0.1, MAT.paint('#f2ece0', 0.6), [x, y + 0.26, z], [0, 0, 0], 10);
  sphere(g, 0.01, MAT.glow('#ffcf80', 1.5), [x, y + 0.33, z]);
}

function frame(g: THREE.Object3D, x: number, y: number, z: number, w: number, h: number, r: () => number, tilt = -0.18) {
  const p = new THREE.Group();
  p.position.set(x, y, z);
  p.rotation.x = tilt;
  box(p, [w, h, 0.025], r() < 0.5 ? M.brass() : M.dark(), [0, h / 2, 0]);
  box(p, [w * 0.8, h * 0.8, 0.01], book(Math.floor(r() * 7)), [0, h / 2, 0.014]);
  if (r() < 0.6) box(p, [w * 0.5, h * 0.25, 0.006], book(Math.floor(r() * 7)), [0, h * 0.35, 0.02]);
  g.add(p);
}

function fruitBowl(g: THREE.Object3D, x: number, y: number, z: number) {
  cyl(g, 0.13, 0.07, 0.06, MAT.porcelain(), [x, y + 0.03, z], [0, 0, 0], 16);
  const fruits = [MAT.paint('#b8312a', 0.5), MAT.paint('#d8a32a', 0.5), MAT.paint('#6a9a2a', 0.5)];
  [[-0.05, 0], [0.05, 0.02], [0, -0.05], [0.01, 0.05], [0, 0]].forEach(([dx, dz], i) => ico(g, 0.04, fruits[i % 3], [x + dx, y + 0.08 + (i === 4 ? 0.04 : 0), z + dz]));
}

/** Petite statuette en bronze sur socle. */
function statuette(g: THREE.Object3D, x: number, y: number, z: number) {
  box(g, [0.12, 0.05, 0.12], M.walnut(), [x, y + 0.025, z]);
  cyl(g, 0.025, 0.035, 0.16, M.brass(), [x, y + 0.13, z], [0, 0, 0], 10);
  sphere(g, 0.035, M.brass(), [x, y + 0.24, z]);
}

function bottle(g: THREE.Object3D, x: number, y: number, z: number, color: string) {
  const m = MAT.lacquer(color);
  cyl(g, 0.035, 0.035, 0.2, m, [x, y + 0.1, z], [0, 0, 0], 10);
  cyl(g, 0.012, 0.03, 0.08, m, [x, y + 0.24, z], [0, 0, 0], 10);
}

/** Un ou plusieurs objets décoratifs sur un plateau de largeur w, centré en (0, y, z). */
function topDecor(g: THREE.Object3D, w: number, y: number, z: number, r: () => number, wall = true) {
  const slots = Math.max(1, Math.floor(w / 0.42));
  for (let i = 0; i < slots; i++) {
    const x = -w / 2 + (w / slots) * (i + 0.5) + (r() - 0.5) * 0.08;
    const k = Math.floor(r() * 7);
    if (k === 0 || k === 1) vase(g, x, y, z, r);
    else if (k === 2) bookStack(g, x, y, z, r);
    else if (k === 3) {
      candlestick(g, x - 0.07, y, z);
      candlestick(g, x + 0.07, y, z);
    } else if (k === 4 && wall) frame(g, x, y, z - 0.06, 0.26, 0.32, r);
    else if (k === 5) fruitBowl(g, x, y, z);
    else if (k === 6) statuette(g, x, y, z);
    else bookStack(g, x, y, z, r);
  }
}

// ───────────── meubles ─────────────

function armchair(g: THREE.Group, f: FurnitureDef, W: number, D: number) {
  const fab = upholstery(f.roomId);
  const leather = f.name.includes('cuir') || f.name.includes('club') ? MAT.lacquer('#4a2414') : fab;
  const aw = Math.min(W, 0.86);
  const ad = Math.min(D, 0.84);
  const back = -ad / 2;
  box(g, [aw, 0.26, ad], leather, [0, 0.27, 0], [0, 0, 0], 0.06);
  box(g, [aw - 0.3, 0.13, ad - 0.24], leather, [0, 0.46, 0.06], [0, 0, 0], 0.05);
  box(g, [aw - 0.08, 0.6, 0.2], leather, [0, 0.66, back + 0.12], [-0.1, 0, 0], 0.07);
  for (const s of [-1, 1]) box(g, [0.15, 0.3, ad - 0.04], leather, [s * (aw / 2 - 0.075), 0.53, 0.01], [0, 0, 0], 0.06);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, 0.025, 0.018, 0.14, M.dark(), [sx * (aw / 2 - 0.08), 0.07, sz * (ad / 2 - 0.08)], [0, 0, 0], 10);
  // coussin décoratif
  box(g, [0.3, 0.26, 0.1], MAT.fabric('#c9a45c'), [aw * 0.12, 0.66, back + 0.3], [-0.25, 0.3, 0.1], 0.04);
}

function chair(g: THREE.Group, f: FurnitureDef) {
  const wood = M.wood();
  if (f.name.includes('Tabouret')) {
    cyl(g, 0.18, 0.18, 0.05, wood, [0, 0.62, 0], [0, 0, 0], 16);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      cyl(g, 0.018, 0.022, 0.64, M.dark(), [Math.cos(a) * 0.12, 0.31, Math.sin(a) * 0.12], [Math.sin(a) * 0.14, 0, -Math.cos(a) * 0.14], 8);
    }
    torus(g, 0.13, 0.008, M.dark(), [0, 0.22, 0]);
    return;
  }
  const c = new THREE.Group();
  c.position.z = 0.05;
  g.add(c);
  box(c, [0.44, 0.05, 0.42], wood, [0, 0.45, 0]);
  box(c, [0.4, 0.05, 0.38], upholstery(f.roomId), [0, 0.495, 0.01], [0, 0, 0], 0.02);
  for (const lx of [-0.19, 0.19]) {
    box(c, [0.035, 0.45, 0.035], M.dark(), [lx, 0.225, 0.18]);
    box(c, [0.035, 0.98, 0.035], M.dark(), [lx, 0.49, -0.19], [-0.05, 0, 0]);
  }
  box(c, [0.42, 0.07, 0.03], wood, [0, 0.95, -0.21], [-0.05, 0, 0]);
  box(c, [0.3, 0.36, 0.02], upholstery(f.roomId), [0, 0.72, -0.2], [-0.05, 0, 0], 0.01);
  box(c, [0.36, 0.025, 0.025], M.dark(), [0, 0.15, 0]);
}

function bookcase(g: THREE.Group, f: FurnitureDef, W: number, D: number, r: () => number) {
  const tall = 2.15;
  const bd = Math.min(D, 0.42);
  const back = -D / 2;
  const frameM = f.roomId === 'musicroom' ? M.dark() : M.walnut();
  const z = back + bd / 2;
  box(g, [W, tall, 0.03], frameM, [0, tall / 2, back + 0.015]);
  for (const s of [-1, 1]) box(g, [0.05, tall, bd], frameM, [s * (W / 2 - 0.025), tall / 2, z]);
  box(g, [W + 0.08, 0.08, bd + 0.06], frameM, [0, tall + 0.04, z + 0.02]);
  box(g, [W, 0.1, bd], frameM, [0, 0.05, z]);
  const sheets = f.roomId === 'musicroom';
  const rows = 5;
  const step = (tall - 0.16) / rows;
  for (let row = 0; row < rows; row++) {
    const y = 0.1 + row * step;
    if (row > 0) box(g, [W - 0.1, 0.025, bd - 0.02], frameM, [0, y, z]);
    let x = -W / 2 + 0.07;
    while (x < W / 2 - 0.12) {
      const roll = r();
      if (roll < 0.06 && x < W / 2 - 0.4) {
        // un objet au milieu des livres
        const k = Math.floor(r() * 3);
        if (k === 0) vase(g, x + 0.1, y + 0.012, z, r);
        else if (k === 1) bookStack(g, x + 0.12, y + 0.012, z, r);
        else {
          sphere(g, 0.06, M.brass(), [x + 0.1, y + 0.08, z]);
          cyl(g, 0.04, 0.05, 0.03, M.dark(), [x + 0.1, y + 0.03, z], [0, 0, 0], 12);
        }
        x += 0.26;
        continue;
      }
      if (roll < 0.1) {
        x += 0.06 + r() * 0.12;
        continue;
      }
      const bw = 0.03 + r() * 0.04;
      const bh = Math.min(step - 0.06, 0.22 + r() * 0.12);
      const colors = sheets ? SHEET_COLORS : BOOK_COLORS;
      const lean = r() < 0.06 ? 0.14 : 0;
      box(g, [bw, bh, bd * 0.75], MAT.paint(colors[Math.floor(r() * colors.length)], 0.7), [x + bw / 2, y + 0.012 + bh / 2, z + 0.01], [0, 0, lean]);
      x += bw + 0.003 + lean * 0.3;
    }
  }
  if (f.name.includes('vitrée')) {
    for (const s of [-1, 1]) {
      box(g, [W / 2 - 0.05, tall - 0.2, 0.012], MAT.glass(), [s * (W / 4 - 0.01), tall / 2 + 0.02, back + bd + 0.01]);
      cyl(g, 0.01, 0.01, 0.1, M.brass(), [s * 0.06, 1.1, back + bd + 0.03], [0, 0, 0], 8);
    }
  }
  if (f.roomId === 'library' || f.roomId === 'office') topDecor(g, W * 0.7, tall + 0.08, z, r, false);
}

function plant(g: THREE.Group, f: FurnitureDef, r: () => number) {
  const outdoor = f.roomId === 'garden' || f.roomId === 'exterior' || f.roomId === 'orchard';
  if (outdoor) {
    // grand pot de terre cuite et arbuste taillé (buis / laurier)
    const terra = MAT.paint('#9a5a3a', 0.85);
    cyl(g, 0.34, 0.24, 0.55, terra, [0, 0.275, 0], [0, 0, 0], 18);
    torus(g, 0.34, 0.035, terra, [0, 0.55, 0]);
    cyl(g, 0.31, 0.31, 0.02, MAT.paint('#3a2a1c', 1), [0, 0.53, 0], [0, 0, 0], 18);
    if (f.name.includes('Laurier')) {
      cyl(g, 0.03, 0.04, 0.7, M.dark(), [0, 0.85, 0], [0, 0, 0], 8);
      for (let i = 0; i < 7; i++) ico(g, 0.22, leaf(i), [(r() - 0.5) * 0.35, 1.25 + r() * 0.45, (r() - 0.5) * 0.35]);
    } else {
      sphere(g, 0.36, leaf(0), [0, 0.92, 0], [1, 0.92, 1]);
      for (let i = 0; i < 6; i++) ico(g, 0.14, leaf(i + 1), [Math.cos(i) * 0.26, 0.95 + (r() - 0.5) * 0.3, Math.sin(i) * 0.26]);
    }
    return;
  }
  const potColors = ['#9a5a3a', '#e8e2d4', '#2a4a5a', '#3a2a22'];
  const pot = MAT.paint(potColors[Math.floor(r() * potColors.length)], 0.5);
  const kind = f.name.includes('Palmier') ? 2 : f.name.includes('Fougère') || f.name.includes('aromatique') ? 1 : f.name.includes('grasse') ? 3 : Math.floor(r() * 3);
  const ph = 0.38;
  cyl(g, 0.2, 0.15, ph, pot, [0, ph / 2, 0], [0, 0, 0], 16);
  torus(g, 0.2, 0.02, pot, [0, ph, 0]);
  cyl(g, 0.18, 0.18, 0.02, MAT.paint('#3a2a1c', 1), [0, ph - 0.02, 0], [0, 0, 0], 16);
  if (kind === 0) {
    // ficus
    cyl(g, 0.025, 0.035, 1.0, M.dark(), [0, ph + 0.5, 0], [0.05, 0, 0.04], 8);
    for (let i = 0; i < 9; i++) {
      const a = r() * Math.PI * 2;
      const rr = 0.1 + r() * 0.2;
      ico(g, 0.16 + r() * 0.08, leaf(i), [Math.cos(a) * rr, ph + 0.8 + r() * 0.65, Math.sin(a) * rr], [1, 0.8, 1]);
    }
  } else if (kind === 1) {
    // fougère / touffe basse
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const fr = new THREE.Group();
      fr.position.set(0, ph, 0);
      fr.rotation.set(0, a, 0);
      const fronde = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.55, 4), leaf(i));
      fronde.position.set(0.18, 0.18, 0);
      fronde.rotation.z = -1.0;
      fronde.scale.set(1, 1, 0.3);
      fronde.castShadow = true;
      fr.add(fronde);
      g.add(fr);
    }
    ico(g, 0.14, leaf(2), [0, ph + 0.1, 0], [1, 0.7, 1]);
  } else if (kind === 2) {
    // palmier d'intérieur
    cyl(g, 0.04, 0.06, 1.1, MAT.wood('#6a5032'), [0, ph + 0.55, 0], [0, 0, 0], 8);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + r() * 0.3;
      const p = new THREE.Group();
      p.position.set(0, ph + 1.1, 0);
      p.rotation.set(0, a, 0);
      const palme = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.8, 4), leaf(i));
      palme.position.set(0.32, -0.08, 0);
      palme.rotation.z = -1.9 + r() * 0.3;
      palme.scale.set(1, 1, 0.12);
      palme.castShadow = true;
      p.add(palme);
      g.add(p);
    }
  } else {
    // plante grasse / sansevieria
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const l = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.5 + r() * 0.3, 4), leaf(i));
      l.position.set(Math.cos(a) * 0.06, ph + 0.3, Math.sin(a) * 0.06);
      l.rotation.set(Math.sin(a) * 0.2, a, -Math.cos(a) * 0.2);
      l.scale.set(1, 1, 0.3);
      l.castShadow = true;
      g.add(l);
    }
  }
}

function floorLamp(g: THREE.Group, D: number) {
  const z = -D / 2 + 0.3;
  cyl(g, 0.16, 0.18, 0.03, M.brass(), [0, 0.015, z], [0, 0, 0], 18);
  cyl(g, 0.012, 0.012, 1.45, M.brass(), [0, 0.75, z], [0, 0, 0], 10);
  sphere(g, 0.025, M.brass(), [0, 0.6, z]);
  const shade = cyl(g, 0.13, 0.22, 0.3, M.shade(), [0, 1.52, z], [0, 0, 0], 18);
  shade.castShadow = false;
  cyl(g, 0.015, 0.015, 0.06, M.brass(), [0, 1.7, z], [0, 0, 0], 8);
}

function sideboard(g: THREE.Group, f: FurnitureDef, W: number, D: number, r: () => number) {
  const dd = Math.min(D, 0.5);
  const back = -D / 2;
  const z = back + dd / 2;
  const h = 0.86;
  const body = f.roomId === 'kitchen' ? MAT.paint('#d8cfb8', 0.5) : M.walnut();
  const front = f.roomId === 'kitchen' ? MAT.paint('#e8e2d4', 0.45) : MAT.wood('#4a2e1c');
  box(g, [W - 0.04, h - 0.12, dd - 0.02], body, [0, 0.12 + (h - 0.12) / 2, z]);
  box(g, [W, 0.04, dd + 0.02], body, [0, h + 0.02, z]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, 0.025, 0.018, 0.12, M.dark(), [sx * (W / 2 - 0.08), 0.06, z + sz * (dd / 2 - 0.06)], [0, 0, 0], 8);
  const n = Math.max(2, Math.round(W / 0.5));
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + 0.02 + ((W - 0.04) / n) * (i + 0.5);
    const fw = (W - 0.04) / n - 0.04;
    box(g, [fw, 0.16, 0.02], front, [x, h - 0.12, back + dd + 0.005]);
    box(g, [fw, 0.48, 0.02], front, [x, 0.42, back + dd + 0.005]);
    sphere(g, 0.018, M.brass(), [x, h - 0.12, back + dd + 0.025]);
    sphere(g, 0.018, M.brass(), [x + fw / 2 - 0.06, 0.5, back + dd + 0.025]);
  }
  if (f.roomId === 'kitchen') {
    // vaisselier : étagère haute avec assiettes
    box(g, [W - 0.1, 0.9, 0.03], body, [0, h + 0.5, back + 0.03]);
    for (const s of [-1, 1]) box(g, [0.04, 0.9, 0.24], body, [s * (W / 2 - 0.07), h + 0.5, back + 0.13]);
    box(g, [W - 0.1, 0.03, 0.26], body, [0, h + 0.95, back + 0.13]);
    box(g, [W - 0.1, 0.025, 0.22], body, [0, h + 0.45, back + 0.12]);
    for (const y of [h + 0.05, h + 0.47]) for (let x = -W / 2 + 0.22; x < W / 2 - 0.18; x += 0.24) cyl(g, 0.1, 0.1, 0.012, MAT.porcelain(), [x, y + 0.11, back + 0.08], [Math.PI / 2 - 0.2, 0, 0], 18);
    return;
  }
  topDecor(g, W - 0.1, h + 0.04, z, r);
  if (f.roomId !== 'corridor' && f.roomId !== 'landing') frame(g, 0, h + 0.5, back + 0.02, Math.min(0.9, W * 0.5), 0.6, r, 0);
}

function nightstand(g: THREE.Group, D: number, r: () => number) {
  const back = -D / 2;
  const z = back + 0.22;
  box(g, [0.48, 0.5, 0.4], M.walnut(), [0, 0.3, z]);
  box(g, [0.5, 0.03, 0.42], M.walnut(), [0, 0.565, z]);
  box(g, [0.42, 0.16, 0.02], MAT.wood('#4a2e1c'), [0, 0.44, z + 0.205]);
  sphere(g, 0.016, M.brass(), [0, 0.44, z + 0.22]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, 0.02, 0.015, 0.06, M.dark(), [sx * 0.2, 0.03, z + sz * 0.16], [0, 0, 0], 8);
  cyl(g, 0.06, 0.08, 0.2, MAT.porcelain(), [-0.08, 0.68, z - 0.04], [0, 0, 0], 14);
  const shade = cyl(g, 0.11, 0.16, 0.18, M.shade(), [-0.08, 0.88, z - 0.04], [0, 0, 0], 16);
  shade.castShadow = false;
  bookStack(g, 0.12, 0.58, z + 0.06, r);
}

function dresser(g: THREE.Group, f: FurnitureDef, W: number, D: number, r: () => number) {
  const back = -D / 2;
  if (f.roomId.startsWith('bathroom')) {
    // armoire à linge ouverte : serviettes pliées
    const dd = Math.min(D, 0.42);
    const z = back + dd / 2;
    const white = MAT.paint('#ece8de', 0.5);
    box(g, [W, 1.9, 0.02], white, [0, 0.95, back + 0.01]);
    for (const s of [-1, 1]) box(g, [0.03, 1.9, dd], white, [s * (W / 2 - 0.015), 0.95, z]);
    const towels = [MAT.fabric('#f2efe6'), MAT.fabric('#9fb0bc'), MAT.fabric('#c9a45c')];
    for (let i = 0; i < 5; i++) {
      const y = 0.08 + i * 0.44;
      box(g, [W - 0.04, 0.025, dd - 0.02], white, [0, y, z]);
      if (i === 4) continue;
      let x = -W / 2 + 0.08;
      while (x < W / 2 - 0.3) {
        const t = towels[Math.floor(r() * 3)];
        const k = 2 + Math.floor(r() * 3);
        for (let j = 0; j < k; j++) box(g, [0.26, 0.05, dd - 0.08], t, [x + 0.13, y + 0.04 + j * 0.055, z]);
        x += 0.3;
      }
    }
    box(g, [W + 0.04, 0.04, dd + 0.02], white, [0, 1.92, z]);
    bottle(g, 0, 1.94, z, '#2a6a6a');
    return;
  }
  const dd = Math.min(D, 0.5);
  const z = back + dd / 2;
  const h = 0.92;
  const kitchen = f.roomId === 'kitchen';
  const body = kitchen ? MAT.paint('#d8cfb8', 0.5) : M.walnut();
  const front = kitchen ? MAT.paint('#e8e2d4', 0.45) : MAT.wood('#4a2e1c');
  box(g, [W - 0.04, h - 0.1, dd - 0.02], body, [0, 0.1 + (h - 0.1) / 2, z]);
  box(g, [W, 0.04, dd + 0.02], kitchen ? MAT.lacquer('#2a2826') : body, [0, h + 0.02, z]);
  box(g, [W - 0.02, 0.06, dd], body, [0, 0.07, z]);
  const rows = 4;
  for (let i = 0; i < rows; i++) {
    const y = 0.2 + i * 0.19;
    box(g, [W - 0.12, 0.16, 0.02], front, [0, y, back + dd + 0.005]);
    for (const s of W > 1.2 ? [-1, 1] : [0]) {
      const x = s * W * 0.25;
      box(g, [0.1, 0.018, 0.02], M.brass(), [x, y, back + dd + 0.022]);
    }
  }
  if (kitchen) {
    for (let i = 0; i < 4; i++) cyl(g, 0.06, 0.06, 0.16 + (i % 2) * 0.05, MAT.lacquer(['#3a5a7a', '#e8e2d4', '#8a3a2a'][i % 3]), [-W / 2 + 0.2 + i * 0.2, h + 0.04 + 0.09, z - 0.08], [0, 0, 0], 12);
    fruitBowl(g, W / 2 - 0.25, h + 0.04, z + 0.05);
    return;
  }
  topDecor(g, W - 0.15, h + 0.04, z + 0.05, r, false);
  // miroir au-dessus (chambres) ou tableau
  if (f.roomId.startsWith('bedroom') || f.roomId === 'guestroom' || f.roomId === 'suite') {
    box(g, [Math.min(0.8, W * 0.6) + 0.06, 0.86, 0.025], M.brass(), [0, h + 0.75, back + 0.015]);
    box(g, [Math.min(0.8, W * 0.6), 0.8, 0.01], MAT.metal('#d8dde2', 0.04), [0, h + 0.75, back + 0.03]);
  } else frame(g, 0, h + 0.4, back + 0.02, Math.min(0.8, W * 0.5), 0.55, r, 0);
}

function fridge(g: THREE.Group, D: number) {
  const back = -D / 2;
  const z = back + 0.35;
  const enamel = MAT.lacquer('#e9e6dc');
  box(g, [0.72, 1.72, 0.66], enamel, [0, 0.9, z], [0, 0, 0], 0.09);
  box(g, [0.66, 0.012, 0.01], M.iron(), [0, 1.22, z + 0.33]);
  box(g, [0.04, 0.32, 0.05], M.chrome(), [0.27, 1.4, z + 0.35], [0, 0, 0], 0.015);
  box(g, [0.04, 0.2, 0.05], M.chrome(), [0.27, 0.95, z + 0.35], [0, 0, 0], 0.015);
  box(g, [0.6, 0.08, 0.02], M.chrome(), [0, 0.1, z + 0.33]);
  // boîte à pain et bocal sur le dessus
  box(g, [0.36, 0.16, 0.24], MAT.lacquer('#8a3a2a'), [-0.1, 1.84, z - 0.05], [0, 0, 0], 0.04);
  cyl(g, 0.06, 0.06, 0.18, MAT.glass(), [0.2, 1.85, z], [0, 0, 0], 12);
}

function stove(g: THREE.Group, D: number) {
  const back = -D / 2;
  const z = back + 0.32;
  const enamel = MAT.lacquer('#e4dccb');
  box(g, [0.82, 0.86, 0.62], enamel, [0, 0.45, z], [0, 0, 0], 0.03);
  box(g, [0.84, 0.03, 0.64], MAT.lacquer('#1a1a1c'), [0, 0.895, z]);
  for (const [dx, dz, rr] of [[-0.2, -0.13, 0.09], [0.2, -0.13, 0.07], [-0.2, 0.14, 0.07], [0.2, 0.14, 0.09]] as const) {
    cyl(g, rr, rr, 0.02, M.iron(), [dx, 0.92, z + dz], [0, 0, 0], 16);
    torus(g, rr * 0.7, 0.01, M.iron(), [dx, 0.935, z + dz]);
  }
  // porte du four
  box(g, [0.66, 0.42, 0.02], enamel, [0, 0.38, z + 0.315], [0, 0, 0], 0.01);
  box(g, [0.42, 0.2, 0.01], MAT.glass(), [0, 0.4, z + 0.328]);
  cyl(g, 0.012, 0.012, 0.56, M.chrome(), [0, 0.64, z + 0.36], [0, 0, Math.PI / 2], 8);
  for (let i = 0; i < 5; i++) cyl(g, 0.022, 0.022, 0.03, MAT.lacquer('#1a1a1c'), [-0.3 + i * 0.15, 0.77, z + 0.33], [Math.PI / 2, 0, 0], 12);
  box(g, [0.82, 0.1, 0.06], enamel, [0, 0.13, z + 0.29]);
  // dosseret, casserole et bouilloire
  box(g, [0.84, 0.35, 0.04], enamel, [0, 1.08, back + 0.03], [0, 0, 0], 0.02);
  cyl(g, 0.045, 0.045, 0.01, MAT.porcelain(), [0, 1.12, back + 0.055], [Math.PI / 2, 0, 0], 14);
  cyl(g, 0.11, 0.1, 0.14, M.chrome(), [-0.2, 1.0, z - 0.13], [0, 0, 0], 16);
  box(g, [0.18, 0.02, 0.03], M.iron(), [-0.38, 1.05, z - 0.13]);
  sphere(g, 0.1, MAT.lacquer('#8a3a2a'), [0.2, 1.0, z + 0.14], [1, 0.85, 1]);
  cyl(g, 0.012, 0.02, 0.12, MAT.lacquer('#8a3a2a'), [0.3, 1.04, z + 0.14], [0, 0, -0.9], 8);
  torus(g, 0.06, 0.008, M.iron(), [0.2, 1.1, z + 0.14], [0, 0, 0], Math.PI);
}

function toilet(g: THREE.Group, D: number) {
  const back = -D / 2;
  const p = MAT.porcelain();
  box(g, [0.42, 0.42, 0.18], p, [0, 0.62, back + 0.12], [0, 0, 0], 0.04);
  box(g, [0.45, 0.04, 0.2], p, [0, 0.85, back + 0.12], [0, 0, 0], 0.015);
  cyl(g, 0.02, 0.02, 0.012, M.chrome(), [0, 0.875, back + 0.12], [0, 0, 0], 12);
  cyl(g, 0.12, 0.15, 0.36, p, [0, 0.18, back + 0.38], [0, 0, 0], 16);
  const bowl = sphere(g, 0.2, p, [0, 0.36, back + 0.42], [0.95, 0.4, 1.2]);
  bowl.castShadow = true;
  box(g, [0.38, 0.03, 0.46], MAT.lacquer('#3a2416'), [0, 0.43, back + 0.42], [0, 0, 0], 0.012);
  // dérouleur et brosse
  cyl(g, 0.006, 0.006, 0.14, M.chrome(), [0.32, 0.7, back + 0.15], [0, 0, Math.PI / 2], 8);
  cyl(g, 0.055, 0.055, 0.1, MAT.paint('#f8f6f0', 0.9), [0.32, 0.66, back + 0.15], [0, 0, Math.PI / 2], 14);
  cyl(g, 0.06, 0.06, 0.18, MAT.porcelain(), [-0.32, 0.09, back + 0.2], [0, 0, 0], 12);
}

function washbasin(g: THREE.Group, D: number, r: () => number) {
  const back = -D / 2;
  const z = back + 0.25;
  box(g, [0.7, 0.78, 0.46], MAT.paint('#e8e2d4', 0.45), [0, 0.39, z]);
  for (const s of [-1, 1]) {
    box(g, [0.31, 0.6, 0.02], MAT.paint('#ded7c6', 0.4), [s * 0.165, 0.36, z + 0.235]);
    box(g, [0.02, 0.1, 0.02], M.brass(), [s * 0.05, 0.5, z + 0.255]);
  }
  box(g, [0.74, 0.04, 0.5], MAT.marble(1, 1), [0, 0.8, z]);
  cyl(g, 0.21, 0.15, 0.12, MAT.porcelain(), [0, 0.86, z + 0.03], [0, 0, 0], 20);
  cyl(g, 0.18, 0.18, 0.005, MAT.paint('#a8b4bc', 0.1), [0, 0.92, z + 0.03], [0, 0, 0], 20);
  cyl(g, 0.014, 0.014, 0.2, M.chrome(), [0, 0.92, back + 0.06], [0, 0, 0], 10);
  cyl(g, 0.01, 0.01, 0.12, M.chrome(), [0, 1.02, back + 0.1], [Math.PI / 2, 0, 0], 8);
  for (const s of [-1, 1]) sphere(g, 0.022, M.chrome(), [s * 0.08, 0.85, back + 0.06]);
  // miroir, savon, flacons
  box(g, [0.62, 0.8, 0.02], M.brass(), [0, 1.55, back + 0.01]);
  box(g, [0.56, 0.74, 0.01], MAT.metal('#d8dde2', 0.04), [0, 1.55, back + 0.025]);
  box(g, [0.08, 0.025, 0.05], MAT.paint('#e8c3a0', 0.6), [0.27, 0.835, z + 0.12], [0, 0.3, 0], 0.01);
  bottle(g, -0.28, 0.82, z - 0.1, r() < 0.5 ? '#2a6a6a' : '#6a3a5a');
  // porte-serviette
  cyl(g, 0.01, 0.01, 0.5, M.chrome(), [0, 0.7, z + 0.3], [0, 0, Math.PI / 2], 8);
  box(g, [0.36, 0.34, 0.03], MAT.fabric('#f2efe6'), [0, 0.55, z + 0.3], [0, 0, 0], 0.012);
}

function tv(g: THREE.Group, D: number, r: () => number) {
  // poste des années 1950 sur pieds fuselés
  const back = -D / 2;
  const z = back + 0.27;
  const cab = MAT.wood('#6a4428');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, 0.02, 0.012, 0.3, M.dark(), [sx * 0.3, 0.15, z + sz * 0.18], [sz * 0.12, 0, -sx * 0.12], 8);
  box(g, [0.76, 0.66, 0.5], cab, [0, 0.62, z], [0, 0, 0], 0.05);
  box(g, [0.46, 0.38, 0.02], MAT.lacquer('#2a2826'), [-0.1, 0.66, z + 0.25], [0, 0, 0], 0.03);
  box(g, [0.4, 0.32, 0.01], MAT.paint('#1d2420', 0.12), [-0.1, 0.66, z + 0.262], [0, 0, 0], 0.03);
  box(g, [0.14, 0.4, 0.01], MAT.fabric('#c9b48a'), [0.25, 0.66, z + 0.255]);
  for (const y of [0.78, 0.6]) cyl(g, 0.025, 0.025, 0.03, M.brass(), [0.25, y, z + 0.27], [Math.PI / 2, 0, 0], 12);
  // antenne et napperon + vase
  sphere(g, 0.04, M.dark(), [0.15, 0.97, z - 0.05], [1, 0.5, 1]);
  for (const s of [-1, 1]) cyl(g, 0.004, 0.004, 0.45, M.chrome(), [0.15 + s * 0.12, 1.16, z - 0.05], [0, 0, s * 0.55], 6);
  cyl(g, 0.12, 0.12, 0.004, M.paper(), [-0.15, 0.955, z], [0, 0, 0], 16);
  vase(g, -0.15, 0.957, z, r);
}

function workbench(g: THREE.Group, f: FurnitureDef, W: number, D: number, r: () => number) {
  const back = -D / 2;
  const dd = Math.min(D, 0.72);
  const z = back + dd / 2;
  const top = MAT.wood('#7a5a3a');
  box(g, [W, 0.07, dd], top, [0, 0.88, z]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, [0.08, 0.85, 0.08], M.dark(), [sx * (W / 2 - 0.08), 0.425, z + sz * (dd / 2 - 0.08)]);
  box(g, [W - 0.16, 0.03, dd - 0.1], top, [0, 0.2, z]);
  // panneau à outils
  box(g, [W - 0.1, 0.8, 0.03], MAT.wood('#a08060'), [0, 1.45, back + 0.015]);
  const studio = f.roomId === 'studio';
  if (studio) {
    // pots de peinture, pinceaux, toiles roulées
    for (let i = 0; i < 7; i++) cyl(g, 0.045, 0.045, 0.1, book(i), [-W / 2 + 0.25 + i * 0.13, 0.965, z - 0.12 + (i % 2) * 0.1], [0, 0, 0], 12);
    cyl(g, 0.05, 0.05, 0.14, MAT.glass(), [W / 2 - 0.4, 0.985, z], [0, 0, 0], 12);
    for (let i = 0; i < 5; i++) cyl(g, 0.005, 0.005, 0.3, M.light(), [W / 2 - 0.4 + (i - 2) * 0.012, 1.08, z], [0, 0, (i - 2) * 0.12], 6);
    box(g, [0.38, 0.012, 0.28], MAT.wood('#c8a878'), [0.1, 0.92, z + 0.08], [0, 0.3, 0]);
    for (let i = 0; i < 4; i++) sphere(g, 0.025, book(i), [0.02 + i * 0.06, 0.93, z + 0.06], [1, 0.3, 1]);
    for (let i = 0; i < 3; i++) cyl(g, 0.04, 0.04, 0.9, M.paper(), [-W / 2 + 0.25 + i * 0.1, 0.22 + 0.05, z], [0, 0, Math.PI / 2 + 0.1 * i], 10);
    frame(g, W / 2 - 0.3, 1.25, back + 0.05, 0.3, 0.4, r, 0);
    return;
  }
  // outils suspendus
  const steel = MAT.metal('#8a8d92', 0.35);
  const handle = MAT.wood('#8a5a2a');
  for (let i = 0; i < Math.floor(W / 0.35); i++) {
    const x = -W / 2 + 0.25 + i * 0.35;
    const k = i % 4;
    if (k === 0) {
      box(g, [0.03, 0.3, 0.03], handle, [x, 1.4, back + 0.05]);
      box(g, [0.12, 0.04, 0.04], steel, [x, 1.56, back + 0.05]);
    } else if (k === 1) {
      box(g, [0.14, 0.32, 0.005], steel, [x, 1.45, back + 0.04]);
      box(g, [0.05, 0.1, 0.03], handle, [x, 1.66, back + 0.05]);
    } else if (k === 2) {
      box(g, [0.025, 0.24, 0.012], steel, [x, 1.42, back + 0.045], [0, 0, 0.3]);
      torus(g, 0.03, 0.01, steel, [x + 0.04, 1.54, back + 0.045], [0, 0, 0]);
    } else {
      torus(g, 0.08, 0.012, MAT.paint('#8a3a2a', 0.7), [x, 1.5, back + 0.05], [0, 0, 0]);
    }
  }
  // étau, boîte à outils, bocaux, lampe baladeuse
  box(g, [0.18, 0.1, 0.12], M.iron(), [W / 2 - 0.2, 0.97, z + dd / 2 - 0.08]);
  box(g, [0.04, 0.04, 0.2], M.iron(), [W / 2 - 0.2, 0.97, z + dd / 2 + 0.02]);
  box(g, [0.45, 0.18, 0.22], MAT.lacquer('#8a2a22'), [-W / 2 + 0.4, 1.0, z], [0, 0.1, 0], 0.02);
  box(g, [0.3, 0.02, 0.03], M.iron(), [-W / 2 + 0.4, 1.12, z], [0, 0.1, 0]);
  for (let i = 0; i < 3; i++) cyl(g, 0.045, 0.045, 0.12, MAT.glass(), [0.1 + i * 0.12, 0.975, z - 0.15], [0, 0, 0], 10);
  box(g, [0.5, 0.12, 0.3], MAT.wood('#6a5032'), [0, 0.3, z]);
  for (let i = 0; i < 2; i++) cyl(g, 0.1, 0.1, 0.16, MAT.metal('#5a6a5a', 0.6), [W / 2 - 0.3 - i * 0.25, 0.3, z], [0, 0, 0], 14);
}

function barrel(g: THREE.Group, f: FurnitureDef, r: () => number) {
  const staves = f.roomId === 'garden' ? MAT.wood('#4a3a2a') : MAT.wood('#6a4428');
  const h = 0.9;
  cyl(g, 0.34, 0.3, h / 2, staves, [0, h * 0.75, 0], [0, 0, 0], 18);
  cyl(g, 0.3, 0.34, h / 2, staves, [0, h * 0.25, 0], [0, 0, 0], 18);
  cyl(g, 0.29, 0.29, 0.01, MAT.wood('#5a3a22'), [0, h + 0.001, 0], [0, 0, 0], 18);
  for (const [y, rr] of [[0.06, 0.305], [0.28, 0.33], [0.62, 0.33], [0.84, 0.305]] as const) cyl(g, rr + 0.008, rr + 0.008, 0.04, M.iron(), [0, y, 0], [0, 0, 0], 18);
  if (f.roomId === 'cellar') {
    cyl(g, 0.015, 0.015, 0.1, M.brass(), [0, 0.2, 0.36], [Math.PI / 2, 0, 0], 8);
    if (r() < 0.6) {
      bottle(g, -0.1, h, 0.02, '#2a3a1e');
      cyl(g, 0.03, 0.022, 0.1, MAT.glass(), [0.1, h + 0.05, -0.05], [0, 0, 0], 10);
    }
  }
}

function bench(g: THREE.Group, f: FurnitureDef, W: number, D: number) {
  const bw = W - 0.1;
  const outdoor = f.roomId === 'garden' || f.roomId === 'exterior' || f.roomId === 'orchard';
  if (outdoor) {
    const slat = MAT.wood('#7a5a3a');
    for (let i = 0; i < 4; i++) box(g, [bw, 0.03, 0.1], slat, [0, 0.45, -0.15 + i * 0.12]);
    for (let i = 0; i < 3; i++) box(g, [bw, 0.09, 0.025], slat, [0, 0.62 + i * 0.13, -0.3], [-0.15, 0, 0]);
    for (const s of [-1, 1]) {
      box(g, [0.05, 0.45, 0.5], M.iron(), [s * (bw / 2 - 0.1), 0.225, 0], [0, 0, 0], 0.02);
      box(g, [0.05, 0.5, 0.05], M.iron(), [s * (bw / 2 - 0.1), 0.7, -0.29], [-0.15, 0, 0]);
      box(g, [0.05, 0.05, 0.42], M.iron(), [s * (bw / 2 - 0.1), 0.66, -0.06]);
    }
    return;
  }
  const back = -D / 2;
  const z = back + 0.25;
  box(g, [bw, 0.08, 0.42], M.walnut(), [0, 0.38, z]);
  box(g, [bw - 0.04, 0.1, 0.4], upholstery(f.roomId), [0, 0.47, z], [0, 0, 0], 0.04);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, 0.025, 0.018, 0.34, M.dark(), [sx * (bw / 2 - 0.08), 0.17, z + sz * 0.15], [0, 0, 0], 8);
  box(g, [bw - 0.2, 0.025, 0.025], M.dark(), [0, 0.12, z]);
  // coussins
  box(g, [0.36, 0.3, 0.1], MAT.fabric('#c9a45c'), [-bw / 2 + 0.3, 0.66, back + 0.1], [-0.2, 0, 0.05], 0.04);
  if (bw > 1.4) box(g, [0.34, 0.28, 0.1], MAT.fabric('#e8dcc0'), [bw / 2 - 0.3, 0.66, back + 0.1], [-0.2, 0, -0.05], 0.04);
}

function coatRack(g: THREE.Group) {
  const wood = M.dark();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    box(g, [0.04, 0.03, 0.34], wood, [Math.sin(a) * 0.15, 0.03, Math.cos(a) * 0.15], [0, a, 0]);
  }
  cyl(g, 0.025, 0.03, 1.8, wood, [0, 0.9, 0], [0, 0, 0], 10);
  sphere(g, 0.04, wood, [0, 1.82, 0]);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    cyl(g, 0.01, 0.01, 0.16, M.brass(), [Math.cos(a) * 0.07, 1.7, Math.sin(a) * 0.07], [Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9], 6);
  }
  // manteau, écharpe et chapeau
  box(g, [0.38, 0.95, 0.16], MAT.fabric('#2a2a32'), [0.12, 1.18, 0.05], [0, 0.3, -0.05], 0.06);
  box(g, [0.08, 0.6, 0.04], MAT.fabric('#7a2434'), [-0.1, 1.35, 0.08], [0, -0.3, 0.1], 0.02);
  cyl(g, 0.16, 0.16, 0.012, MAT.fabric('#3a2a1e'), [-0.06, 1.78, -0.05], [0.2, 0, 0], 16);
  cyl(g, 0.09, 0.1, 0.12, MAT.fabric('#3a2a1e'), [-0.06, 1.84, -0.04], [0.2, 0, 0], 16);
  // porte-parapluies
  cyl(g, 0.1, 0.09, 0.45, MAT.lacquer('#2a4a3a'), [0.28, 0.225, -0.22], [0, 0, 0], 14);
  cyl(g, 0.012, 0.012, 0.8, M.iron(), [0.28, 0.6, -0.22], [0.1, 0, 0.08], 6);
  torus(g, 0.04, 0.01, M.dark(), [0.32, 1.0, -0.2], [0, 0, 0], Math.PI);
}

function easel(g: THREE.Group, r: () => number) {
  const wood = M.light();
  for (const s of [-1, 1]) box(g, [0.04, 1.75, 0.03], wood, [s * 0.24, 0.86, 0.05], [0.08, 0, s * -0.09]);
  box(g, [0.04, 1.7, 0.03], wood, [0, 0.82, -0.25], [-0.32, 0, 0]);
  box(g, [0.6, 0.04, 0.08], wood, [0, 0.82, 0.1]);
  box(g, [0.05, 1.5, 0.03], wood, [0, 1.0, 0.04], [0.08, 0, 0]);
  // toile en cours
  const c = new THREE.Group();
  c.position.set(0, 1.18, 0.1);
  c.rotation.x = -0.08;
  g.add(c);
  box(c, [0.62, 0.74, 0.025], wood, [0, 0, 0]);
  box(c, [0.58, 0.7, 0.02], MAT.paint('#efe9dc', 0.9), [0, 0, 0.008]);
  const pal = () => book(Math.floor(r() * 7));
  box(c, [0.58, 0.32, 0.004], pal(), [0, 0.19, 0.02]);
  box(c, [0.58, 0.18, 0.004], pal(), [0, -0.2, 0.02]);
  sphere(c, 0.06, MAT.paint('#e8c34a', 0.8), [0.15 * (r() - 0.5) * 2, 0.15, 0.022], [1, 1, 0.1]);
  box(c, [0.16, 0.22, 0.004], pal(), [-0.12, -0.02, 0.024]);
  // palette et pinceau posés sur la tablette
  box(g, [0.24, 0.01, 0.06], MAT.wood('#c8a878'), [0.12, 0.85, 0.12]);
  cyl(g, 0.004, 0.004, 0.22, wood, [-0.15, 0.85, 0.12], [0, 0, Math.PI / 2], 6);
}

function globe(g: THREE.Group) {
  const wood = M.walnut();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    box(g, [0.04, 0.6, 0.04], wood, [Math.sin(a) * 0.17, 0.3, Math.cos(a) * 0.17], [Math.cos(a) * 0.2, 0, -Math.sin(a) * 0.2]);
  }
  torus(g, 0.2, 0.018, wood, [0, 0.12, 0]);
  torus(g, 0.3, 0.025, wood, [0, 0.62, 0]);
  const tilt = new THREE.Group();
  tilt.position.set(0, 0.62, 0);
  tilt.rotation.z = 0.41;
  g.add(tilt);
  sphere(tilt, 0.27, MAT.paint('#3a5a6a', 0.45), [0, 0, 0]);
  const land = MAT.paint('#b8a06a', 0.6);
  for (const [lat, lon, sx, sy] of [[0.5, 0.3, 0.6, 0.45], [-0.3, 0.6, 0.35, 0.5], [0.6, 2.2, 0.7, 0.35], [-0.2, 2.6, 0.3, 0.45], [0.2, 4.2, 0.5, 0.5], [-0.6, 3.8, 0.3, 0.2]] as const) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 6), land);
    const nrm = new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon));
    m.position.copy(nrm).multiplyScalar(0.262);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), nrm);
    m.scale.set(sx, sy, 0.08);
    tilt.add(m);
  }
  torus(tilt, 0.3, 0.008, M.brass(), [0, 0, 0], [0, 0, 0], Math.PI * 1.6);
  cyl(tilt, 0.006, 0.006, 0.66, M.brass(), [0, 0, 0], [0, 0, 0], 6);
}

function harp(g: THREE.Group) {
  const gold = MAT.metal('#c9a24a', 0.28);
  const wood = MAT.wood('#8a6440');
  const h = new THREE.Group();
  h.rotation.y = Math.PI / 2;
  g.add(h);
  box(h, [0.7, 0.1, 0.36], gold, [0, 0.05, 0], [0, 0, 0], 0.03);
  // colonne
  cyl(h, 0.035, 0.045, 1.7, gold, [-0.3, 0.95, 0], [0, 0, 0], 12);
  sphere(h, 0.06, gold, [-0.3, 1.82, 0]);
  // caisse de résonance (diagonale)
  const sx0 = -0.2, sy0 = 0.15, sx1 = 0.3, sy1 = 1.5;
  const len = Math.hypot(sx1 - sx0, sy1 - sy0);
  const ang = Math.atan2(sy1 - sy0, sx1 - sx0);
  box(h, [len, 0.16, 0.22], wood, [(sx0 + sx1) / 2 + 0.05, (sy0 + sy1) / 2, 0], [0, 0, ang], 0.05);
  // console (cou)
  const nx0 = -0.3, ny0 = 1.74, nx1 = 0.32, ny1 = 1.56;
  box(h, [Math.hypot(nx1 - nx0, ny1 - ny0) + 0.06, 0.09, 0.06], gold, [(nx0 + nx1) / 2, (ny0 + ny1) / 2 + 0.03, 0], [0, 0, Math.atan2(ny1 - ny0, nx1 - nx0)], 0.02);
  // cordes
  const strings = MAT.paint('#e8dcc0', 0.4);
  for (let i = 0; i < 14; i++) {
    const x = -0.22 + i * 0.034;
    const top = ny0 + ((x - nx0) / (nx1 - nx0)) * (ny1 - ny0);
    const bot = sy0 + ((x - sx0) / (sx1 - sx0)) * (sy1 - sy0) + 0.08;
    if (top - bot < 0.05) continue;
    cyl(h, 0.003, 0.003, top - bot, i % 7 === 0 ? MAT.paint('#8a2a22', 0.4) : strings, [x, (top + bot) / 2, 0], [0, 0, 0], 4);
  }
}

function chest(g: THREE.Group, f: FurnitureDef, W: number, D: number) {
  const cw = W - 0.06;
  const cd = Math.min(D, 0.5);
  const z = -D / 2 + cd / 2 + 0.04;
  if (f.name.includes('Banc de lit')) {
    box(g, [cw, 0.4, cd], M.walnut(), [0, 0.25, z]);
    box(g, [cw - 0.02, 0.12, cd - 0.02], upholstery(f.roomId), [0, 0.5, z], [0, 0, 0], 0.05);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, 0.025, 0.018, 0.06, M.brass(), [sx * (cw / 2 - 0.08), 0.03, z + sz * (cd / 2 - 0.06)], [0, 0, 0], 8);
    return;
  }
  if (f.name.includes('linge')) {
    // panier en osier
    cyl(g, 0.26, 0.22, 0.6, MAT.wood('#b89a6a'), [0, 0.3, z], [0, 0, 0], 16);
    for (const y of [0.1, 0.3, 0.5]) torus(g, 0.25 - y * 0.05 + 0.02, 0.012, MAT.wood('#8a6a40'), [0, y, z]);
    cyl(g, 0.27, 0.27, 0.04, MAT.wood('#b89a6a'), [0, 0.62, z], [0, 0, 0], 16);
    box(g, [0.3, 0.06, 0.2], MAT.fabric('#f2efe6'), [0.04, 0.66, z], [0, 0.3, 0.2], 0.02);
    return;
  }
  const body = f.roomId === 'office' ? MAT.lacquer('#3a2414') : MAT.wood('#5a3a22');
  const h = 0.48;
  box(g, [cw, h, cd], body, [0, h / 2, z]);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(cd / 2, cd / 2, cw, 18, 1, false, 0, Math.PI), body);
  lid.rotation.set(0, 0, Math.PI / 2);
  lid.position.set(0, h, z);
  lid.scale.set(0.45, 1, 1);
  lid.castShadow = true;
  lid.receiveShadow = true;
  g.add(lid);
  const iron = f.roomId === 'office' ? M.brass() : M.iron();
  for (const x of [-cw / 2 + 0.1, cw / 2 - 0.1]) {
    box(g, [0.04, h, cd + 0.01], iron, [x, h / 2, z]);
    torus(g, cd / 2 + 0.005, 0.012, iron, [x, h, z], [0, Math.PI / 2, 0], Math.PI).scale.set(1, 0.45, 1);
  }
  box(g, [0.1, 0.12, 0.02], iron, [0, h - 0.05, z + cd / 2 + 0.01]);
  for (const s of [-1, 1]) torus(g, 0.04, 0.008, iron, [s * (cw / 2 + 0.01), h * 0.6, z], [0, Math.PI / 2, 0]);
  if (f.roomId === 'office') {
    // étiquettes de voyage
    box(g, [0.14, 0.1, 0.004], MAT.paint('#c9a45c', 0.8), [-cw * 0.25, h * 0.55, z + cd / 2 + 0.004], [0, 0, 0.2]);
    box(g, [0.12, 0.08, 0.004], MAT.paint('#8a3a2a', 0.8), [cw * 0.25, h * 0.4, z + cd / 2 + 0.004], [0, 0, -0.15]);
  }
}

/** Balustrade autour d'une trémie : trois côtés, le côté d'arrivée (sens de la montée, `facing`) reste ouvert. */
function railing(g: THREE.Group, f: FurnitureDef) {
  // on travaille dans le repère du monde (indépendant de l'orientation calculée)
  g.rotation.set(0, 0, 0);
  const hw = f.w / 2 - 0.05;
  const hd = f.h / 2 - 0.05;
  const wood = M.walnut();
  const post = M.dark();
  const bal = MAT.paint('#ece6da', 0.5);
  const H = 1.0;
  const run = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const ang = Math.atan2(z1 - z0, x1 - x0);
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    box(g, [len + 0.08, 0.06, 0.09], wood, [cx, H, cz], [0, -ang, 0], 0.02);
    box(g, [len, 0.04, 0.06], wood, [cx, 0.08, cz], [0, -ang, 0]);
    const n = Math.max(2, Math.round(len / 0.13));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      box(g, [0.035, H - 0.1, 0.035], bal, [x0 + (x1 - x0) * t, H / 2 + 0.03, z0 + (z1 - z0) * t]);
    }
  };
  const open = f.facing ?? 's';
  if (open !== 'n') run(-hw, -hd, hw, -hd);
  if (open !== 's') run(-hw, hd, hw, hd);
  if (open !== 'w') run(-hw, -hd, -hw, hd);
  if (open !== 'e') run(hw, -hd, hw, hd);
  for (const [x, z] of [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]] as const) {
    box(g, [0.11, H + 0.08, 0.11], post, [x, (H + 0.08) / 2, z]);
    sphere(g, 0.06, post, [x, H + 0.14, z]);
  }
}

// ───────────── buanderie, salle de jeux, bureau, sous-sol, grenier, jardin ─────────────

function washer(g: THREE.Group, D: number, dryer: boolean) {
  const back = -D / 2;
  const z = back + 0.32;
  const white = MAT.paint('#ecebe6', 0.35);
  box(g, [0.6, 0.85, 0.6], white, [0, 0.425, z], [0, 0, 0], 0.03);
  box(g, [0.58, 0.1, 0.02], MAT.paint('#d8d6cf', 0.4), [0, 0.78, z + 0.3]);
  cyl(g, 0.02, 0.02, 0.02, M.chrome(), [0.2, 0.78, z + 0.31], [Math.PI / 2, 0, 0], 10);
  torus(g, 0.19, 0.03, M.chrome(), [0, 0.42, z + 0.3], [0, 0, 0]);
  const door = new THREE.Mesh(new THREE.CircleGeometry(0.17, 20), dryer ? MAT.paint('#2a2a2a', 0.2) : MAT.glass());
  door.position.set(0, 0.42, z + 0.305);
  g.add(door);
  if (!dryer) box(g, [0.3, 0.1, 0.2], MAT.paint('#3a6a9a', 0.6), [-0.1, 0.9, z], [0, 0.2, 0], 0.02); // baril de lessive
  else box(g, [0.4, 0.14, 0.3], MAT.fabric('#e8dcc0'), [0, 0.92, z], [0, 0.15, 0], 0.05); // linge plié
}

function ironingBoard(g: THREE.Group, W: number) {
  const L = W - 0.1;
  box(g, [L - 0.2, 0.03, 0.38], MAT.fabric('#9ab0c8'), [0.1, 0.86, 0]);
  const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.03, 16, 1, false, Math.PI, Math.PI), MAT.fabric('#9ab0c8'));
  nose.position.set(-L / 2 + 0.2, 0.86, 0);
  g.add(nose);
  for (const s of [-1, 1]) box(g, [0.03, 1.0, 0.03], M.chrome(), [s * 0.25, 0.43, 0], [0, 0, s * 0.5]);
  box(g, [0.24, 0.12, 0.11], MAT.paint('#d8d6cf', 0.3), [L / 2 - 0.3, 0.94, 0], [0, 0.3, 0], 0.03); // fer
}

function laundryBasket(g: THREE.Group) {
  cyl(g, 0.26, 0.22, 0.5, MAT.wood('#b89a6a'), [0, 0.25, 0], [0, 0, 0], 16);
  for (const y of [0.1, 0.25, 0.4]) torus(g, 0.25 - y * 0.05 + 0.02, 0.012, MAT.wood('#8a6a40'), [0, y, 0]);
  box(g, [0.34, 0.12, 0.26], MAT.fabric('#e8e2d0'), [0.03, 0.52, 0], [0.2, 0.4, 0.15], 0.04);
  box(g, [0.22, 0.08, 0.2], MAT.fabric('#7a2434'), [-0.06, 0.56, 0.05], [-0.2, 0.9, 0.1], 0.03);
}

function dryingRack(g: THREE.Group, W: number) {
  const L = W - 0.1;
  for (const s of [-1, 1]) {
    box(g, [L, 0.02, 0.02], M.chrome(), [0, 0.95, s * 0.22]);
    for (const e of [-1, 1]) box(g, [0.02, 1.0, 0.02], M.chrome(), [e * (L / 2 - 0.05), 0.48, s * 0.22], [s * 0.25, 0, 0]);
  }
  const cloth = [MAT.fabric('#f2efe6'), MAT.fabric('#3a6a9a'), MAT.fabric('#c9a45c'), MAT.fabric('#7a2434')];
  for (let i = 0; i < 4; i++) box(g, [0.32, 0.5, 0.01], cloth[i], [-L / 2 + 0.3 + (i * (L - 0.5)) / 3, 0.72, (i % 2 ? 1 : -1) * 0.22]);
}

function billiard(g: THREE.Group, W: number, D: number) {
  const tw = W - 0.5;
  const td = D - 0.5;
  const wood = MAT.wood('#4a2a16');
  box(g, [tw, 0.22, td], wood, [0, 0.68, 0]);
  box(g, [tw - 0.24, 0.02, td - 0.24], MAT.fabric('#1f6a3a'), [0, 0.8, 0]);
  for (const s of [-1, 1]) {
    box(g, [tw, 0.08, 0.12], wood, [0, 0.82, s * (td / 2 - 0.06)]);
    box(g, [0.12, 0.08, td], wood, [s * (tw / 2 - 0.06), 0.82, 0]);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, 0.09, 0.07, 0.58, wood, [sx * (tw / 2 - 0.2), 0.29, sz * (td / 2 - 0.2)], [0, 0, 0], 10);
  for (const sx of [-1, 0, 1]) for (const sz of [-1, 1]) cyl(g, 0.05, 0.05, 0.02, MAT.paint('#0a0a0a', 0.8), [sx * (tw / 2 - 0.12), 0.815, sz * (td / 2 - 0.12)], [0, 0, 0], 10);
  const colors = ['#f2efe6', '#e8c34a', '#2a4ad8', '#c83a2a', '#6a2a8a', '#e8782a', '#2a8a4a', '#8a1a1a', '#111111'];
  colors.forEach((c, i) => sphere(g, 0.03, MAT.lacquer(c), [i === 0 ? -tw * 0.3 : tw * 0.15 + (i % 4) * 0.06, 0.84, i === 0 ? 0 : ((i % 3) - 1) * 0.07]));
  cyl(g, 0.012, 0.006, 1.4, MAT.wood('#c8a070'), [0, 0.86, td / 2 - 0.35], [0, 0, Math.PI / 2 - 0.03], 6);
}

function cueRack(g: THREE.Group, D: number) {
  const back = -D / 2;
  box(g, [0.4, 1.5, 0.06], MAT.wood('#4a2a16'), [0, 0.95, back + 0.04]);
  for (let i = 0; i < 4; i++) cyl(g, 0.012, 0.007, 1.45, MAT.wood('#c8a070'), [-0.14 + i * 0.09, 0.86, back + 0.1], [0, 0, 0], 6);
  box(g, [0.4, 0.06, 0.14], MAT.wood('#4a2a16'), [0, 0.1, back + 0.1]);
}

function gamesShelf(g: THREE.Group, W: number, D: number, r: () => number) {
  const back = -D / 2;
  const frameM = M.walnut();
  const tall = 1.8;
  box(g, [W, tall, 0.03], frameM, [0, tall / 2, back + 0.015]);
  for (const s of [-1, 1]) box(g, [0.04, tall, 0.4], frameM, [s * (W / 2 - 0.02), tall / 2, back + 0.2]);
  const colors = ['#c83a2a', '#2a5ad8', '#e8c34a', '#2a8a4a', '#e8e2d4', '#6a2a8a', '#1f1f1f'];
  for (let k = 0; k < 4; k++) {
    const y = 0.06 + k * 0.44;
    box(g, [W - 0.06, 0.03, 0.38], frameM, [0, y, back + 0.2]);
    if (k === 3) continue;
    let h = y + 0.02;
    for (let i = 0; i < 3 + Math.floor(r() * 2); i++) {
      const t = 0.05 + r() * 0.05;
      box(g, [W - 0.3 - r() * 0.2, t, 0.3], MAT.paint(colors[Math.floor(r() * colors.length)], 0.6), [(r() - 0.5) * 0.1, h + t / 2, back + 0.2]);
      h += t;
    }
  }
}

function darts(g: THREE.Group, D: number) {
  const back = -D / 2;
  box(g, [0.7, 0.9, 0.06], MAT.wood('#3a2416'), [0, 1.6, back + 0.03]);
  cyl(g, 0.23, 0.23, 0.04, MAT.paint('#1a1a1a', 0.9), [0, 1.62, back + 0.08], [Math.PI / 2, 0, 0], 24);
  for (const [rr, c, dz] of [[0.18, '#e8dcc0', 0.002], [0.12, '#a8312a', 0.004], [0.07, '#2a6a3a', 0.006], [0.02, '#a8312a', 0.008]] as const) cyl(g, rr, rr, 0.04, MAT.paint(c, 0.9), [0, 1.62, back + 0.08 + dz], [Math.PI / 2, 0, 0], 20);
  for (let i = 0; i < 3; i++) cyl(g, 0.004, 0.004, 0.12, M.chrome(), [-0.05 + i * 0.05, 1.6 + i * 0.03, back + 0.15], [Math.PI / 2, 0, 0], 6);
  box(g, [0.5, 0.75, 0.25], MAT.wood('#4a2e1c'), [0, 0.375, back + 0.13]);
}

function jukebox(g: THREE.Group, D: number) {
  const back = -D / 2;
  const z = back + 0.32;
  box(g, [0.8, 1.2, 0.55], MAT.lacquer('#7a2a1a'), [0, 0.6, z], [0, 0, 0], 0.05);
  const arch = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.55, 20, 1, false, -Math.PI / 2, Math.PI), MAT.lacquer('#7a2a1a'));
  arch.rotation.x = Math.PI / 2;
  arch.position.set(0, 1.2, z);
  arch.castShadow = true;
  g.add(arch);
  box(g, [0.6, 0.5, 0.02], MAT.glow('#ffb45c', 0.5), [0, 0.95, z + 0.28]);
  torus(g, 0.36, 0.03, MAT.glow('#e8c34a', 0.8), [0, 1.2, z + 0.28], [0, 0, 0], Math.PI);
  box(g, [0.6, 0.3, 0.02], M.chrome(), [0, 0.4, z + 0.28]);
}

function arcade(g: THREE.Group, D: number) {
  const back = -D / 2;
  const z = back + 0.33;
  const body = MAT.lacquer('#1f2a5a');
  box(g, [0.7, 1.75, 0.65], body, [0, 0.875, z]);
  box(g, [0.6, 0.45, 0.02], MAT.glow('#3a8aff', 0.55), [0, 1.35, z + 0.33], [-0.15, 0, 0]);
  box(g, [0.7, 0.08, 0.35], body, [0, 1.0, z + 0.4]);
  cyl(g, 0.015, 0.015, 0.08, M.iron(), [-0.15, 1.08, z + 0.42], [0, 0, 0], 8);
  sphere(g, 0.03, MAT.lacquer('#c83a2a'), [-0.15, 1.13, z + 0.42]);
  for (let i = 0; i < 3; i++) cyl(g, 0.025, 0.025, 0.02, MAT.lacquer(['#e8c34a', '#2a8a4a', '#c83a2a'][i]), [0.05 + i * 0.08, 1.05, z + 0.42], [0, 0, 0], 10);
  box(g, [0.7, 0.18, 0.66], MAT.glow('#e8c34a', 0.35), [0, 1.84, z]);
}

function safe(g: THREE.Group, D: number) {
  const back = -D / 2;
  const z = back + 0.3;
  const steel = MAT.paint('#3a3c40', 0.45);
  box(g, [0.6, 0.75, 0.55], steel, [0, 0.4, z], [0, 0, 0], 0.03);
  box(g, [0.5, 0.62, 0.02], MAT.paint('#2e3034', 0.4), [0, 0.42, z + 0.28]);
  cyl(g, 0.07, 0.07, 0.04, M.chrome(), [-0.08, 0.48, z + 0.3], [Math.PI / 2, 0, 0], 20);
  for (let i = 0; i < 12; i++) box(g, [0.006, 0.015, 0.006], MAT.paint('#e8e2d4', 0.5), [-0.08 + Math.cos((i / 12) * Math.PI * 2) * 0.06, 0.48 + Math.sin((i / 12) * Math.PI * 2) * 0.06, z + 0.322]);
  box(g, [0.14, 0.03, 0.04], M.chrome(), [0.14, 0.42, z + 0.3]);
  for (const sx of [-1, 1]) box(g, [0.06, 0.03, 0.5], M.iron(), [sx * 0.24, 0.015, z]);
  box(g, [0.3, 0.02, 0.22], MAT.paint('#efe8d8', 0.9), [0, 0.785, z]); // dossiers posés dessus
}

function filingCabinet(g: THREE.Group, D: number) {
  const back = -D / 2;
  const z = back + 0.3;
  box(g, [0.5, 1.3, 0.58], MAT.paint('#6a6e74', 0.45), [0, 0.65, z]);
  for (let i = 0; i < 4; i++) {
    box(g, [0.46, 0.28, 0.02], MAT.paint('#7a7e84', 0.4), [0, 0.18 + i * 0.31, z + 0.3]);
    box(g, [0.12, 0.025, 0.03], M.chrome(), [0, 0.26 + i * 0.31, z + 0.32]);
    box(g, [0.08, 0.04, 0.005], MAT.paint('#efe8d8', 0.9), [0, 0.22 + i * 0.31, z + 0.312]);
  }
}

const CEIL = 3;
function boiler(g: THREE.Group, W: number, D: number) {
  const back = -D / 2;
  const z = back + 0.4;
  box(g, [W - 0.3, 1.5, 0.75], MAT.paint('#8a3a22', 0.55), [0, 0.75, z], [0, 0, 0], 0.04);
  box(g, [W - 0.5, 0.3, 0.02], MAT.paint('#2a2a2a', 0.6), [0, 1.1, z + 0.38]);
  cyl(g, 0.05, 0.05, 0.02, MAT.paint('#e8e2d4', 0.4), [-0.2, 1.1, z + 0.39], [Math.PI / 2, 0, 0], 16);
  box(g, [0.1, 0.06, 0.02], MAT.glow('#ff8a3a', 1.2), [0.15, 0.4, z + 0.38]);
  cyl(g, 0.09, 0.09, CEIL - 1.5, M.iron(), [W / 2 - 0.4, 1.5 + (CEIL - 1.5) / 2, z - 0.15], [0, 0, 0], 12);
  for (const sx of [-0.3, 0.1]) cyl(g, 0.03, 0.03, 1.2, MAT.metal('#b87a4a', 0.4), [sx, 2.1, back + 0.06], [0, 0, 0], 8);
}

function waterHeater(g: THREE.Group, D: number) {
  const back = -D / 2;
  cyl(g, 0.28, 0.28, 1.5, MAT.paint('#e8e6e0', 0.4), [0, 0.95, back + 0.32], [0, 0, 0], 20);
  sphere(g, 0.28, MAT.paint('#e8e6e0', 0.4), [0, 1.7, back + 0.32], [1, 0.3, 1]);
  for (const sx of [-0.1, 0.1]) cyl(g, 0.025, 0.025, 1.2, MAT.metal('#b87a4a', 0.4), [sx, 2.3, back + 0.1], [0, 0, 0], 8);
  for (const sx of [-1, 1]) box(g, [0.04, 0.2, 0.04], M.iron(), [sx * 0.2, 0.1, back + 0.32]);
}

function wineRack(g: THREE.Group, W: number, D: number) {
  const back = -D / 2;
  const wood = MAT.wood('#4a2a16');
  const tall = 2.0;
  box(g, [W, tall, 0.03], wood, [0, tall / 2, back + 0.015]);
  const cols = Math.max(2, Math.round(W / 0.25));
  for (let i = 0; i <= cols; i++) box(g, [0.03, tall, 0.36], wood, [-W / 2 + (W * i) / cols, tall / 2, back + 0.18]);
  const glass = [MAT.lacquer('#1d3a24'), MAT.lacquer('#3a1018'), MAT.lacquer('#2a2a1a')];
  for (let r = 0; r < 7; r++) {
    box(g, [W, 0.02, 0.36], wood, [0, 0.05 + r * 0.28, back + 0.18]);
    for (let i = 0; i < cols; i++)
      if ((i * 7 + r * 3) % 5 !== 0) {
        const x = -W / 2 + (W * (i + 0.5)) / cols;
        cyl(g, 0.04, 0.04, 0.3, glass[(i + r) % 3], [x, 0.14 + r * 0.28, back + 0.2], [Math.PI / 2, 0, 0], 8);
        cyl(g, 0.016, 0.016, 0.08, glass[(i + r) % 3], [x, 0.14 + r * 0.28, back + 0.39], [Math.PI / 2, 0, 0], 6);
      }
  }
}

function boxes(g: THREE.Group, W: number, D: number, r: () => number) {
  const card = [MAT.paint('#a8865a', 0.95), MAT.paint('#b8966a', 0.95), MAT.paint('#98764a', 0.95)];
  const n = Math.max(2, Math.round(W * D * 2));
  let y = 0;
  for (let i = 0; i < n; i++) {
    const s = 0.4 + r() * 0.2;
    const x = (r() - 0.5) * (W - s);
    const z = (r() - 0.5) * (D - s);
    if (i % 2 === 0) y = 0;
    box(g, [s, s * 0.75, s * 0.9], card[i % 3], [x, y + (s * 0.75) / 2, z], [0, (r() - 0.5) * 0.4, 0]);
    y += s * 0.75;
  }
}

function mannequin(g: THREE.Group) {
  const fab = MAT.fabric('#c9b48a');
  cyl(g, 0.02, 0.02, 0.9, M.dark(), [0, 0.5, 0], [0, 0, 0], 8);
  for (let i = 0; i < 3; i++) box(g, [0.04, 0.03, 0.32], M.dark(), [0, 0.03, 0], [0, (i / 3) * Math.PI * 2, 0]);
  sphere(g, 0.2, fab, [0, 1.25, 0], [1, 1.5, 0.75]);
  sphere(g, 0.17, fab, [0, 1.0, 0], [1.05, 0.7, 0.75]);
  cyl(g, 0.04, 0.05, 0.12, fab, [0, 1.6, 0], [0, 0, 0], 10);
  sphere(g, 0.035, M.dark(), [0, 1.68, 0]);
  // drap jeté sur l'épaule
  box(g, [0.18, 0.6, 0.02], MAT.fabric('#e8e2d4'), [0.16, 1.2, 0.1], [0.1, 0, 0.2], 0.01);
}

function rockingHorse(g: THREE.Group) {
  const wood = MAT.wood('#a8784a');
  const paint = MAT.paint('#e8e2d4', 0.6);
  for (const s of [-1, 1]) {
    const rocker = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.025, 5, 20, 0.9), wood);
    rocker.rotation.set(0, Math.PI / 2, -Math.PI / 2 - 0.45);
    rocker.position.set(s * 0.15, 0.92, 0);
    rocker.castShadow = true;
    g.add(rocker);
  }
  for (const [x, z] of [[-0.15, -0.25], [0.15, -0.25], [-0.15, 0.25], [0.15, 0.25]] as const) cyl(g, 0.025, 0.02, 0.35, wood, [x, 0.25, z], [0, 0, 0], 8);
  box(g, [0.22, 0.2, 0.6], paint, [0, 0.5, 0], [0, 0, 0], 0.08);
  box(g, [0.14, 0.3, 0.14], paint, [0, 0.7, 0.3], [-0.5, 0, 0], 0.05);
  box(g, [0.13, 0.13, 0.28], paint, [0, 0.83, 0.42], [0.3, 0, 0], 0.05);
  box(g, [0.04, 0.3, 0.2], MAT.paint('#3a2416', 0.9), [0, 0.8, 0.22], [-0.4, 0, 0]);
  box(g, [0.24, 0.04, 0.24], MAT.paint('#8a2a22', 0.7), [0, 0.61, -0.02]);
  for (const s of [-1, 1]) sphere(g, 0.015, MAT.paint('#111111', 0.3), [s * 0.065, 0.88, 0.5]);
}

function toolbox(g: THREE.Group, D: number) {
  const back = -D / 2;
  const red = MAT.lacquer('#a8312a');
  box(g, [0.6, 0.85, 0.45], red, [0, 0.43, back + 0.25], [0, 0, 0], 0.02);
  for (let i = 0; i < 4; i++) box(g, [0.54, 0.16, 0.02], MAT.lacquer('#8a2420'), [0, 0.15 + i * 0.19, back + 0.48]);
  for (let i = 0; i < 4; i++) box(g, [0.2, 0.02, 0.03], M.chrome(), [0, 0.2 + i * 0.19, back + 0.5]);
  for (const sx of [-1, 1]) cyl(g, 0.03, 0.03, 0.03, MAT.paint('#111111', 0.6), [sx * 0.24, 0.015, back + 0.42], [Math.PI / 2, 0, 0], 10);
  box(g, [0.4, 0.06, 0.2], M.iron(), [0, 0.9, back + 0.25]);
}

function freezer(g: THREE.Group, W: number, D: number) {
  const back = -D / 2;
  box(g, [W - 0.15, 0.85, 0.7], MAT.paint('#e8e8e4', 0.35), [0, 0.425, back + 0.38], [0, 0, 0], 0.04);
  box(g, [W - 0.13, 0.06, 0.72], MAT.paint('#d8d8d4', 0.35), [0, 0.88, back + 0.38], [0, 0, 0], 0.02);
  box(g, [0.3, 0.04, 0.04], M.chrome(), [0, 0.8, back + 0.75]);
  box(g, [0.05, 0.03, 0.01], MAT.glow('#3aa86a', 1), [W / 2 - 0.25, 0.7, back + 0.735]);
}

function bicycle(g: THREE.Group, f: FurnitureDef) {
  const frameM = MAT.lacquer(f.roomId === 'basement' ? '#6a3a2a' : '#2a5a8a');
  const b = new THREE.Group();
  b.rotation.y = Math.PI / 2;
  g.add(b);
  for (const x of [-0.42, 0.42]) {
    torus(b, 0.3, 0.025, MAT.paint('#111111', 0.7), [x, 0.33, 0], [0, 0, 0]);
    cyl(b, 0.01, 0.01, 0.58, M.chrome(), [x, 0.33, 0], [0, 0, Math.PI / 2], 6);
  }
  box(b, [0.84, 0.035, 0.035], frameM, [0, 0.55, 0], [0, 0, -0.08]);
  box(b, [0.04, 0.5, 0.04], frameM, [-0.08, 0.5, 0], [0, 0, 0.35]);
  box(b, [0.03, 0.45, 0.03], frameM, [0.38, 0.55, 0], [0, 0, -0.3]);
  box(b, [0.2, 0.05, 0.12], MAT.paint('#1a1a1a', 0.7), [-0.2, 0.8, 0]);
  box(b, [0.04, 0.03, 0.45], M.chrome(), [0.42, 0.85, 0]);
}

function umbrellaStand(g: THREE.Group) {
  cyl(g, 0.15, 0.13, 0.5, MAT.lacquer('#2a4a3a'), [0, 0.25, 0], [0, 0, 0], 16);
  for (let i = 0; i < 3; i++) cyl(g, 0.012, 0.012, 0.9, M.iron(), [Math.cos(i * 2) * 0.05, 0.6, Math.sin(i * 2) * 0.05], [0.08 * Math.cos(i), 0, 0.08 * Math.sin(i)], 6);
  sphere(g, 0.07, MAT.fabric('#c83a2a'), [0.04, 0.75, 0], [0.8, 2, 0.8]);
  sphere(g, 0.06, MAT.fabric('#1f1f2a'), [-0.05, 0.72, 0.04], [0.8, 2, 0.8]);
}

function cushions(g: THREE.Group, W: number, D: number) {
  const c = [MAT.fabric('#c83a2a'), MAT.fabric('#e8c34a'), MAT.fabric('#2a6a8a'), MAT.fabric('#e8dcc0')];
  box(g, [W - 0.1, 0.12, D - 0.1], MAT.fabric('#6a4a2a'), [0, 0.06, 0], [0, 0, 0], 0.04);
  for (let i = 0; i < 4; i++) box(g, [0.45, 0.16, 0.4], c[i], [-W / 2 + 0.35 + (i * (W - 0.7)) / 3, 0.2, (i % 2) * 0.15 - 0.08], [-0.15, i * 0.5, 0.05], 0.06);
  box(g, [0.5, 0.06, 0.4], MAT.fabric('#5a7a3a'), [0.1, 0.32, 0.05], [0, 0.4, 0], 0.03); // plaid
}

function lantern(g: THREE.Group, f: FurnitureDef) {
  // lanterne sur un petit tabouret ; vraie source de lumière (réservoir de lampes de la villa)
  cyl(g, 0.2, 0.2, 0.05, MAT.wood('#6a4a2a'), [0, 0.42, 0], [0, 0, 0], 12);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    cyl(g, 0.02, 0.02, 0.42, MAT.wood('#5a3a22'), [Math.cos(a) * 0.14, 0.21, Math.sin(a) * 0.14], [0, 0, 0], 6);
  }
  box(g, [0.18, 0.04, 0.18], M.iron(), [0, 0.47, 0]);
  box(g, [0.14, 0.22, 0.14], MAT.glow('#ffb860', 1.6), [0, 0.6, 0]);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) box(g, [0.015, 0.24, 0.015], M.iron(), [x * 0.08, 0.6, z * 0.08]);
  cyl(g, 0.02, 0.11, 0.08, M.iron(), [0, 0.75, 0], [0, 0, 0], 4);
  torus(g, 0.04, 0.008, M.iron(), [0, 0.82, 0], [0, 0, 0]);
  const light = new THREE.Object3D();
  light.position.set(0, 0.7, 0);
  light.userData.light = { color: '#ffa850', intensity: 5, distance: 6, decay: 1.6, room: f.roomId, level: levelOf(f.x) };
  g.add(light);
}

function post(g: THREE.Group) {
  g.rotation.set(0, 0, 0);
  const wood = MAT.wood('#5a3a22');
  box(g, [0.2, LEVEL_HEIGHT - 0.2, 0.2], wood, [0, (LEVEL_HEIGHT - 0.2) / 2, 0]);
  box(g, [0.34, 0.1, 0.34], MAT.paint('#6a6058', 0.9), [0, 0.05, 0]);
}

function shed(g: THREE.Group, W: number, D: number) {
  const plank = MAT.wood('#5a4a32');
  box(g, [W - 0.1, 2.0, D - 0.1], plank, [0, 1.0, 0]);
  box(g, [0.8, 1.8, 0.03], MAT.wood('#4a3a24'), [0, 0.9, D / 2 - 0.03]);
  sphere(g, 0.03, M.iron(), [0.3, 0.95, D / 2]);
  for (const s of [-1, 1]) box(g, [W + 0.2, 0.06, D / 2 + 0.3], MAT.paint('#2a2a2c', 0.8), [0, 2.25, s * (D / 4 + 0.05)], [s * 0.45, 0, 0]);
  box(g, [0.5, 0.4, 0.03], MAT.glass(), [-W / 4, 1.4, D / 2 - 0.04]);
}

function swing(g: THREE.Group, W: number) {
  g.rotation.set(0, 0, 0);
  const wood = MAT.wood('#6a4a2a');
  for (const s of [-1, 1]) {
    box(g, [0.1, 2.3, 0.1], wood, [s * (W / 2 - 0.15), 1.1, -0.3], [0.25, 0, 0]);
    box(g, [0.1, 2.3, 0.1], wood, [s * (W / 2 - 0.15), 1.1, 0.3], [-0.25, 0, 0]);
  }
  box(g, [W - 0.1, 0.1, 0.1], wood, [0, 2.2, 0]);
  for (const x of [-0.5, 0.5]) {
    for (const s of [-1, 1]) cyl(g, 0.01, 0.01, 1.7, MAT.paint('#b89a6a', 0.9), [x + s * 0.2, 1.35, 0], [0, 0, 0], 4);
    box(g, [0.5, 0.04, 0.22], MAT.wood('#8a6440'), [x, 0.5, 0]);
  }
}

function planter(g: THREE.Group, W: number) {
  const L = W - 0.1;
  box(g, [L, 0.35, 0.85], MAT.wood('#6a4a2a'), [0, 0.175, 0]);
  box(g, [L - 0.08, 0.02, 0.77], MAT.paint('#2a1e14', 1), [0, 0.34, 0]);
  for (let i = 0; i < Math.floor(L / 0.3); i++) for (const z of [-0.2, 0.2]) ico(g, 0.12, leaf(i), [-L / 2 + 0.2 + i * 0.3, 0.42, z], [1, 0.7, 1]);
}

function barbecue(g: THREE.Group) {
  const black = MAT.paint('#1a1a1a', 0.5);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    cyl(g, 0.015, 0.015, 0.75, black, [Math.cos(a) * 0.2, 0.37, Math.sin(a) * 0.2], [Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25], 6);
  }
  sphere(g, 0.3, black, [0, 0.82, 0], [1, 0.6, 1]);
  cyl(g, 0.3, 0.3, 0.01, M.chrome(), [0, 0.86, 0], [0, 0, 0], 16);
  box(g, [0.1, 0.06, 0.03], M.chrome(), [0, 0.9, 0.3]);
}

function bins(g: THREE.Group, W: number) {
  const colors = [MAT.paint('#2a4a2a', 0.6), MAT.paint('#e0b040', 0.6)];
  for (let i = 0; i < 2; i++) {
    const x = -W / 4 + (i * W) / 2;
    box(g, [0.6, 1.0, 0.65], colors[i], [x, 0.5, 0], [0, 0, 0], 0.03);
    box(g, [0.64, 0.06, 0.7], colors[i], [x, 1.02, -0.02], [-0.05, 0, 0], 0.02);
    for (const s of [-1, 1]) cyl(g, 0.08, 0.08, 0.05, MAT.paint('#111111', 0.6), [x + s * 0.25, 0.08, -0.3], [0, 0, Math.PI / 2], 10);
  }
}

function mailbox(g: THREE.Group) {
  cyl(g, 0.04, 0.05, 1.1, M.dark(), [0, 0.55, 0], [0, 0, 0], 8);
  box(g, [0.24, 0.26, 0.42], MAT.lacquer('#8a2a22'), [0, 1.2, 0], [0, 0, 0], 0.04);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.42, 14, 1, false, -Math.PI / 2, Math.PI), MAT.lacquer('#8a2a22'));
  top.rotation.x = Math.PI / 2;
  top.position.set(0, 1.33, 0);
  top.castShadow = true;
  g.add(top);
  box(g, [0.02, 0.12, 0.04], MAT.paint('#e8c34a', 0.5), [0.13, 1.35, -0.1]);
}

function dollhouse(g: THREE.Group, D: number) {
  const back = -D / 2;
  box(g, [0.7, 0.55, 0.4], MAT.wood('#5a3a22'), [0, 0.275, back + 0.22]);
  box(g, [0.6, 0.55, 0.32], MAT.paint('#e8d0b0', 0.7), [0, 0.83, back + 0.22]);
  for (const s of [-1, 1]) box(g, [0.36, 0.03, 0.36], MAT.paint('#8a3a2a', 0.7), [s * 0.15, 1.2, back + 0.22], [0, 0, s * -0.6]);
  for (const [x, y] of [[-0.15, 0.75], [0.15, 0.75], [-0.15, 0.95], [0.15, 0.95]] as const) box(g, [0.1, 0.1, 0.01], MAT.glow('#ffd9a0', 0.4), [x, y, back + 0.385]);
  box(g, [0.1, 0.16, 0.01], MAT.paint('#3a2416', 0.7), [0, 0.64, back + 0.385]);
  // petite poupée assise devant (yeux fixes)
  sphere(g, 0.05, MAT.paint('#f0d8c0', 0.6), [0.22, 0.65, back + 0.5]);
  box(g, [0.09, 0.1, 0.06], MAT.fabric('#7a2434'), [0.22, 0.57, back + 0.5], [0, 0, 0], 0.02);
}

function chestPadlock(g: THREE.Group, D: number) {
  // cadenas sur l'auberon de la malle fermée à clé
  const z = -D / 2 + Math.min(D, 0.5) + 0.06;
  box(g, [0.07, 0.06, 0.025], MAT.metal('#b8913e', 0.3), [0, 0.38, z]);
  torus(g, 0.022, 0.006, M.iron(), [0, 0.42, z], [0, 0, 0], Math.PI);
}

export function buildFurnishing(f: FurnitureDef, g: THREE.Group, W: number, D: number): void {
  const r = rng(f.id);
  switch (f.kind) {
    case 'railing':
      return railing(g, f);
    case 'armchair':
      return armchair(g, f, W, D);
    case 'chair':
      return chair(g, f);
    case 'bookcase':
      return bookcase(g, f, W, D, r);
    case 'plant':
      return plant(g, f, r);
    case 'floor_lamp':
      return floorLamp(g, D);
    case 'sideboard':
      return sideboard(g, f, W, D, r);
    case 'nightstand':
      return nightstand(g, D, r);
    case 'dresser':
      return dresser(g, f, W, D, r);
    case 'fridge':
      return fridge(g, D);
    case 'stove':
      return stove(g, D);
    case 'toilet':
      return toilet(g, D);
    case 'washbasin':
      return washbasin(g, D, r);
    case 'tv':
      return tv(g, D, r);
    case 'workbench':
      return workbench(g, f, W, D, r);
    case 'barrel':
      return barrel(g, f, r);
    case 'bench':
      return bench(g, f, W, D);
    case 'coat_rack':
      return coatRack(g);
    case 'easel':
      return easel(g, r);
    case 'globe':
      return globe(g);
    case 'harp':
      return harp(g);
    case 'chest':
      chest(g, f, W, D);
      if (f.lock) chestPadlock(g, D);
      return;
    case 'washing_machine':
      return washer(g, D, false);
    case 'dryer':
      return washer(g, D, true);
    case 'ironing_board':
      return ironingBoard(g, W);
    case 'laundry_basket':
      return laundryBasket(g);
    case 'drying_rack':
      return dryingRack(g, W);
    case 'billiard':
      return billiard(g, W, D);
    case 'cue_rack':
      return cueRack(g, D);
    case 'games_shelf':
      return gamesShelf(g, W, D, r);
    case 'darts':
      return darts(g, D);
    case 'jukebox':
      return jukebox(g, D);
    case 'arcade':
      return arcade(g, D);
    case 'safe':
      return safe(g, D);
    case 'filing_cabinet':
      return filingCabinet(g, D);
    case 'boiler':
      return boiler(g, W, D);
    case 'water_heater':
      return waterHeater(g, D);
    case 'wine_rack':
      return wineRack(g, W, D);
    case 'boxes':
      return boxes(g, W, D, r);
    case 'mannequin':
      return mannequin(g);
    case 'rocking_horse':
      return rockingHorse(g);
    case 'toolbox':
      return toolbox(g, D);
    case 'freezer':
      return freezer(g, W, D);
    case 'bicycle':
      return bicycle(g, f);
    case 'umbrella_stand':
      return umbrellaStand(g);
    case 'cushions':
      return cushions(g, W, D);
    case 'lantern':
      return lantern(g, f);
    case 'post':
      return post(g);
    case 'shed':
      return shed(g, W, D);
    case 'swing':
      return swing(g, W);
    case 'planter':
      return planter(g, W);
    case 'barbecue':
      return barbecue(g);
    case 'bins':
      return bins(g, W);
    case 'mailbox':
      return mailbox(g);
    case 'dollhouse':
      return dollhouse(g, D);
    default:
      // type inconnu : simple caisson pour ne jamais laisser une emprise invisible
      box(g, [W * 0.9, 0.8, D * 0.9], M.wood(), [0, 0.4, 0]);
  }
}
