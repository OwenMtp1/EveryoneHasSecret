/**
 * Véhicule de la cinématique, construit depuis sa définition (gabarit, places, couleur).
 * Habitacle ouvert (caisse creuse + vitrage transparent) pour que la caméra puisse filmer à l'intérieur.
 * Un modèle glTF pourra remplacer ce gabarit via `assets.model` le jour où il existe.
 */
import * as THREE from 'three';
import type { VehicleDefinition } from '@shared/content/vehicles';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { MAT } from '../../three/materials';

/** Silhouette par type de carrosserie (z : avant > 0). */
const SHAPES = {
  sedan: { belt: 0.95, floor: 0.16, cabinFront: 1.1, roofFront: 0.35, roofBack: -1.2, rearBase: -1.65, hoodY: 0.92, trunkY: 0.95, wheelR: 0.34, wheelInset: 0.85 },
  van: { belt: 1.12, floor: 0.2, cabinFront: 2.25, roofFront: 1.8, roofBack: -2.85, rearBase: -2.9, hoodY: 1.08, trunkY: 1.12, wheelR: 0.38, wheelInset: 0.95 },
} as const;

export interface IntroVehicle {
  group: THREE.Group;
  /** à appeler à chaque image : roues, phares */
  update(dt: number, speed: number): void;
  dispose(): void;
}

function box(parent: THREE.Object3D, size: [number, number, number], mat: THREE.Material, pos: [number, number, number], rotX = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
  m.position.set(...pos);
  m.rotation.x = rotX;
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/** Garniture capitonnée (arêtes arrondies). */
function cushion(parent: THREE.Object3D, size: [number, number, number], mat: THREE.Material, pos: [number, number, number], rotX = 0) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(size[0], size[1], size[2], 3, Math.min(0.05, size[1] / 2.2, size[2] / 2.2)), mat);
  m.position.set(...pos);
  m.rotation.x = rotX;
  parent.add(m);
  return m;
}

/** Panneau incliné entre deux points (y, z), sur toute la largeur. */
function slope(parent: THREE.Object3D, w: number, a: [number, number], b: [number, number], mat: THREE.Material, thick = 0.03) {
  const dy = b[0] - a[0];
  const dz = b[1] - a[1];
  const len = Math.hypot(dy, dz);
  const m = box(parent, [w, thick, len], mat, [0, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
  m.rotation.x = -Math.atan2(dy, dz);
  return m;
}

export function buildIntroVehicle(def: VehicleDefinition): IntroVehicle {
  const { length: L, width: W, height: H, color, roof } = def.assets.body;
  const S = SHAPES[roof];
  const g = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ color, roughness: 0.32, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.08, side: THREE.DoubleSide });
  const trim = MAT.paint('#0d0d0f', 0.6);
  const interior = MAT.paint('#1d1b1a', 0.9);
  const leather = new THREE.MeshStandardMaterial({ color: '#5a4436', roughness: 0.5 });
  const glass = new THREE.MeshPhysicalMaterial({ color: '#9fb4c8', roughness: 0.05, metalness: 0, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false });
  const front = L / 2;
  const back = -L / 2;
  const half = W / 2;

  // ── Caisse : capot et coffre pleins, habitacle creux (plancher + flancs) ──
  box(g, [W, S.hoodY - 0.3, front - S.cabinFront], paint, [0, 0.3 + (S.hoodY - 0.3) / 2, (front + S.cabinFront) / 2]);
  if (S.rearBase - back > 0.2) box(g, [W, S.trunkY - 0.3, S.rearBase - back], paint, [0, 0.3 + (S.trunkY - 0.3) / 2, (S.rearBase + back) / 2]);
  const cabinLen = S.cabinFront - Math.max(back, S.rearBase);
  const cabinMid = (S.cabinFront + Math.max(back, S.rearBase)) / 2;
  box(g, [W, 0.12, cabinLen], paint, [0, 0.24, cabinMid]); // bas de caisse
  box(g, [W - 0.1, 0.02, cabinLen], interior, [0, S.floor + 0.14, cabinMid]); // plancher
  for (const sx of [-1, 1]) box(g, [0.06, S.belt - 0.3, cabinLen], paint, [sx * (half - 0.03), 0.3 + (S.belt - 0.3) / 2, cabinMid]);
  if (S.rearBase - back <= 0.2) box(g, [W, S.belt - 0.3, 0.06], paint, [0, 0.3 + (S.belt - 0.3) / 2, back + 0.03]);
  // pare-chocs
  box(g, [W + 0.04, 0.22, 0.12], trim, [0, 0.38, front + 0.02]);
  box(g, [W + 0.04, 0.22, 0.12], trim, [0, 0.38, back - 0.02]);

  // ── Pavillon, montants, vitrage ──
  const roofBack = Math.max(S.roofBack, back + 0.05);
  box(g, [W - 0.08, 0.06, S.roofFront - roofBack], paint, [0, H, (S.roofFront + roofBack) / 2]);
  slope(g, W - 0.12, [S.belt, S.cabinFront], [H, S.roofFront], glass, 0.01); // pare-brise
  if (roof === 'sedan') slope(g, W - 0.12, [H, roofBack], [S.trunkY, S.rearBase], glass, 0.01); // lunette
  else box(g, [W - 0.12, H - S.belt, 0.01], glass, [0, (H + S.belt) / 2, back + 0.03]);
  for (const sx of [-1, 1]) {
    // vitres latérales
    const side = new THREE.Mesh(new THREE.PlaneGeometry(S.roofFront - roofBack + 0.2, H - S.belt), glass);
    side.rotation.y = Math.PI / 2;
    side.position.set(sx * (half - 0.04), (H + S.belt) / 2, (S.roofFront + roofBack) / 2);
    g.add(side);
    // montants A et C (+ B/D sur le minibus)
    slope(g, 0.07, [S.belt, S.cabinFront], [H, S.roofFront], trim, 0.07).position.x = sx * (half - 0.06);
    const pillars = roof === 'van' ? [0.95, -0.15, -1.2, -2.25] : [-0.45];
    for (const z of pillars) box(g, [0.06, H - S.belt, 0.08], trim, [sx * (half - 0.05), (H + S.belt) / 2, z]);
    if (roof === 'sedan') slope(g, 0.07, [H, roofBack], [S.trunkY, S.rearBase], trim, 0.07).position.x = sx * (half - 0.06);
    else box(g, [0.06, H - S.belt, 0.08], trim, [sx * (half - 0.05), (H + S.belt) / 2, back + 0.05]);
    // rétroviseur
    box(g, [0.18, 0.12, 0.1], paint, [sx * (half + 0.08), S.belt + 0.12, S.cabinFront - 0.15]);
  }

  // ── Intérieur : sièges, planche de bord, volant, plafonnier ──
  for (const seat of def.seats) {
    const [x, y, z] = seat.position;
    cushion(g, [0.5, 0.14, 0.5], leather, [x, y - 0.08, z + 0.12]);
    cushion(g, [0.48, 0.58, 0.14], leather, [x, y + 0.24, z - 0.18], -0.12);
    cushion(g, [0.24, 0.16, 0.1], leather, [x, y + 0.64, z - 0.23]);
    if (seat.type === 'driver') {
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.022, 10, 28), trim);
      wheel.position.set(x, y + 0.42, z + 0.55);
      wheel.rotation.x = -0.35;
      g.add(wheel);
      box(g, [0.05, 0.05, 0.3], trim, [x, y + 0.32, z + 0.72], -0.5);
    }
  }
  const dashZ = S.cabinFront - 0.18;
  box(g, [W - 0.14, 0.24, 0.36], interior, [0, S.belt - 0.05, dashZ]);
  box(g, [0.3, 0.08, 0.02], MAT.glow('#58c8ff', 0.6), [0, S.belt + 0.02, dashZ - 0.17]);
  const dome = new THREE.PointLight('#ffd7a8', 3, 3.4, 1.6);
  dome.position.set(0, H - 0.1, (S.roofFront + roofBack) / 2);
  g.add(dome);
  // lueur bleutée de l'écran de bord sur les visages
  const dashGlow = new THREE.PointLight('#7fb8ff', 0.5, 1.6, 2);
  dashGlow.position.set(0, S.belt + 0.1, dashZ - 0.3);
  g.add(dashGlow);

  // ── Roues ──
  const wheels: THREE.Object3D[] = [];
  const tyre = MAT.paint('#111', 0.85);
  const rim = MAT.metal('#c9cbd0', 0.25);
  for (const sz of [1, -1])
    for (const sx of [-1, 1]) {
      const w = new THREE.Group();
      w.position.set(sx * (half - 0.08), S.wheelR, sz * (L / 2 - S.wheelInset));
      const t = new THREE.Mesh(new THREE.CylinderGeometry(S.wheelR, S.wheelR, 0.24, 20), tyre);
      t.rotation.z = Math.PI / 2;
      const r = new THREE.Mesh(new THREE.CylinderGeometry(S.wheelR * 0.6, S.wheelR * 0.6, 0.25, 10), rim);
      r.rotation.z = Math.PI / 2;
      w.add(t, r);
      g.add(w);
      wheels.push(w);
    }

  // ── Phares (vrais projecteurs sur la route) et feux arrière ──
  const head = MAT.glow('#fff4dc', 3);
  const tail = MAT.glow('#ff2a1a', 2);
  for (const sx of [-1, 1]) {
    box(g, [0.34, 0.12, 0.04], head, [sx * (half - 0.3), S.hoodY - 0.16, front + 0.01]);
    box(g, [0.3, 0.1, 0.04], tail, [sx * (half - 0.25), S.trunkY - 0.15, back - 0.01]);
  }
  // un seul projecteur pour les deux phares (même rendu, moitié moins coûteux)
  const spot = new THREE.SpotLight('#fff1d6', 90, 45, 0.5, 0.5, 1.4);
  spot.position.set(0, S.hoodY - 0.16, front + 0.1);
  spot.target.position.set(0, 0, front + 18);
  g.add(spot, spot.target);

  return {
    group: g,
    update(dt, speed) {
      for (const w of wheels) w.rotation.x += (speed * dt) / S.wheelR;
    },
    dispose() {
      g.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    },
  };
}

/** Hauteur des yeux d'un passager assis (pour placer la caméra intérieure). */
export function seatedEyeHeight(def: VehicleDefinition) {
  return def.seats[0].position[1] + 0.68;
}
