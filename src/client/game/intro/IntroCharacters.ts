/**
 * Personnages de la cinématique : les VRAIS personnages des joueurs (même apparence qu'en jeu),
 * assis à la place choisie par le serveur, avec une animation procédurale par passager.
 */
import * as THREE from 'three';
import type { IntroAnimation, IntroPlan } from '@shared/content/intro';
import type { VehicleDefinition } from '@shared/content/vehicles';
import { buildCharacter, type Character3D } from '../../three/character3d';
import type { Pose, PoseFn } from '../../three/gestures';

/** Ce que la mise en scène fait varier au fil des états (0 → 1). */
export interface CastControls {
  /** les passagers regardent la villa (INTRO_POINT et après) */
  attention: number;
  /** le conducteur pointe la villa */
  point: number;
}

const SIT: Pose = {
  RightUpLeg: { bend: -1.4 },
  LeftUpLeg: { bend: -1.4 },
  RightLeg: { bend: 1.35 },
  LeftLeg: { bend: 1.35 },
  Spine: { bend: -0.06 },
};

/** Directions visées (repère du personnage : x = sa gauche, y = haut, z = avant). */
type V3 = [number, number, number];
const arms = (ra: V3, rf: V3, la: V3, lf: V3): Pose => ({ RightArm: { aim: ra }, RightForeArm: { aim: rf }, LeftArm: { aim: la }, LeftForeArm: { aim: lf } });
/** Mains posées sur les cuisses */
const LAP = arms([0.08, -0.9, 0.35], [0.25, -0.3, 1], [-0.08, -0.9, 0.35], [-0.25, -0.3, 1]);

/** Somme pondérée de poses (rotations additives ; directions visées moyennées). */
function mix(...parts: [Pose, number][]): Pose {
  const out: Pose = {};
  for (const [p, w] of parts) {
    if (!w) continue;
    for (const k of Object.keys(p) as (keyof Pose)[]) {
      const src = p[k]!;
      const dst = (out[k] ??= {});
      if (src.bend) dst.bend = (dst.bend ?? 0) + src.bend * w;
      if (src.side) dst.side = (dst.side ?? 0) + src.side * w;
      if (src.turn) dst.turn = (dst.turn ?? 0) + src.turn * w;
      if (src.aim) {
        const ws = (src.aimW ?? 1) * w;
        const wd = dst.aimW ?? 0;
        const a = dst.aim ?? [0, 0, 0];
        dst.aim = [0, 1, 2].map((i) => (a[i] * wd + src.aim![i] * ws) / (wd + ws)) as V3;
        dst.aimW = wd + ws;
      }
    }
  }
  return out;
}

/**
 * Animation d'un occupant (bras compris). `inward` = sens (±1) vers le centre du véhicule pour la tête,
 * `roomy` = place pour lever les bras (minibus).
 */
function animationPose(anim: IntroAnimation, t: number, inward: number, roomy: boolean, phase: number): Pose {
  const s = (f: number, o = 0) => Math.sin(t * f + phase + o);
  switch (anim) {
    case 'drive': {
      // mains sur le volant, petites corrections de trajectoire
      const steer = 0.05 * s(0.7);
      return mix(
        [arms([0.15, -0.55, 0.8], [0.25 + steer, 0.12, 1], [-0.15, -0.55, 0.8], [-0.25 + steer, 0.12, 1]), 1],
        // regard sur la route, avec un coup d'œil de temps en temps vers le passager
        [{ Head: { turn: inward * 0.4 * Math.max(0, s(0.45)) ** 6 + 0.04 * s(0.3) } }, 1],
      );
    }
    case 'talk':
      // la main droite accompagne la conversation
      return mix(
        [LAP, 1],
        [{ RightArm: { aim: [0.15, -0.75, 0.6], aimW: 3 }, RightForeArm: { aim: [0.3, 0.25 + 0.3 * s(3.1), 1], aimW: 3 } }, 1],
        [{ Head: { turn: inward * (0.45 + 0.1 * s(0.9)), bend: 0.06 * s(5.3) }, Spine1: { turn: inward * 0.12 } }, 1],
      );
    case 'laugh': {
      const burst = Math.max(0, s(1.3)) ** 2;
      return mix(
        [LAP, 1],
        // main sur la poitrine pendant les éclats de rire
        [{ RightForeArm: { aim: [0.8, 0.45, 0.4], aimW: 3 * burst } }, 1],
        [{ Spine: { bend: -0.08 - 0.14 * burst * Math.abs(s(11)) }, Head: { bend: -0.2 * burst, turn: inward * 0.35 } }, 1],
      );
    }
    case 'dance': {
      const up = roomy ? 0.9 : 0.25; // dans la berline, les bras restent sous le pavillon
      return mix(
        [arms([-0.35, up, 0.45 + 0.2 * s(4.2)], [0.1, 1, 0.3], [0.35, up, 0.45 + 0.2 * s(4.2, Math.PI)], [-0.1, 1, 0.3]), 1],
        [{ Spine: { side: 0.12 * s(4.2) }, Head: { side: 0.15 * s(4.2, 0.6), bend: 0.08 * s(8.4) } }, 1],
      );
    }
    case 'look':
      // regarde dehors par la vitre
      return mix([LAP, 1], [{ Head: { turn: -inward * (0.75 + 0.1 * s(0.5)), bend: -0.05 }, Neck: { turn: -inward * 0.2 } }, 1]);
  }
}

/** Un occupant regarde devant lui (la villa), mains sur les cuisses */
const ATTENTION: Pose = mix([LAP, 1], [{ Spine: { bend: 0.12 }, Neck: { bend: -0.05 }, Head: { bend: -0.04 } }, 1]);
/** Le conducteur garde la main gauche sur le volant et tend le bras droit vers la villa */
const POINTING: Pose = mix(
  [arms([0.1, 1.0, 1], [0.05, 1.0, 1], [-0.15, -0.55, 0.8], [-0.25, 0.12, 1]), 1],
  [{ Head: { bend: -0.08 } }, 1],
);

export interface IntroCast {
  group: THREE.Group;
  members: { userId: string; seatId: string; ch: Character3D; head: THREE.Object3D }[];
  update(dt: number): void;
  dispose(): void;
}

/** Hauteur du bassin du personnage debout (pour l'asseoir à la hauteur du siège). */
function hipHeight(ch: Character3D): number {
  let hips: THREE.Object3D | null = null;
  ch.root.traverse((o) => {
    if (!hips && /Hips$/.test(o.name)) hips = o;
  });
  if (!hips) return 0.95;
  ch.root.updateMatrixWorld(true);
  const p = new THREE.Vector3();
  (hips as THREE.Object3D).getWorldPosition(p);
  return p.y - ch.root.position.y || 0.95;
}

export function buildIntroCast(plan: IntroPlan, vehicle: VehicleDefinition, ctl: CastControls): IntroCast {
  const group = new THREE.Group();
  const roomy = vehicle.assets.body.height > 2;
  const members: IntroCast['members'] = [];
  plan.occupants.forEach((o, i) => {
    const seat = vehicle.seats.find((s) => s.id === o.seatId);
    if (!seat) return;
    const ch = buildCharacter(o.character);
    ch.root.rotation.set(...seat.rotation);
    ch.root.position.set(seat.position[0], 0, seat.position[2]);
    group.add(ch.root);
    ch.root.position.y = seat.position[1] - hipHeight(ch);
    const inward = seat.position[0] > 0 ? -1 : 1; // vers le centre du véhicule
    const phase = i * 1.7;
    const isDriver = o.userId === plan.driverId;
    const fn: PoseFn = (t) => {
      const anim = animationPose(o.animation, t, inward, roomy, phase);
      if (isDriver) return mix([SIT, 1], [anim, 1 - ctl.point], [POINTING, ctl.point]);
      return mix([SIT, 1], [anim, 1 - ctl.attention], [ATTENTION, ctl.attention]);
    };
    ch.setPose(fn);
    members.push({ userId: o.userId, seatId: o.seatId, ch, head: ch.head });
  });
  return {
    group,
    members,
    update(dt) {
      for (const m of members) m.ch.update(dt, 0);
    },
    dispose() {
      for (const m of members) m.ch.dispose();
    },
  };
}
