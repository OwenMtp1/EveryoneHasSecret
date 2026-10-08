/**
 * Personnages réalistes (étape 1) : modèles humains riggés + animations capturées (attente, marche, course).
 *
 *  - Homme  : avatar Ready Player Me (squelette compatible Mixamo, tenue en 3 pièces recolorables)
 *  - Femme  : « Michelle » (Mixamo), texture unique
 *  - Animations : clips du mannequin Mixamo des exemples Three.js, réappliqués aux deux squelettes
 *
 * Les modèles viennent des exemples Three.js (origine Mixamo / Ready Player Me) : licence à valider
 * avant toute sortie publique. L'étape 2 (pipeline MakeHuman CC0) les remplacera.
 * Tant que les fichiers ne sont pas chargés (ou en cas d'échec), le personnage procédural sert de repli.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Appearance, Character } from '@shared/types';
import { findHairColor, findOutfit, findSkinTone } from '@shared/content/character';
import type { GestureKind } from '@shared/types';
import { GesturePlayer, findRig, type PoseFn } from './gestures';

interface BaseModel {
  scene: THREE.Group;
  height: number;
  clips: { idle: THREE.AnimationClip; walk: THREE.AnimationClip; run: THREE.AnimationClip };
}

const MODELS: Record<Appearance, { url: string; height: number }> = {
  masculine: { url: '/models/Man.glb', height: 1.8 },
  feminine: { url: '/models/Woman.glb', height: 1.7 },
};
const ANIMATIONS_URL = '/models/Animations.glb';

let bases: Partial<Record<Appearance, BaseModel>> = {};
let loading: Promise<boolean> | null = null;

/** Lance (une fois) le chargement des modèles. Résout true si au moins un modèle est prêt. */
export function preloadRealistic(): Promise<boolean> {
  if (loading) return loading;
  const loader = new GLTFLoader();
  loading = (async () => {
    try {
      const anim = await loader.loadAsync(ANIMATIONS_URL);
      anim.scene.traverse((o) => (o.userData.restQ = o.quaternion.clone()));
      const byName = (n: string) => anim.animations.find((a) => a.name === n)!;
      const src = { idle: byName('idle'), walk: byName('walk'), run: byName('run') };
      await Promise.all(
        (Object.keys(MODELS) as Appearance[]).map(async (app) => {
          const gltf = await loader.loadAsync(MODELS[app].url);
          const scene = gltf.scene;
          scene.traverse((o) => {
            const m = o as THREE.Mesh;
            if (m.isMesh) {
              m.castShadow = true;
              m.frustumCulled = false;
            }
          });
          scene.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(scene);
          bases[app] = {
            scene,
            height: Math.max(0.1, box.max.y - box.min.y),
            clips: {
              idle: bakeRetarget(anim.scene, src.idle, scene),
              walk: bakeRetarget(anim.scene, src.walk, scene),
              run: bakeRetarget(anim.scene, src.run, scene),
            },
          };
        }),
      );
      return Object.keys(bases).length > 0;
    } catch (e) {
      console.warn('Modèles réalistes indisponibles, repli procédural.', e);
      bases = {};
      return false;
    }
  })();
  return loading;
}

export function realisticReady() {
  return Object.keys(bases).length > 0;
}

const boneKey = (name: string) => name.replace(/^mixamorig:?/, '');

/**
 * Transfert d'animation en espace monde entre deux squelettes aux poses de repos différentes.
 * Pour chaque os : écart monde de la source par rapport à SA pose de repos, réappliqué à la pose
 * de repos de la cible, puis reconverti en rotation locale. Échantillonné à 30 i/s.
 */
function bakeRetarget(srcScene: THREE.Object3D, clip: THREE.AnimationClip, tgtScene: THREE.Object3D, fps = 30): THREE.AnimationClip {
  const srcBones = new Map<string, THREE.Object3D>();
  srcScene.traverse((o) => (o as THREE.Bone).isBone && srcBones.set(boneKey(o.name), o));
  const tgtBones: THREE.Bone[] = [];
  tgtScene.traverse((o) => (o as THREE.Bone).isBone && tgtBones.push(o as THREE.Bone)); // parents avant enfants
  const tgtSet = new Set<THREE.Object3D>(tgtBones);

  // Poses de repos (monde) — la source n'a encore jamais été animée
  srcScene.updateMatrixWorld(true);
  tgtScene.updateMatrixWorld(true);
  const restSrc = new Map<string, THREE.Quaternion>();
  for (const [k, b] of srcBones) restSrc.set(k, b.getWorldQuaternion(new THREE.Quaternion()));
  const restTgtWorld = new Map<THREE.Object3D, THREE.Quaternion>();
  for (const b of tgtBones) restTgtWorld.set(b, b.getWorldQuaternion(new THREE.Quaternion()));
  const parentRest = new Map<THREE.Object3D, THREE.Quaternion>();
  for (const b of tgtBones) if (b.parent && !tgtSet.has(b.parent)) parentRest.set(b, b.parent.getWorldQuaternion(new THREE.Quaternion()));

  const mixer = new THREE.AnimationMixer(srcScene);
  const action = mixer.clipAction(clip);
  action.play();
  const frames = Math.max(2, Math.round(clip.duration * fps) + 1);
  const times = new Float32Array(frames);
  const values = new Map<THREE.Bone, Float32Array>(tgtBones.map((b) => [b, new Float32Array(frames * 4)]));
  const worldNow = new Map<THREE.Object3D, THREE.Quaternion>();
  const q = new THREE.Quaternion();
  const d = new THREE.Quaternion();
  for (let f = 0; f < frames; f++) {
    const t = Math.min(clip.duration, f / fps);
    times[f] = t;
    mixer.setTime(t);
    srcScene.updateMatrixWorld(true);
    worldNow.clear();
    for (const b of tgtBones) {
      const key = boneKey(b.name);
      const s = srcBones.get(key);
      const parentW = b.parent && tgtSet.has(b.parent) ? worldNow.get(b.parent)! : (parentRest.get(b) ?? new THREE.Quaternion());
      let w: THREE.Quaternion;
      if (s && restSrc.has(key)) {
        s.getWorldQuaternion(q);
        d.copy(q).multiply(restSrc.get(key)!.clone().invert()); // écart monde
        w = d.clone().multiply(restTgtWorld.get(b)!);
      } else {
        w = parentW.clone().multiply(b.quaternion); // os sans équivalent : garde sa pose de repos
      }
      worldNow.set(b, w);
      const local = parentW.clone().invert().multiply(w);
      values.get(b)!.set([local.x, local.y, local.z, local.w], f * 4);
    }
  }
  action.stop();
  mixer.uncacheRoot(srcScene);
  // remet la source au repos pour le transfert suivant
  srcScene.traverse((o) => {
    const rest = (o as THREE.Object3D & { userData: { restQ?: THREE.Quaternion } }).userData.restQ;
    if (rest) o.quaternion.copy(rest);
  });
  srcScene.updateMatrixWorld(true);
  const tracks = tgtBones.map((b) => new THREE.QuaternionKeyframeTrack(`${b.name}.quaternion`, times, values.get(b)!));
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

/** Applique une teinte multiplicative en conservant le détail de la texture. */
function tint(m: THREE.MeshStandardMaterial, color: string, strength: number) {
  m.color.set('#ffffff').lerp(new THREE.Color(color), strength);
}

export interface RealisticInstance {
  root: THREE.Group;
  head: THREE.Object3D;
  update(dt: number, speed: number): void;
  setVisible(v: boolean): void;
  setDead(animated: boolean): void;
  gesture(kind: GestureKind): void;
  /** pose continue (cinématique) */
  setPose(fn: PoseFn | null): void;
  dispose(): void;
}

export function buildRealistic(c: Character): RealisticInstance | null {
  const base = bases[c.appearance] ?? bases.masculine ?? bases.feminine;
  if (!base) return null;
  const model = cloneSkinned(base.scene) as THREE.Group;
  const outfit = findOutfit(c.outfitId);
  const skin = findSkinTone(c.skinTone).color;
  const hair = findHairColor(c.hairColor).color;
  const materials: THREE.Material[] = [];
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
    mesh.material = mat;
    materials.push(mat);
    switch (mat.name) {
      case 'Wolf3D_Skin':
      case 'Wolf3D_Body':
        tint(mat, skin, 0.55);
        break;
      case 'Wolf3D_Outfit_Top':
        tint(mat, outfit.top.color, 0.85);
        break;
      case 'Wolf3D_Outfit_Bottom':
        tint(mat, outfit.bottom.color, 0.85);
        break;
      case 'Wolf3D_Outfit_Footwear':
        tint(mat, outfit.shoes, 0.7);
        break;
      case 'Wolf3D_Beard':
        tint(mat, hair, 0.8);
        break;
    }
  });
  const scale = MODELS[c.appearance].height / base.height;
  model.scale.setScalar(scale);

  const root = new THREE.Group();
  const pose = new THREE.Group(); // sert à coucher le corps
  pose.add(model);
  root.add(pose);
  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(0.32, 24),
    new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.35, depthWrite: false }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.01;
  root.add(blob);

  const mixer = new THREE.AnimationMixer(model);
  const idle = mixer.clipAction(base.clips.idle);
  const walk = mixer.clipAction(base.clips.walk);
  const run = mixer.clipAction(base.clips.run);
  for (const a of [idle, walk, run]) {
    a.play();
    a.setEffectiveWeight(0);
  }
  idle.setEffectiveWeight(1);
  idle.time = Math.random() * base.clips.idle.duration;
  let wWalk = 0;
  let wRun = 0;
  let head: THREE.Object3D = model;
  model.traverse((o) => {
    if (/Head$/.test(o.name) && (o as THREE.Bone).isBone) head = o;
  });
  let dead = false;
  /** progression de la chute (1 = au sol) */
  let fall = 1;
  const gestures = new GesturePlayer(findRig(model), root);

  return {
    root,
    head,
    update(dt, speed) {
      if (dead) {
        if (fall < 1) {
          fall = Math.min(1, fall + dt / 0.85);
          const e = fall * fall; // accélère comme une chute
          pose.rotation.x = (-Math.PI / 2) * e;
          pose.position.set(0, 0.12 * e, 0.85 * e);
          mixer.update(dt * 0.5);
        }
        return;
      }
      const tWalk = speed > 0.3 ? (speed > 2.6 ? 0 : 1) : 0;
      const tRun = speed > 2.6 ? 1 : 0;
      const k = Math.min(1, dt * 8);
      wWalk += (tWalk - wWalk) * k;
      wRun += (tRun - wRun) * k;
      idle.setEffectiveWeight(Math.max(0, 1 - wWalk - wRun));
      walk.setEffectiveWeight(wWalk);
      run.setEffectiveWeight(wRun);
      run.timeScale = THREE.MathUtils.clamp(speed / 4, 0.7, 1.3);
      walk.timeScale = THREE.MathUtils.clamp(speed / 1.5, 0.6, 1.5);
      mixer.update(dt);
      gestures.apply(dt);
    },
    gesture(kind) {
      if (!dead) gestures.play(kind);
    },
    setPose(fn) {
      gestures.hold(fn);
    },
    setVisible(v) {
      model.visible = v;
      blob.visible = v;
    },
    setDead(animated) {
      dead = true;
      idle.setEffectiveWeight(1);
      walk.setEffectiveWeight(0);
      run.setEffectiveWeight(0);
      mixer.update(0.01);
      fall = animated ? 0 : 1;
      pose.rotation.x = animated ? 0 : -Math.PI / 2;
      pose.position.set(0, animated ? 0 : 0.12, animated ? 0 : 0.85);
      for (const m of materials) (m as THREE.MeshStandardMaterial).color?.lerp(new THREE.Color('#8a8a8a'), 0.45);
    },
    dispose() {
      mixer.stopAllAction();
      for (const m of materials) m.dispose();
    },
  };
}
