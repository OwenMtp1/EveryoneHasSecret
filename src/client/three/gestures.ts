/**
 * Gestes procéduraux appliqués PAR-DESSUS les animations capturées (attente/marche/course).
 * Rotations en espace monde autour d'axes liés au personnage → indépendantes des repères
 * locaux propres à chaque squelette (Ready Player Me, Mixamo…).
 */
import * as THREE from 'three';
import type { GestureKind } from '@shared/types';

type BoneKey = 'Hips' | 'Spine' | 'Spine1' | 'Spine2' | 'Neck' | 'Head' | 'RightArm' | 'RightForeArm' | 'LeftArm' | 'LeftForeArm' | 'RightUpLeg' | 'LeftUpLeg' | 'RightLeg' | 'LeftLeg';

export type Rig = Partial<Record<BoneKey, THREE.Bone>>;

export function findRig(root: THREE.Object3D): Rig {
  const rig: Rig = {};
  root.traverse((o) => {
    if (!(o as THREE.Bone).isBone) return;
    const k = o.name.replace(/^mixamorig:?/, '') as BoneKey;
    if (!rig[k]) rig[k] = o as THREE.Bone;
  });
  return rig;
}

/** Une pose = rotations (radians) autour de deux axes du personnage : `bend` (vers l'avant) et `side`. */
type Pose = Partial<Record<BoneKey, { bend?: number; side?: number }>>;

interface GestureDef {
  duration: number;
  pose: (t: number) => Pose; // t ∈ [0,1]
}

const env = (t: number) => Math.sin(Math.PI * Math.min(1, Math.max(0, t))); // 0 → 1 → 0
const hold = (t: number) => Math.min(1, t * 4, (1 - t) * 4); // monte vite, tient, redescend

const GESTURES: Record<GestureKind, GestureDef> = {
  // Se pencher et tendre la main vers le sol
  take: { duration: 1.2, pose: (t) => ({ Spine: { bend: 0.45 * env(t) }, Spine1: { bend: 0.35 * env(t) }, Neck: { bend: 0.2 * env(t) }, RightArm: { bend: -0.7 * env(t) }, RightForeArm: { bend: -0.3 * env(t) }, RightUpLeg: { bend: -0.25 * env(t) }, LeftUpLeg: { bend: -0.25 * env(t) }, RightLeg: { bend: 0.4 * env(t) }, LeftLeg: { bend: 0.4 * env(t) } }) },
  drop: { duration: 1.1, pose: (t) => ({ Spine: { bend: 0.35 * env(t) }, Spine1: { bend: 0.25 * env(t) }, RightArm: { bend: -0.6 * env(t) } }) },
  hide: { duration: 1.3, pose: (t) => ({ Spine: { bend: 0.4 * env(t) }, Spine1: { bend: 0.3 * env(t) }, RightArm: { bend: -1.0 * env(t) }, RightForeArm: { bend: -0.4 * env(t) }, Head: { side: 0.35 * Math.sin(t * 12) * env(t) } }) },
  // Fouiller : penché, les deux mains qui farfouillent
  search: { duration: 1.8, pose: (t) => { const h = hold(t); const w = Math.sin(t * 28) * 0.18; return { Spine: { bend: 0.35 * h }, Spine1: { bend: 0.25 * h }, Head: { bend: 0.25 * h }, RightArm: { bend: (-0.9 + w) * h }, LeftArm: { bend: (-0.9 - w) * h }, RightForeArm: { bend: -0.5 * h }, LeftForeArm: { bend: -0.5 * h } }; } },
  give: { duration: 1.2, pose: (t) => ({ RightArm: { bend: -1.2 * env(t) }, RightForeArm: { bend: -0.15 * env(t) }, Spine1: { bend: 0.1 * env(t) } }) },
  // Examiner : objet levé devant les yeux, tête penchée
  examine: { duration: 1.6, pose: (t) => { const h = hold(t); return { RightArm: { bend: -1.0 * h }, RightForeArm: { bend: -1.1 * h }, Head: { bend: 0.3 * h, side: 0.15 * Math.sin(t * 6) * h } }; } },
  use: { duration: 1.2, pose: (t) => ({ RightArm: { bend: -0.9 * env(t) }, RightForeArm: { bend: -0.8 * env(t) } }) },
  // Se laver les mains : mains jointes devant, frottement
  wash: { duration: 1.8, pose: (t) => { const h = hold(t); const w = Math.sin(t * 34) * 0.15; return { Spine: { bend: 0.25 * h }, RightArm: { bend: -0.7 * h, side: (-0.25 + w) * h }, LeftArm: { bend: -0.7 * h, side: (0.25 - w) * h }, RightForeArm: { bend: -0.9 * h }, LeftForeArm: { bend: -0.9 * h }, Head: { bend: 0.35 * h } }; } },
  clean: { duration: 1.5, pose: (t) => { const h = hold(t); return { Spine: { bend: 0.5 * h }, Spine1: { bend: 0.3 * h }, RightArm: { bend: -0.9 * h, side: 0.35 * Math.sin(t * 22) * h } }; } },
  destroy: { duration: 1.4, pose: (t) => ({ RightArm: { bend: -1.1 * env(t) }, RightForeArm: { bend: -0.5 * env(t) }, LeftArm: { bend: -0.8 * env(t) }, Head: { bend: 0.3 * env(t) } }) },
  // Frapper : armer puis abattre le bras
  attack: { duration: 1.0, pose: (t) => { const raise = t < 0.4 ? t / 0.4 : Math.max(0, 1 - (t - 0.4) / 0.25); const strike = t < 0.4 ? 0 : env((t - 0.4) / 0.6); return { RightArm: { bend: -2.6 * raise - 0.8 * strike }, RightForeArm: { bend: -0.6 * raise }, Spine1: { bend: -0.15 * raise + 0.35 * strike }, Spine: { bend: 0.2 * strike } }; } },
};

const ORDER: BoneKey[] = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'RightUpLeg', 'LeftUpLeg', 'RightLeg', 'LeftLeg', 'RightArm', 'RightForeArm', 'LeftArm', 'LeftForeArm'];

const _q = new THREE.Quaternion();
const _qw = new THREE.Quaternion();
const _qp = new THREE.Quaternion();
const _fwd = new THREE.Vector3();
const _bendAxis = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function rotateWorld(bone: THREE.Bone, axis: THREE.Vector3, angle: number) {
  if (!angle || !bone.parent) return;
  bone.updateWorldMatrix(true, false);
  bone.getWorldQuaternion(_qw);
  bone.parent.getWorldQuaternion(_qp);
  _q.setFromAxisAngle(axis, angle).multiply(_qw);
  bone.quaternion.copy(_qp.invert().multiply(_q));
}

export class GesturePlayer {
  private current: { def: GestureDef; t: number } | null = null;

  constructor(private rig: Rig, private root: THREE.Object3D) {}

  play(kind: GestureKind) {
    this.current = { def: GESTURES[kind], t: 0 };
  }

  /** À appeler APRÈS la mise à jour des animations capturées. */
  apply(dt: number) {
    const c = this.current;
    if (!c) return;
    c.t += dt / c.def.duration;
    if (c.t >= 1) {
      this.current = null;
      return;
    }
    const pose = c.def.pose(c.t);
    this.root.getWorldDirection(_fwd); // +z local = avant du personnage
    _bendAxis.crossVectors(UP, _fwd).normalize(); // rotation positive = pencher vers l'avant
    for (const k of ORDER) {
      const p = pose[k];
      const bone = this.rig[k];
      if (!p || !bone) continue;
      if (p.bend) rotateWorld(bone, _bendAxis, p.bend);
      if (p.side) rotateWorld(bone, _fwd, p.side);
    }
  }
}
