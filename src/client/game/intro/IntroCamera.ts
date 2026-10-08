/**
 * Caméra de la cinématique. Chaque état a son mouvement ; les positions intérieures sont exprimées
 * dans le repère du véhicule (la caméra roule avec lui), puis converties en coordonnées monde.
 *
 *  INTRO_START  : premier plan intérieur, dans le noir qui s'ouvre
 *  INTRO_CAR    : plans d'habitacle (vue générale, passagers, avant du véhicule)
 *  INTRO_POINT  : par-dessus l'épaule du conducteur qui montre la villa
 *  INTRO_REVEAL : sortie par le pare-brise, recul, décalage à droite, montée → véhicule + route + villa
 *  INTRO_VILLA  : la caméra se détache du véhicule et glisse vers la façade
 */
import * as THREE from 'three';
import type { GameIntroState, IntroPlan } from '@shared/content/intro';
import type { VehicleDefinition } from '@shared/content/vehicles';
import { seatedEyeHeight } from './IntroVehicle';

const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const v = (a: readonly number[]) => new THREE.Vector3(a[0], a[1], a[2]);

interface Shot {
  from: THREE.Vector3;
  to: THREE.Vector3;
  lookFrom: THREE.Vector3;
  lookTo: THREE.Vector3;
}

export class IntroCamera {
  private carShots: Shot[] = [];
  private pointShot: Shot;
  private revealStart: THREE.Vector3;
  private revealExit: THREE.Vector3;
  private revealEnd: THREE.Vector3;
  private revealLook: THREE.Vector3;
  private tmpP = new THREE.Vector3();
  private tmpL = new THREE.Vector3();
  /** position/visée monde à la fin de la révélation (point de départ du plan villa) */
  private handoff: { p: THREE.Vector3; l: THREE.Vector3 } | null = null;

  constructor(
    private camera: THREE.PerspectiveCamera,
    vehicle: VehicleDefinition,
    plan: IntroPlan,
    private villaFocus: THREE.Vector3,
    private villaShot: { from: THREE.Vector3; to: THREE.Vector3 },
  ) {
    const cfg = vehicle.cinematicConfig;
    const eye = seatedEyeHeight(vehicle);
    const seats = vehicle.seats;
    const front = seats.filter((s) => s.position[2] === seats[0].position[2]);
    const frontZ = front[0].position[2];
    const passengers = plan.occupants.filter((o) => o.userId !== plan.driverId).map((o) => seats.find((s) => s.id === o.seatId)!);
    // 1. Vue générale de l'habitacle (cadrage de référence du véhicule), lent travelling arrière
    const ic = cfg.interiorCamera;
    this.carShots.push({ from: v(ic.position).add(new THREE.Vector3(0, 0, 0.12)), to: v(ic.position), lookFrom: v(ic.lookAt), lookTo: v(ic.lookAt).add(new THREE.Vector3(0, 0.05, 0)) });
    // 2. Un passager de l'arrière (ou le passager avant) en gros plan, filmé entre les sièges avant
    const back = passengers.find((s) => s.position[2] < frontZ) ?? passengers[0];
    if (back) {
      const [x, y, z] = back.position;
      const head = new THREE.Vector3(x, y + 0.6, z);
      const side = -Math.sign(x || 1);
      const between = back.position[2] < frontZ ? frontZ - 0.05 : frontZ + 0.6;
      this.carShots.push({
        from: new THREE.Vector3(side * 0.05, eye + 0.08, between),
        to: new THREE.Vector3(side * 0.14, eye + 0.02, between - 0.12),
        lookFrom: head,
        lookTo: head.clone().add(new THREE.Vector3(side * 0.08, 0, 0)),
      });
    }
    // 3. L'avant du véhicule vu depuis la planche de bord : conducteur et passager avant
    const dash = new THREE.Vector3(0, eye - 0.05, frontZ + 0.72);
    this.carShots.push({ from: dash.clone().add(new THREE.Vector3(0.15, 0, 0)), to: dash.clone().add(new THREE.Vector3(-0.15, 0.02, 0)), lookFrom: new THREE.Vector3(0, eye - 0.15, frontZ - 0.4), lookTo: new THREE.Vector3(0, eye - 0.12, frontZ - 0.4) });

    // Entre les deux sièges avant, juste derrière les têtes : le conducteur de profil, son bras tendu, la route
    const d = seats.find((s) => s.type === 'driver')!.position;
    const over = new THREE.Vector3(-0.12, d[1] + 0.6, d[2] - 0.32);
    this.pointShot = { from: over, to: over.clone().add(new THREE.Vector3(0.02, 0.01, 0.1)), lookFrom: new THREE.Vector3(d[0] + 0.45, d[1] + 0.5, d[2] + 1.0), lookTo: new THREE.Vector3(d[0] + 0.3, d[1] + 0.58, d[2] + 1.5) };

    // Révélation : depuis l'arrière des sièges avant → à travers le pare-brise → reculé, à droite, en hauteur
    const L = vehicle.assets.body.length;
    this.revealStart = new THREE.Vector3(0, eye, frontZ - 0.35);
    this.revealExit = new THREE.Vector3(0, eye + 0.1, L / 2 + 1.1);
    this.revealEnd = new THREE.Vector3(-cfg.revealOffset, cfg.revealHeight, -cfg.revealDistance);
    this.revealLook = v(cfg.exteriorCamera.lookAt);
  }

  /**
   * Place la caméra. `u` = progression (0 → 1) dans l'état courant ; `vehicleObj` = véhicule dans la scène.
   */
  update(state: GameIntroState, u: number, vehicleObj: THREE.Object3D) {
    const p = this.tmpP;
    const l = this.tmpL;
    const toWorld = (x: THREE.Vector3) => vehicleObj.localToWorld(x);
    const playShot = (s: Shot, k: number) => {
      const e = smooth(k);
      p.lerpVectors(s.from, s.to, e);
      l.lerpVectors(s.lookFrom, s.lookTo, e);
      toWorld(p);
      toWorld(l);
    };
    switch (state) {
      case 'INTRO_START':
        playShot(this.carShots[0], u * 0.2);
        break;
      case 'INTRO_CAR': {
        const n = this.carShots.length;
        const i = Math.min(n - 1, Math.floor(u * n));
        playShot(this.carShots[i], u * n - i);
        break;
      }
      case 'INTRO_POINT':
        playShot(this.pointShot, u);
        break;
      case 'INTRO_REVEAL': {
        const exitPart = 0.28;
        if (u < exitPart) {
          const k = smooth(u / exitPart);
          p.lerpVectors(this.revealStart, this.revealExit, k);
          l.copy(p).add(new THREE.Vector3(0, -0.02, 10));
        } else {
          const k = smooth((u - exitPart) / (1 - exitPart));
          p.lerpVectors(this.revealExit, this.revealEnd, k);
          // légère courbe : la caméra monte plus vite qu'elle ne recule (passe au-dessus du toit)
          p.y += Math.sin(k * Math.PI) * 1.2;
          l.copy(this.revealExit).add(new THREE.Vector3(0, -0.02, 10)).lerp(this.revealLook, k);
        }
        toWorld(p);
        toWorld(l);
        this.handoff = { p: p.clone(), l: l.clone() };
        break;
      }
      case 'INTRO_VILLA':
      case 'GAME_START': {
        // fin de la révélation, recalculée si l'on arrive directement ici (reconnexion)
        if (!this.handoff) {
          p.copy(this.revealEnd);
          l.copy(this.revealLook);
          this.handoff = { p: toWorld(p).clone(), l: toWorld(l).clone() };
        }
        const k = smooth(clamp01(state === 'GAME_START' ? 1 : u));
        const from = this.handoff.p.clone().lerp(this.villaShot.from, smooth(clamp01(k * 2.5)));
        p.lerpVectors(from, this.villaShot.to, k);
        l.lerpVectors(this.handoff.l, this.villaFocus, smooth(clamp01(k * 1.8)));
        break;
      }
    }
    this.camera.position.copy(p);
    this.camera.lookAt(l);
    // focale courte dans l'habitacle, plus longue dehors
    const interior = state === 'INTRO_START' || state === 'INTRO_CAR' || state === 'INTRO_POINT';
    const fov = interior ? 56 : state === 'INTRO_REVEAL' ? 56 - 14 * smooth(clamp01((u - 0.2) / 0.6)) : 42;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
