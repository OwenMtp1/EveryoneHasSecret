/**
 * Personnage 3D procédural, construit uniquement à partir des données (teinte, coiffure, tenue).
 * Unités : mètres. Le personnage regarde vers +z. Pieds en y = 0.
 * Aucun modèle externe : chaque coiffure/tenue est une combinaison de primitives décrites en données.
 */
import * as THREE from 'three';
import type { Character, GestureKind } from '@shared/types';
import { findHairColor, findHairStyle, findOutfit, findSkinTone, type HairPart3D, type Outfit } from '@shared/content/character';
import { buildRealistic } from './realistic';
import type { PoseFn } from './gestures';
import { buildCastCharacter } from './cast3d';
import { castById } from '@shared/content/cast';

const geoCache = new Map<string, THREE.BufferGeometry>();
function geo(key: string, make: () => THREE.BufferGeometry) {
  let g = geoCache.get(key);
  if (!g) geoCache.set(key, (g = make()));
  return g;
}
const sphereGeo = () => geo('sphere', () => new THREE.SphereGeometry(1, 24, 16));
const capGeo = () => geo('cap', () => new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.6));
const boxGeo = () => geo('box', () => new THREE.BoxGeometry(1, 1, 1));
const capsuleGeo = (r: number, len: number) => geo(`caps${r}|${len}`, () => new THREE.CapsuleGeometry(r, len, 6, 14));
const cylGeo = (rt: number, rb: number, h: number) => geo(`cyl${rt}|${rb}|${h}`, () => new THREE.CylinderGeometry(rt, rb, h, 20));

function patternTexture(o: Outfit): THREE.Texture | null {
  const p = o.top.pattern;
  if (!p || p === 'none') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = o.top.color;
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = o.top.patternColor ?? o.top.accent;
  if (p === 'stripes') for (let y = 0; y < 64; y += 16) ctx.fillRect(0, y, 64, 6);
  if (p === 'checks') {
    ctx.globalAlpha = 0.45;
    for (let i = 0; i < 64; i += 32) {
      ctx.fillRect(i, 0, 14, 64);
      ctx.fillRect(0, i, 64, 14);
    }
  }
  if (p === 'dots')
    for (let y = 8; y < 64; y += 16) for (let x = (y / 16) % 2 ? 0 : 8; x < 64; x += 16) {
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 2);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface Character3D {
  root: THREE.Group;
  head: THREE.Object3D;
  /** anime : dt (s), vitesse horizontale (m/s) */
  update(dt: number, speed: number): void;
  setVisibleBody(v: boolean): void;
  /** animated : la chute est jouée (le joueur était visible au moment de la mort) */
  setDead(dead: boolean, animated?: boolean): void;
  gesture(kind: GestureKind): void;
  /** pose continue superposée (cinématique : assis, discute, rit…) ; null pour revenir à la normale */
  setPose(fn: PoseFn | null): void;
  dispose(): void;
}

/**
 * Personnage du catalogue (castId) : son modèle 3D, chargé à la demande (repli affiché en attendant).
 * Sinon : personnage réaliste si les modèles sont chargés, ou modèle procédural (repli).
 */
export function buildCharacter(c: Character): Character3D {
  if (c.castId && castById(c.castId)) return buildCastCharacter(c, buildGeneric);
  return buildGeneric(c);
}

function buildGeneric(c: Character): Character3D {
  const r = buildRealistic(c);
  if (!r) return buildProcedural(c);
  return {
    root: r.root,
    head: r.head,
    update: r.update,
    setVisibleBody: r.setVisible,
    setDead: (d, animated) => d && r.setDead(!!animated),
    gesture: r.gesture,
    setPose: r.setPose,
    dispose: r.dispose,
  };
}

/**
 * Coiffure du créateur (données `parts3d`), dans le repère d'une tête centrée en 0 de rayon ~0,13 m.
 * Utilisée par le personnage procédural et posée sur la tête des modèles réalistes.
 */
export function buildHair(c: Character): THREE.Group {
  const g = new THREE.Group();
  const color = findHairColor(c.hairColor).color;
  const hairMat = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05 });
  const shade = new THREE.MeshStandardMaterial({ color, roughness: 0.8, transparent: true, opacity: 0.5 });
  for (const part of findHairStyle(c.hairStyleId).parts3d as HairPart3D[]) {
    const geo = part.kind === 'cap' ? capGeo() : part.kind === 'sphere' ? sphereGeo() : part.kind === 'box' ? boxGeo() : capsuleGeo(1, 1);
    const m = new THREE.Mesh(geo, part.shade ? shade : hairMat);
    m.position.set(...part.p);
    if (part.kind === 'capsule') m.scale.set(part.s[0], part.s[1] / 3, part.s[2]);
    else m.scale.set(...part.s);
    m.rotation.set(...(part.r ?? (part.kind === 'cap' ? [-0.42, 0, 0] : [0, 0, 0])));
    m.castShadow = true;
    g.add(m);
  }
  return g;
}

export function buildProcedural(c: Character): Character3D {
  const fem = c.appearance === 'feminine';
  const skinColor = findSkinTone(c.skinTone).color;
  const hairColor = findHairColor(c.hairColor).color;
  const outfit = findOutfit(c.outfitId);
  const top = outfit.top;
  const materials: THREE.MeshStandardMaterial[] = [];
  const mat = (color: string, opts: THREE.MeshStandardMaterialParameters = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0.02, ...opts });
    materials.push(m);
    return m;
  };
  const skin = mat(skinColor, { roughness: 0.6 });
  const topMat = mat(top.color, { map: patternTexture(outfit) ?? undefined });
  if (topMat.map) topMat.color.set('#ffffff');
  const accent = mat(top.accent);
  const bottom = mat(outfit.bottom.color);
  const shoes = mat(outfit.shoes, { roughness: 0.45 });
  const hair = mat(hairColor, { roughness: 0.9 });
  const detail = mat(outfit.detailColor ?? top.accent);
  const dark = mat('#141210', { roughness: 0.3 });

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const add = (parent: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, p: [number, number, number], s: [number, number, number] = [1, 1, 1], r: [number, number, number] = [0, 0, 0]) => {
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(...p);
    mesh.scale.set(...s);
    mesh.rotation.set(...r);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };

  const shoulderW = fem ? 0.21 : 0.24;
  const hipY = 0.9;
  const longTop = top.style === 'gown';
  const dress = top.style === 'dress';
  const coat = top.style === 'coat';
  const bareLegs = outfit.bottom.style === 'shorts' || outfit.bottom.style === 'skirt' || dress;

  // ── Jambes (pivot à la hanche) ──
  const legs: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.095, hipY, 0);
    body.add(leg);
    legs.push(leg);
    const legMat = bareLegs ? skin : bottom;
    add(leg, capsuleGeo(0.075, 0.72), legMat, [0, -0.44, 0]);
    if (outfit.bottom.style === 'shorts' && !dress) add(leg, cylGeo(0.095, 0.1, 0.3), bottom, [0, -0.13, 0]);
    if (outfit.bottom.style === 'joggers') add(leg, cylGeo(0.082, 0.082, 0.06), mat(new THREE.Color(outfit.bottom.color).multiplyScalar(0.7).getStyle()), [0, -0.78, 0]);
    add(leg, boxGeo(), shoes, [0, -0.86, 0.04], [0.11, 0.08, 0.24]);
  }
  if (outfit.bottom.style === 'skirt' && !dress && !longTop) add(body, cylGeo(0.2, 0.27, 0.36), bottom, [0, hipY - 0.12, 0]);

  // ── Torse ──
  const torsoTopW = shoulderW;
  const waistW = fem ? 0.16 : 0.2;
  add(body, cylGeo(torsoTopW, waistW, 0.56), topMat, [0, 1.2, 0], [1, 1, 0.62]);
  add(body, sphereGeo(), topMat, [0, 1.47, 0], [torsoTopW, 0.07, torsoTopW * 0.62]);
  add(body, cylGeo(waistW, waistW + 0.01, 0.12), outfit.bottom.style === 'skirt' || dress || longTop ? topMat : bottom, [0, 0.9, 0], [1, 1, 0.66]);
  if (dress) add(body, cylGeo(0.17, 0.3, 0.45), topMat, [0, 0.72, 0], [1, 1, 0.8]);
  if (longTop) add(body, cylGeo(0.17, 0.34, 0.88), topMat, [0, 0.48, 0], [1, 1, 0.82]);
  if (coat) add(body, cylGeo(0.215, 0.26, 0.5), topMat, [0, 0.72, 0], [1, 1, 0.7]);

  // Détails de tenue (face avant = +z)
  const front = (torsoTopW * 0.62) + 0.005;
  if (top.style === 'blazer') {
    add(body, boxGeo(), accent, [0, 1.36, front - 0.01], [0.09, 0.22, 0.02]);
    if (outfit.detail === 'vest') add(body, boxGeo(), detail, [0, 1.2, front - 0.02], [0.2, 0.3, 0.02]);
    for (const s of [-1, 1]) add(body, boxGeo(), mat(new THREE.Color(top.color).multiplyScalar(0.75).getStyle()), [s * 0.07, 1.33, front], [0.05, 0.26, 0.02], [0, 0, s * 0.35]);
  }
  if (top.style === 'shirt' || top.style === 'polo') for (const y of [1.36, 1.26, 1.16, 1.06]) add(body, sphereGeo(), accent, [0, y, front], [0.012, 0.012, 0.012]);
  if (top.style === 'hoodie') {
    add(body, cylGeo(0.13, 0.17, 0.1), accent, [0, 1.5, -0.03], [1, 1, 0.8]);
    add(body, boxGeo(), accent, [0, 1.0, front - 0.02], [0.24, 0.12, 0.03]);
  }
  if (top.style === 'turtleneck') add(body, cylGeo(0.075, 0.08, 0.1), accent, [0, 1.55, 0]);
  if (top.style === 'sweater') add(body, cylGeo(waistW + 0.012, waistW + 0.012, 0.05), accent, [0, 0.95, 0], [1, 1, 0.66]);
  if (outfit.detail === 'tie') add(body, boxGeo(), detail, [0, 1.3, front + 0.005], [0.045, 0.3, 0.012]);
  if (outfit.detail === 'bowtie') add(body, boxGeo(), detail, [0, 1.48, front + 0.01], [0.1, 0.035, 0.02]);
  if (outfit.detail === 'logo') add(body, boxGeo(), detail, [0.08, 1.32, front + 0.004], [0.06, 0.06, 0.01], [0, 0, Math.PI / 4]);
  if (outfit.detail === 'zip') add(body, boxGeo(), detail, [0, 1.2, front + 0.004], [0.012, 0.52, 0.01]);
  if (outfit.detail === 'belt') add(body, cylGeo(waistW + 0.015, waistW + 0.015, 0.045), detail, [0, dress ? 1.0 : 0.93, 0], [1, 1, 0.68]);
  if (outfit.detail === 'scarf') add(body, new THREE.TorusGeometry(0.085, 0.03, 8, 20), detail, [0, 1.52, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);

  // ── Bras (pivot à l'épaule) ──
  const sleeve = top.style === 'tank' ? 'none' : top.style === 'tee' || top.style === 'polo' || dress || longTop ? 'short' : 'long';
  const arms: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * (torsoTopW + 0.045), 1.44, 0);
    body.add(arm);
    arms.push(arm);
    add(arm, capsuleGeo(0.05, 0.5), sleeve === 'long' ? topMat : skin, [0, -0.29, 0]);
    if (sleeve === 'short') add(arm, capsuleGeo(0.058, 0.14), topMat, [0, -0.1, 0]);
    add(arm, sphereGeo(), skin, [0, -0.6, 0], [0.055, 0.06, 0.055]);
  }

  // ── Cou & tête ──
  add(body, cylGeo(0.05, 0.055, 0.12), skin, [0, 1.55, 0]);
  const head = new THREE.Group();
  head.position.set(0, 1.71, 0);
  body.add(head);
  add(head, sphereGeo(), skin, [0, 0, 0], [0.125, 0.145, 0.135]);
  for (const s of [-1, 1]) {
    add(head, sphereGeo(), dark, [s * 0.042, 0.015, 0.118], [0.017, 0.022, 0.012]);
    add(head, boxGeo(), hair, [s * 0.045, 0.055, 0.122], [0.05, fem ? 0.008 : 0.013, 0.01], [0, 0, s * -0.12]);
    add(head, sphereGeo(), skin, [s * 0.126, 0, 0], [0.02, 0.035, 0.025]);
  }
  add(head, sphereGeo(), skin, [0, -0.02, 0.135], [0.018, 0.026, 0.02]);
  add(head, boxGeo(), mat(fem ? '#8c3a42' : new THREE.Color(skinColor).multiplyScalar(0.55).getStyle()), [0, -0.07, 0.122], [0.05, fem ? 0.014 : 0.009, 0.01]);

  // Cheveux (data-driven)
  const shadeMat = mat(hairColor, { transparent: true, opacity: 0.5 });
  for (const part of findHairStyle(c.hairStyleId).parts3d as HairPart3D[]) {
    const m = part.shade ? shadeMat : hair;
    const g = part.kind === 'cap' ? capGeo() : part.kind === 'sphere' ? sphereGeo() : part.kind === 'box' ? boxGeo() : capsuleGeo(1, 1);
    const scale: [number, number, number] = part.kind === 'capsule' ? [part.s[0], part.s[1] / 3, part.s[2]] : part.s;
    // Calottes inclinées vers l'arrière : dégagent le front, couvrent la nuque
    add(head, g, m, part.p, scale, part.r ?? (part.kind === 'cap' ? [-0.42, 0, 0] : [0, 0, 0]));
  }

  // Ombre portée simple
  const blob = new THREE.Mesh(
    geo('blob', () => new THREE.CircleGeometry(0.32, 24)),
    new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.35, depthWrite: false }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.01;
  root.add(blob);

  let phase = Math.random() * 10;
  let walkBlend = 0;
  let gestureT = 1;
  let held: PoseFn | null = null;
  let heldT = 0;
  return {
    root,
    head,
    update(dt, speed) {
      phase += dt;
      const target = Math.min(1, speed / 3);
      walkBlend += (target - walkBlend) * Math.min(1, dt * 10);
      const w = phase * 9;
      const swing = Math.sin(w) * 0.65 * walkBlend;
      legs[0].rotation.x = swing;
      legs[1].rotation.x = -swing;
      arms[0].rotation.x = -swing * 0.8;
      arms[1].rotation.x = swing * 0.8;
      const idle = Math.sin(phase * 2.1) * (1 - walkBlend);
      arms[0].rotation.z = -0.06 - idle * 0.02;
      arms[1].rotation.z = 0.06 + idle * 0.02;
      body.position.y = Math.abs(Math.sin(w)) * 0.035 * walkBlend + idle * 0.004;
      head.rotation.y = Math.sin(phase * 0.6) * 0.08 * (1 - walkBlend);
      if (gestureT < 1) {
        gestureT = Math.min(1, gestureT + dt / 1.2);
        const e = Math.sin(Math.PI * gestureT);
        body.rotation.x = 0.35 * e;
        arms[1].rotation.x = -1.1 * e;
      }
      if (held) {
        // version simplifiée : cuisses et bras seulement (pas de genoux sur le modèle de repli)
        heldT += dt;
        const p = held(heldT);
        legs[0].rotation.x = p.LeftUpLeg?.bend ?? legs[0].rotation.x;
        legs[1].rotation.x = p.RightUpLeg?.bend ?? legs[1].rotation.x;
        arms[0].rotation.x = p.LeftArm?.bend ?? arms[0].rotation.x;
        arms[1].rotation.x = p.RightArm?.bend ?? arms[1].rotation.x;
        body.rotation.x = p.Spine?.bend ?? 0;
        head.rotation.y = p.Head?.side ?? head.rotation.y;
      }
    },
    gesture() {
      gestureT = 0;
    },
    setPose(fn) {
      held = fn;
      heldT = 0;
    },
    setVisibleBody(v) {
      body.visible = v;
      blob.visible = v;
    },
    setDead(deadNow) {
      if (deadNow) {
        body.rotation.x = -Math.PI / 2;
        body.position.set(0, 0.16, 0.85);
        for (const m of materials) {
          m.color.lerp(new THREE.Color('#7a7a7a'), 0.55);
        }
      }
    },
    dispose() {
      for (const m of materials) {
        m.map?.dispose();
        m.dispose();
      }
    },
  };
}
