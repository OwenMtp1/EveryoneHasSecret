/**
 * Personnages du catalogue (CAST) : 40 modèles Rocketbox distincts (licence MIT), animations capturées
 * partagées par genre (même squelette Biped pour tous) — voir public/characters/README.md.
 *
 *  - chargement paresseux et mis en cache : un GLB par personnage + un fichier d'animations par genre ;
 *  - instances clonées (SkeletonUtils) : géométries, textures et matériaux partagés entre clones
 *    (un matériau n'est copié que pour griser un corps) ;
 *  - locomotion : marche lente / marche / course mélangées selon la vitesse, phase commune et cadence
 *    calée sur la vitesse réelle (vitesses des clips mesurées par le pipeline) → pas de pieds qui glissent ;
 *  - même interface que les autres personnages (Character3D) : gestes, pose continue, mort, vue subjective.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Appearance, Character, GestureKind } from '@shared/types';
import { castById, type CastMember } from '@shared/content/cast';
import { GesturePlayer, type Pose, type PoseFn, type Rig } from './gestures';
import type { Character3D } from './character3d';

/** Activités jouées avec les animations capturées (photos, cinématiques, attente). */
export type CastActivity = 'idle' | 'idle2' | 'talk' | 'listen' | 'point' | 'wave' | 'shrug' | 'laugh' | 'examine' | 'crouch' | 'search' | 'sit' | 'sit_talk';

const ANIMS_URL: Record<Appearance, string> = { feminine: '/characters/anims-f.glb', masculine: '/characters/anims-m.glb' };
const LOCOMOTION = ['walk_slow', 'walk', 'run'] as const;

interface AnimSet {
  clips: Map<string, THREE.AnimationClip>;
  /** vitesse (m/s) sans glissement à cadence 1, par clip de locomotion */
  speed: Record<string, number>;
  /** hauteur de la racine (Bip01) debout dans le squelette des animations */
  hipHeight: number;
  /** décalage de phase (0–1) de chaque cycle de locomotion : 0 = pied gauche le plus en avant */
  phase?: Record<string, number>;
}

interface CastBase {
  member: CastMember;
  scene: THREE.Group;
  /** hauteur du modèle source (m) */
  height: number;
  clips: Map<string, THREE.AnimationClip>;
  speed: Record<string, number>;
  /** rapport bassin de l'avatar / bassin du squelette des animations (la foulée suit la longueur des jambes) */
  stride: number;
  phase: Record<string, number>;
}

/**
 * Les cycles de locomotion ne commencent pas tous sur le même pied : on mesure (une fois par genre)
 * l'instant où le pied gauche est le plus en avant, pour les mélanger en phase.
 */
function measurePhases(scene: THREE.Object3D, clips: Map<string, THREE.AnimationClip>): Record<string, number> {
  const saved: [THREE.Object3D, THREE.Vector3, THREE.Quaternion][] = [];
  let left: THREE.Object3D | undefined;
  let right: THREE.Object3D | undefined;
  scene.traverse((o) => {
    saved.push([o, o.position.clone(), o.quaternion.clone()]);
    if (o.name === 'L_Foot') left = o;
    if (o.name === 'R_Foot') right = o;
  });
  const out: Record<string, number> = {};
  if (!left || !right) return out;
  const mixer = new THREE.AnimationMixer(scene);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  for (const name of LOCOMOTION) {
    const clip = clips.get(name);
    if (!clip) continue;
    const action = mixer.clipAction(clip);
    action.play();
    let best = -Infinity;
    const N = 48;
    for (let i = 0; i < N; i++) {
      mixer.setTime((i / N) * clip.duration);
      scene.updateMatrixWorld(true);
      left.getWorldPosition(a);
      right.getWorldPosition(b);
      // le personnage regarde vers +z : avance du pied gauche sur le droit
      if (a.z - b.z > best) {
        best = a.z - b.z;
        out[name] = i / N;
      }
    }
    action.stop();
    mixer.uncacheAction(clip);
  }
  mixer.uncacheRoot(scene);
  for (const [o, p, q] of saved) {
    o.position.copy(p);
    o.quaternion.copy(q);
  }
  scene.updateMatrixWorld(true);
  return out;
}

const loader = new GLTFLoader();
const animSets = new Map<Appearance, Promise<AnimSet>>();
const bases = new Map<string, CastBase>();
const pending = new Map<string, Promise<boolean>>();

function loadAnims(g: Appearance): Promise<AnimSet> {
  let p = animSets.get(g);
  if (!p) {
    p = loader.loadAsync(ANIMS_URL[g]).then((gltf) => {
      const extras = (gltf.parser.json.extras ?? {}) as { hipHeight?: number; clips?: Record<string, { speed?: number }> };
      const speed: Record<string, number> = {};
      for (const [k, v] of Object.entries(extras.clips ?? {})) if (v.speed) speed[k] = v.speed;
      return { clips: new Map(gltf.animations.map((a) => [a.name, a])), speed, hipHeight: extras.hipHeight ?? 0.92 };
    });
    animSets.set(g, p);
    p.catch(() => animSets.delete(g));
  }
  return p;
}

/** Le modèle du personnage est-il chargé (instanciable immédiatement) ? */
export function castReady(id: string | undefined): boolean {
  return !!id && bases.has(id);
}

/** Charge (une fois) le modèle d'un personnage et les animations de son genre. Résout false en cas d'échec. */
export function loadCast(id: string): Promise<boolean> {
  if (bases.has(id)) return Promise.resolve(true);
  const member = castById(id);
  if (!member) return Promise.resolve(false);
  let p = pending.get(id);
  if (p) return p;
  p = (async () => {
    try {
      const [gltf, anims] = await Promise.all([loader.loadAsync(member.model), loadAnims(member.gender)]);
      const scene = gltf.scene;
      let rootBone: THREE.Object3D | null = null;
      scene.traverse((o) => {
        if (o.name === 'Bip01') rootBone = o;
        const m = o as THREE.SkinnedMesh;
        if (!m.isMesh) return;
        m.castShadow = true;
        const mat = m.material as THREE.MeshStandardMaterial;
        if (mat.name === 'hair') {
          mat.alphaToCoverage = true; // bords des mèches adoucis avec le MSAA
          mat.side = THREE.DoubleSide;
        }
        // sphère englobante généreuse (le maillage animé sort de sa pose de repos : accroupi, bras levés…)
        m.geometry.computeBoundingSphere();
        m.boundingSphere = m.geometry.boundingSphere!.clone();
        m.boundingSphere.radius *= 1.35;
      });
      scene.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(scene);
      const hip = rootBone ? (rootBone as THREE.Object3D).position.y : anims.hipHeight;
      // la translation verticale de la racine suit la hauteur de bassin propre à l'avatar
      const k = hip / anims.hipHeight;
      const clips = new Map<string, THREE.AnimationClip>();
      for (const [name, clip] of anims.clips) {
        const c = clip.clone();
        for (const t of c.tracks) if (t.name === 'Bip01.position') for (let i = 0; i < t.values.length; i++) t.values[i] *= k;
        clips.set(name, c);
      }
      anims.phase ??= measurePhases(scene, clips);
      bases.set(id, { member, scene, height: Math.max(0.5, box.max.y - box.min.y), clips, speed: anims.speed, stride: k, phase: anims.phase });
      return true;
    } catch (e) {
      console.warn(`Personnage ${id} indisponible.`, e);
      return false;
    } finally {
      pending.delete(id);
    }
  })();
  pending.set(id, p);
  return p;
}

/** Précharge plusieurs personnages (ignore les identifiants vides ou inconnus). */
export async function preloadCast(ids: (string | undefined | null)[]): Promise<void> {
  await Promise.all([...new Set(ids.filter((i): i is string => !!i))].map((i) => loadCast(i)));
}

/** Correspondance os Biped → clés des gestes procéduraux (le premier « Spine » Biped porte les cuisses). */
function castRig(model: THREE.Object3D): Rig {
  const by = new Map<string, THREE.Bone>();
  model.traverse((o) => (o as THREE.Bone).isBone && by.set(o.name, o as THREE.Bone));
  const r = (n: string) => by.get(n);
  return {
    Hips: r('Hips'),
    Spine: r('Spine1'),
    Spine1: r('Spine2'),
    Spine2: r('Spine2'),
    Neck: r('Neck'),
    Head: r('Head'),
    RightArm: r('R_UpperArm'),
    RightForeArm: r('R_Forearm'),
    RightHand: r('R_Hand'),
    LeftArm: r('L_UpperArm'),
    LeftForeArm: r('L_Forearm'),
    LeftHand: r('L_Hand'),
    RightUpLeg: r('R_Thigh'),
    LeftUpLeg: r('L_Thigh'),
    RightLeg: r('R_Calf'),
    LeftLeg: r('L_Calf'),
  };
}

/** Gestes joués par des animations capturées (le reste : gestes procéduraux). */
const GESTURE_CLIPS: Partial<Record<GestureKind, { clip: string; duration: number; offset: number }>> = {
  take: { clip: 'crouch', duration: 1.3, offset: 1 },
  search: { clip: 'search', duration: 1.9, offset: 2 },
  hide: { clip: 'crouch', duration: 1.4, offset: 3 },
  examine: { clip: 'examine', duration: 1.7, offset: 1.5 },
};
/** complément procédural pendant un geste capturé (main tendue vers le sol pour ramasser…) */
const GESTURE_EXTRA: Partial<Record<GestureKind, (t: number) => Pose>> = {
  take: (t) => ({ RightArm: { bend: -0.6 * Math.sin(Math.PI * t) } }),
  hide: (t) => ({ RightArm: { bend: -0.8 * Math.sin(Math.PI * t) } }),
};

/**
 * Allongé sur le dos, bras écartés, tête tournée sur le côté. Repère du personnage DEBOUT
 * (le corps est couché ensuite) : la tête est vers -z, le visage vers +y, le sol vers -y.
 */
const DEAD_POSE: Pose = {
  RightArm: { aim: [-0.85, -0.3, -0.35], aimW: 0.65 },
  LeftArm: { aim: [0.9, -0.3, 0.1], aimW: 0.65 },
  RightForeArm: { aim: [-0.55, -0.1, -0.8], aimW: 0.7 },
  LeftForeArm: { aim: [0.6, -0.1, 0.6], aimW: 0.7 },
  Head: { side: 0.55 },
  RightUpLeg: { turn: -0.1 },
  LeftUpLeg: { turn: 0.07 },
};

export interface CastInstance extends Character3D {
  member: CastMember;
  /** vitesses (m/s) sans glissement des cycles de locomotion, à l'échelle de ce personnage */
  clipSpeeds: Record<(typeof LOCOMOTION)[number], number>;
  /** joue une activité capturée en boucle (ou une fois pour les gestes) ; null = attente normale */
  setActivity(a: CastActivity | null, opts?: { time?: number; fade?: number }): void;
}

const _v = new THREE.Vector3();

/**
 * Instancie un personnage du catalogue (modèle déjà chargé : voir loadCast / castReady).
 * `heightM` : taille voulue (par défaut celle du catalogue).
 */
export function buildCast(id: string, opts: { heightM?: number } = {}): CastInstance | null {
  const base = bases.get(id);
  if (!base) return null;
  const model = cloneSkinned(base.scene) as THREE.Group;
  const height = opts.heightM ?? base.member.heightM;
  model.scale.setScalar(height / base.height);

  const root = new THREE.Group();
  root.name = `cast:${id}`;
  const pose = new THREE.Group(); // sert à coucher le corps
  pose.add(model);
  root.add(pose);
  const blob = new THREE.Mesh(blobGeometry(), blobMaterial());
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.01;
  root.add(blob);

  let head: THREE.Object3D = model;
  const meshes: THREE.Mesh[] = [];
  model.traverse((o) => {
    if (o.name === 'Head') head = o;
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
  });

  const mixer = new THREE.AnimationMixer(model);
  const action = (name: string) => {
    const clip = base.clips.get(name);
    if (!clip) return null;
    const a = mixer.clipAction(clip);
    a.play();
    a.setEffectiveWeight(0);
    return a;
  };
  const idle = action('idle')!;
  idle.setEffectiveWeight(1);
  idle.time = Math.random() * idle.getClip().duration;
  // vitesse sans glissement de chaque cycle, à l'échelle de CE personnage (longueur de jambes × échelle)
  const loco = LOCOMOTION.map((n) => ({ a: action(n)!, speed: (base.speed[n] ?? 1.5) * base.stride * model.scale.x, offset: base.phase[n] ?? 0, w: 0 }));
  for (const l of loco) l.a.timeScale = 0; // temps piloté à la main (phase commune)
  let phase = Math.random();

  // activité capturée (photos, attente) et gestes capturés
  let activity: { a: THREE.AnimationAction; w: number; target: number; fade: number } | null = null;
  let gestureClip: { a: THREE.AnimationAction; t: number; def: { duration: number }; extra?: (t: number) => Pose } | null = null;

  const rig = castRig(model);
  const gestures = new GesturePlayer(rig, root);
  let extraT = 0;
  let extraFn: ((t: number) => Pose) | null = null;
  let held: PoseFn | null = null;
  // pose continue (cinématique) + complément de geste : composés en une seule pose
  const composed: PoseFn = (time) => {
    const a = held ? held(time) : {};
    if (!extraFn) return a;
    const b = extraFn(extraT);
    const out: Pose = { ...a };
    for (const k of Object.keys(b) as (keyof Pose)[]) out[k] = { ...a[k], bend: (a[k]?.bend ?? 0) + (b[k]?.bend ?? 0) };
    return out;
  };

  /** (ré)active la pose composée : `reset` remet son horloge à zéro (nouvelle pose de cinématique) */
  let holding = false;
  const syncHold = (reset: boolean) => {
    const want = !!(held || extraFn);
    if (want && (reset || !holding)) gestures.hold(composed);
    else if (!want && holding) gestures.hold(null);
    holding = want;
  };

  let dead = false;
  let fall = 1;
  let ownMaterials: THREE.Material[] | null = null;

  const inst: CastInstance = {
    member: base.member,
    clipSpeeds: { walk_slow: loco[0].speed, walk: loco[1].speed, run: loco[2].speed },
    root,
    head,
    update(dt, speed) {
      if (dead) {
        if (fall < 1) {
          fall = Math.min(1, fall + dt / 0.85);
          const e = fall * fall; // accélère comme une chute
          pose.rotation.x = (-Math.PI / 2) * e;
          pose.position.set(0, 0.1 * e, 0.9 * e);
          mixer.update(dt * 0.4);
          gestures.apply(dt);
        }
        return;
      }
      // ── Locomotion : poids selon la vitesse, phase commune ──
      const s1 = loco[0].speed;
      const s2 = loco[1].speed;
      const s3 = loco[2].speed;
      const moving = THREE.MathUtils.smoothstep(speed, 0.12, 0.45);
      let ws = 0;
      let ww = 0;
      let wr = 0;
      if (speed <= s1) ws = 1;
      else if (speed <= s2) ww = (speed - s1) / (s2 - s1);
      else ww = 1;
      if (speed > s2) {
        wr = THREE.MathUtils.clamp((speed - s2 * 1.1) / (s3 - s2 * 1.1), 0, 1);
        ww = 1 - wr;
      }
      if (speed <= s2) ws = 1 - ww;
      const k = Math.min(1, dt * 10);
      const targets = [ws * moving, ww * moving, wr * moving];
      let sumW = 0;
      let freq = 0;
      loco.forEach((l, i) => {
        l.w += (targets[i] - l.w) * k;
        sumW += l.w;
        // fréquence de cycle (cycles/s) qui ne fait pas glisser les pieds à cette vitesse
        freq += l.w * (Math.max(speed, 0.3) / l.speed / l.a.getClip().duration);
      });
      if (sumW > 1e-3) phase = (phase + dt * (freq / sumW)) % 1;
      for (const l of loco) {
        l.a.setEffectiveWeight(l.w);
        l.a.time = ((phase + l.offset) % 1) * l.a.getClip().duration;
      }
      const locoW = Math.min(1, sumW);
      // activité capturée (fondu)
      let actW = 0;
      if (activity) {
        activity.w += (activity.target - activity.w) * Math.min(1, dt / Math.max(0.05, activity.fade));
        if (activity.target === 0 && activity.w < 0.01) {
          activity.a.stop();
          activity = null;
        } else actW = activity.w * (1 - locoW);
        if (activity) activity.a.setEffectiveWeight(actW);
      }
      // geste capturé (enveloppe montée / maintien / descente)
      let gW = 0;
      if (gestureClip) {
        gestureClip.t += dt / gestureClip.def.duration;
        if (gestureClip.t >= 1) {
          gestureClip.a.stop();
          gestureClip = null;
          extraFn = null;
          syncHold(false);
        } else {
          gW = Math.min(1, gestureClip.t * 4, (1 - gestureClip.t) * 4) * (1 - locoW * 0.6);
          gestureClip.a.setEffectiveWeight(gW);
          extraT = gestureClip.t;
        }
      }
      idle.setEffectiveWeight(Math.max(0, 1 - locoW - actW - gW));
      mixer.update(dt);
      gestures.apply(dt);
    },
    gesture(kind) {
      if (dead) return;
      const def = GESTURE_CLIPS[kind];
      const clip = def && base.clips.get(def.clip);
      if (!def || !clip) {
        gestures.play(kind);
        return;
      }
      gestureClip?.a.stop();
      const a = mixer.clipAction(clip);
      a.reset().play();
      a.time = def.offset;
      a.setEffectiveWeight(0);
      gestureClip = { a, t: 0, def };
      extraFn = GESTURE_EXTRA[kind] ?? null;
      extraT = 0;
      syncHold(false);
    },
    setPose(fn) {
      held = fn;
      syncHold(true);
    },
    setActivity(name, o = {}) {
      // « idle » = l'attente de base (même action que celle du mélange)
      if (name === 'idle') {
        if (o.time !== undefined) idle.time = o.time % idle.getClip().duration;
        name = null;
      }
      if (activity && name && activity.a.getClip().name === name) {
        activity.target = 1;
        return;
      }
      if (activity && (!name || activity.a.getClip().name !== name)) {
        activity.target = 0;
        activity.fade = o.fade ?? 0.3;
        if (!name) return;
        activity.a.stop();
        activity = null;
      }
      if (!name) return;
      const clip = base.clips.get(name);
      if (!clip) return;
      const a = mixer.clipAction(clip);
      a.reset().play();
      a.setLoop(THREE.LoopRepeat, Infinity);
      if (o.time !== undefined) a.time = o.time % clip.duration;
      const fade = o.fade ?? 0.3;
      activity = { a, w: fade <= 0 ? 1 : 0, target: 1, fade };
      a.setEffectiveWeight(activity.w);
    },
    setVisibleBody(v) {
      model.visible = v;
      blob.visible = v;
    },
    setDead(d, animated) {
      if (!d || dead) return;
      dead = true;
      for (const l of loco) l.a.setEffectiveWeight(0);
      activity?.a.stop();
      gestureClip?.a.stop();
      activity = null;
      gestureClip = null;
      idle.setEffectiveWeight(1);
      idle.time = 0.5;
      mixer.update(0);
      held = null;
      extraFn = null;
      holding = true;
      gestures.hold(() => DEAD_POSE);
      fall = animated ? 0 : 1;
      pose.rotation.x = animated ? 0 : -Math.PI / 2;
      pose.position.set(0, animated ? 0 : 0.1, animated ? 0 : 0.9);
      if (!animated) gestures.apply(0);
      // corps grisé : copies de matériaux propres à ce corps (les autres clones gardent les originaux)
      ownMaterials = [];
      for (const m of meshes) {
        const mat = (m.material as THREE.MeshStandardMaterial).clone();
        mat.color.lerp(_grey, 0.4);
        m.material = mat;
        ownMaterials.push(mat);
      }
      blob.visible = false;
    },
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(model);
      for (const m of ownMaterials ?? []) m.dispose();
    },
  };
  return inst;
}

const _grey = new THREE.Color('#8a8a8a');
let _blobGeo: THREE.CircleGeometry | null = null;
let _blobMat: THREE.MeshBasicMaterial | null = null;
const blobGeometry = () => (_blobGeo ??= new THREE.CircleGeometry(0.32, 24));
const blobMaterial = () => (_blobMat ??= new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.35, depthWrite: false }));

/**
 * Personnage du catalogue pour les vues du jeu : modèle CAST s'il est chargé ; sinon le repli fourni
 * est affiché tout de suite et remplacé par le vrai modèle dès son chargement (même racine, l'état
 * — pose, mort, visibilité — est rejoué sur le nouveau modèle).
 */
export function buildCastCharacter(c: Character, fallback: (c: Character) => Character3D): Character3D {
  const id = c.castId!;
  const ready = buildCast(id);
  if (ready) return ready;
  const root = new THREE.Group();
  let inner: Character3D = fallback(c);
  root.add(inner.root);
  const state: { pose: PoseFn | null; dead: boolean; animated: boolean; visible: boolean; disposed: boolean } = { pose: null, dead: false, animated: false, visible: true, disposed: false };
  void loadCast(id).then((ok) => {
    if (!ok || state.disposed) return;
    const next = buildCast(id);
    if (!next) return;
    root.remove(inner.root);
    inner.dispose();
    inner = next;
    root.add(next.root);
    if (state.pose) next.setPose(state.pose);
    if (state.dead) next.setDead(true, false);
    next.setVisibleBody(state.visible);
  });
  return {
    root,
    get head() {
      return inner.head;
    },
    update: (dt, speed) => inner.update(dt, speed),
    setVisibleBody(v) {
      state.visible = v;
      inner.setVisibleBody(v);
    },
    setDead(d, animated) {
      if (d) state.dead = true;
      inner.setDead(d, animated);
    },
    gesture: (k) => inner.gesture(k),
    setPose(fn) {
      state.pose = fn;
      inner.setPose(fn);
    },
    dispose() {
      state.disposed = true;
      inner.dispose();
    },
  };
}

/** Hauteur de la tête (m) d'un personnage instancié, pour cadrer une caméra. */
export function headHeight(inst: Character3D): number {
  inst.root.updateMatrixWorld(true);
  inst.head.getWorldPosition(_v);
  return _v.y - inst.root.position.y;
}
