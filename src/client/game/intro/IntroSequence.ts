/**
 * Cinématique d'arrivée à la Villa Beaumont : vraie scène 3D temps réel (pas une vidéo).
 * Tout ce qui est montré découle du plan serveur (véhicule, places, conducteur, animations, graine)
 * et de l'horloge serveur : chaque joueur voit la même chose au même moment.
 */
import * as THREE from 'three';
import { introSchedule, introStateAt, seededRandom, type GameIntroState, type IntroPlan } from '@shared/content/intro';
import { WORLD_W } from '@shared/content/villa';
import { buildVilla, DRIVEWAY_X } from '../../three/villa3d';
import { loadEnvironment, MAT } from '../../three/materials';
import { buildIntroVehicle } from './IntroVehicle';
import { buildIntroCast, type CastControls } from './IntroCharacters';
import { IntroCamera } from './IntroCamera';
import { IntroAudio } from './IntroAudio';
import { IntroLoader } from './IntroLoader';
import { resolveVehicle } from './VehicleSelector';

const ORDER: GameIntroState[] = ['INTRO_START', 'INTRO_CAR', 'INTRO_POINT', 'INTRO_REVEAL', 'INTRO_VILLA', 'GAME_START'];
const LANE_X = DRIVEWAY_X + 1.4; // voie de droite (le véhicule roule vers −z)
const STOP_Z = 34; // arrêt devant le portail
const TRAVEL = 150; // distance parcourue pendant la cinématique (m)
const ROAD_END = 260;

const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

export interface IntroTiming {
  /** ms écoulées depuis le début (horloge serveur) */
  elapsed: number;
  /** dernier état annoncé par le serveur */
  serverState: GameIntroState;
  /** chargement en cours : la cinématique n'a pas commencé */
  loading?: boolean;
}

/** Concilie l'horloge locale (fluide) et l'état serveur (autorité) : on n'est jamais en avance ni en retard d'un état. */
export function reconcile(plan: IntroPlan, t: IntroTiming): { state: GameIntroState; elapsed: number; u: number } {
  const sched = introSchedule(plan.durationMs);
  let elapsed = Math.max(0, t.elapsed);
  const local = introStateAt(plan.durationMs, elapsed);
  const si = ORDER.indexOf(t.serverState);
  const li = ORDER.indexOf(local);
  if (li > si) elapsed = sched[si + 1].at - 1; // le serveur n'a pas encore changé d'état : on tient
  if (si > li) elapsed = sched[si].at; // en retard (onglet en veille, reconnexion) : on rattrape
  const state = t.serverState;
  const i = sched.findIndex((s) => s.state === state);
  const start = sched[i].at;
  const end = sched[i + 1]?.at ?? plan.durationMs;
  return { state, elapsed, u: end > start ? clamp01((elapsed - start) / (end - start)) : 1 };
}

/** Silhouette humaine floue (vue à contre-jour derrière un rideau). */
function silhouetteTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const x = c.getContext('2d')!;
  x.filter = 'blur(6px)';
  x.fillStyle = '#000';
  x.beginPath();
  x.ellipse(64, 58, 20, 25, 0, 0, Math.PI * 2); // tête
  x.fill();
  x.beginPath();
  x.moveTo(38, 92);
  x.quadraticCurveTo(64, 80, 90, 92); // épaules
  x.lineTo(112, 256);
  x.lineTo(16, 256);
  x.closePath();
  x.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class IntroSequence {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(40, 1, 0.05, 600);
  private raf = 0;
  private disposed = false;
  private audio = new IntroAudio();
  private audioStarted = false;
  readonly loader = new IntroLoader();
  private cleanup: (() => void)[] = [];

  constructor(
    host: HTMLElement,
    private plan: IntroPlan,
    private timing: () => IntroTiming,
    private onFade: (black: number) => void,
  ) {
    // lève une exception si WebGL est indisponible → l'écran de repli prend le relais
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = false;
    host.appendChild(this.renderer.domElement);
    const resize = () => {
      const w = host.clientWidth || window.innerWidth;
      const h = host.clientHeight || window.innerHeight;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener('resize', resize);
    this.cleanup.push(() => window.removeEventListener('resize', resize));
  }

  /** Charge (priorité 1 : personnages), construit la scène et lance la boucle. */
  async start(onLoaded?: () => void) {
    this.onFade(1);
    await this.loader.characters(undefined, this.plan.occupants.map((o) => o.character.castId));
    if (this.disposed) return;
    this.build();
    await this.loader.game();
    if (this.disposed) return;
    await this.loader.rest(this.renderer, this.scene, this.camera);
    if (!this.disposed) onLoaded?.();
  }

  private build() {
    const { scene, plan } = this;
    const rand = seededRandom(plan.seed);
    const vehicleDef = resolveVehicle(plan);
    scene.background = new THREE.Color('#03040a');
    const fog = new THREE.FogExp2('#05070d', 0.03);
    scene.fog = fog;
    const hemi = new THREE.HemisphereLight('#6f82b5', '#0a0a10', 0.55);
    scene.add(hemi);
    const moon = new THREE.DirectionalLight('#9fb4e6', 0.45);
    moon.position.set(60, 50, 120);
    scene.add(moon);
    loadEnvironment(this.renderer, scene, 0.25);

    // ── La villa (vue extérieure) et son domaine ──
    const villa = buildVilla({ roof: true, driveway: true });
    scene.add(villa.group);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshStandardMaterial({ color: '#0b120d', roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(DRIVEWAY_X, -0.06, 150);
    scene.add(ground);
    // route mouillée, lignes, bas-côtés
    const roadLen = ROAD_END - 27;
    const road = new THREE.Mesh(new THREE.PlaneGeometry(7, roadLen), new THREE.MeshStandardMaterial({ color: '#17181b', roughness: 0.38, metalness: 0.1 }));
    road.rotation.x = -Math.PI / 2;
    road.position.set(DRIVEWAY_X, 0.01, 27 + roadLen / 2);
    scene.add(road);
    const lineMat = new THREE.MeshStandardMaterial({ color: '#d8d2c0', roughness: 0.6 });
    const dashes = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.14, 3), lineMat, Math.floor(roadLen / 9));
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < dashes.count; i++) {
      m4.makeRotationX(-Math.PI / 2).setPosition(DRIVEWAY_X, 0.02, 30 + i * 9);
      dashes.setMatrixAt(i, m4);
    }
    scene.add(dashes);
    for (const sx of [-1, 1]) {
      const edge = new THREE.Mesh(new THREE.PlaneGeometry(0.12, roadLen), lineMat);
      edge.rotation.x = -Math.PI / 2;
      edge.position.set(DRIVEWAY_X + sx * 3.2, 0.02, 27 + roadLen / 2);
      scene.add(edge);
    }
    // arbres le long de la route (position tirée de la graine commune)
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.32, 3, 6);
    const crownGeo = new THREE.IcosahedronGeometry(2.3, 1);
    const n = 70;
    const trunks = new THREE.InstancedMesh(trunkGeo, MAT.paint('#251a12', 1), n);
    const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshStandardMaterial({ color: '#122217', roughness: 1, flatShading: true }), n);
    const q = new THREE.Quaternion();
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1;
      const z = 44 + (i / 2) * 6 + rand() * 4;
      const x = DRIVEWAY_X + side * (6.5 + rand() * 9);
      const s = 0.8 + rand() * 0.7;
      trunks.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(x, 1.5 * s, z), q, new THREE.Vector3(s, s, s)));
      crowns.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(x, 4.3 * s, z), q, new THREE.Vector3(s, s * 1.15, s)));
    }
    scene.add(trunks, crowns);
    // portail : piliers en brique, lanternes, haies
    for (const sx of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2.3, 0.8), MAT.brick(0.6, 1.6));
      pillar.position.set(DRIVEWAY_X + sx * 4.2, 1.15, 30);
      scene.add(pillar);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 0.3), MAT.glow('#ffd29a', 2.4));
      lamp.position.set(DRIVEWAY_X + sx * 4.2, 2.55, 30);
      scene.add(lamp);
      const l = new THREE.PointLight('#ffb66b', 14, 12, 1.6);
      l.position.set(DRIVEWAY_X + sx * 4.2, 2.5, 30.6);
      scene.add(l);
      const hedgeLen = 30;
      const hedge = new THREE.Mesh(new THREE.BoxGeometry(hedgeLen, 1.1, 0.9), new THREE.MeshStandardMaterial({ color: '#16271a', roughness: 1 }));
      hedge.position.set(DRIVEWAY_X + sx * (4.6 + hedgeLen / 2), 0.55, 30);
      scene.add(hedge);
    }
    // réverbères le long de la route : têtes lumineuses partout, mais seulement deux vraies lampes,
    // déplacées sur les réverbères les plus proches du véhicule (coût constant quel que soit la longueur)
    const postsZ: number[] = [];
    for (let z = 60; z < ROAD_END; z += 32) {
      postsZ.push(z);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 4.5, 8), MAT.paint('#111', 0.5));
      post.position.set(DRIVEWAY_X - 4.2, 2.25, z);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.25), MAT.glow('#ffcf8a', 2.2));
      head.position.set(DRIVEWAY_X - 3.95, 4.5, z);
      scene.add(post, head);
    }
    const streetLights = [0, 1].map(() => {
      const l = new THREE.PointLight('#ffbf78', 18, 16, 1.6);
      scene.add(l);
      return l;
    });
    const placeStreetLights = (carZ: number) => {
      const near = [...postsZ].sort((a, b) => Math.abs(a - carZ) - Math.abs(b - carZ)).slice(0, 2);
      streetLights.forEach((l, i) => l.position.set(DRIVEWAY_X - 3.6, 4.3, near[i] ?? -100));
    };
    const moonDisc = new THREE.Mesh(new THREE.SphereGeometry(3, 24, 16), new THREE.MeshBasicMaterial({ color: '#c8d2e8', fog: false }));
    moonDisc.position.set(WORLD_W / 2 - 90, 60, -120);
    scene.add(moonDisc);

    // ── Fenêtres de la façade : s'allument une à une ; rideaux ; une silhouette ──
    const facade = villa.exteriorWindows.filter((w) => w.z > 20);
    const order = facade.map((w, i) => ({ w, k: rand() + i * 0.001 })).sort((a, b) => a.k - b.k).map((x) => x.w);
    for (const w of facade) {
      (w.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.04;
      for (const s of [-1, 1]) {
        const cur = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 1.2), new THREE.MeshBasicMaterial({ color: '#2a120c', transparent: true, opacity: 0.75 }));
        cur.position.set(s * 0.3, 1.6, 0.006);
        w.mesh.parent!.add(cur);
      }
    }
    // la silhouette apparaît dans une fenêtre du cadre final (près de l'entrée), choisie par la graine commune
    const framed = facade.filter((w) => Math.abs(w.x - DRIVEWAY_X) < 8 && Math.abs(w.x - DRIVEWAY_X) > 1.5);
    const pool = framed.length ? framed : facade;
    const pick = pool.length ? pool[Math.floor(rand() * pool.length)] : null;
    const sil = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.95), new THREE.MeshBasicMaterial({ map: silhouetteTexture(), transparent: true, opacity: 0, depthWrite: false }));
    if (pick) {
      sil.position.set(0, 1.5, 0.005);
      pick.mesh.parent!.add(sil);
    }

    // ── Véhicule et occupants ──
    const vehicle = buildIntroVehicle(vehicleDef);
    const ctl: CastControls = { attention: 0, point: 0 };
    const cast = buildIntroCast(plan, vehicleDef, ctl);
    vehicle.group.add(cast.group);
    vehicle.group.rotation.y = Math.PI; // roule vers la villa (−z)
    scene.add(vehicle.group);

    // ── Pluie autour de la caméra ──
    const N = 2500;
    const pos = new Float32Array(N * 6);
    for (let i = 0; i < N; i++) {
      const x = (rand() - 0.5) * 50;
      const z = (rand() - 0.5) * 50;
      const y = rand() * 24;
      pos.set([x, y, z, x + 0.04, y - 0.6, z + 0.02], i * 6);
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: '#8ea3cc', transparent: true, opacity: 0.25 }));
    rain.frustumCulled = false;
    scene.add(rain);

    const villaFocus = new THREE.Vector3(DRIVEWAY_X, 3, 22.5);
    const cam = new IntroCamera(this.camera, vehicleDef, plan, villaFocus, {
      from: new THREE.Vector3(DRIVEWAY_X - 8, 5.5, STOP_Z + 14),
      to: new THREE.Vector3(DRIVEWAY_X - 4.5, 3.4, STOP_Z + 6),
    });
    const sched = introSchedule(plan.durationMs);
    const at = (s: GameIntroState) => sched.find((x) => x.state === s)!.at;
    const revealAt = at('INTRO_REVEAL');
    const villaAt = at('INTRO_VILLA');
    const lightsDone = villaAt + (plan.durationMs - villaAt) * 0.5;

    // Position du véhicule le long de la route : décélère jusqu'à l'arrêt devant le portail
    const vehicleZ = (e: number) => STOP_Z + TRAVEL * Math.pow(1 - clamp01(e / plan.durationMs), 1.6);

    // Priorités 2 et 3 du chargement : textures/HDR déclenchées ci-dessus, puis shaders
    this.camera.position.set(LANE_X, 1.2, vehicleZ(0));

    // inspection en mode debug (?debug), comme la vue de jeu
    const dbg = (window as unknown as { __ehas?: Record<string, unknown> }).__ehas;
    if (dbg) dbg.intro = { scene, vehicle: vehicle.group, cast, ctl };
    const clock = new THREE.Clock();
    let lastE = -1;
    const loop = () => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, clock.getDelta());
      const timing = this.timing();
      if (!timing.loading && !this.audioStarted) {
        this.audioStarted = true;
        this.audio.start();
      }
      const { state, elapsed: e, u } = reconcile(plan, timing);
      // véhicule
      const z = vehicleZ(e);
      const speed = lastE < 0 ? 0 : Math.max(0, (vehicleZ(lastE) - z) / Math.max(1e-3, (e - lastE) / 1000));
      lastE = e;
      vehicle.group.position.set(LANE_X, 0, z);
      placeStreetLights(z);
      vehicle.update(dt, Math.min(speed, 20));
      // occupants : attention vers la villa, bras du conducteur
      const target = state === 'INTRO_POINT' ? 1 : ORDER.indexOf(state) > ORDER.indexOf('INTRO_POINT') ? 1 : 0;
      ctl.attention += (target - ctl.attention) * Math.min(1, dt * 2.5);
      const pointTarget = state === 'INTRO_POINT' ? (u > 0.12 && u < 0.85 ? 1 : 0) : 0;
      ctl.point += (pointTarget - ctl.point) * Math.min(1, dt * 4);
      cast.update(dt);
      // caméra
      cam.update(state, u, vehicle.group);
      rain.position.set(this.camera.position.x, 0, this.camera.position.z);
      const arr = rg.getAttribute('position').array as Float32Array;
      for (let i = 0; i < arr.length; i += 6) {
        arr[i + 1] -= dt * 20;
        arr[i + 4] -= dt * 20;
        if (arr[i + 4] < 0) {
          arr[i + 1] += 24;
          arr[i + 4] += 24;
        }
      }
      rg.getAttribute('position').needsUpdate = true;
      // villa révélée : brume qui se lève, fenêtres qui s'allument une à une
      const reveal = clamp01((e - revealAt) / (plan.durationMs - revealAt));
      fog.density = 0.03 - 0.018 * smooth(reveal);
      order.forEach((w, i) => {
        const on = revealAt + ((lightsDone - revealAt) * i) / Math.max(1, order.length);
        (w.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.04 + 1.1 * smooth(clamp01((e - on) / 600));
      });
      // silhouette : une seconde à peine, dans le plan villa, puis plus rien
      let silO = 0;
      if (state === 'INTRO_VILLA' && u > 0.38 && u < 0.62) {
        const k = (u - 0.38) / 0.24;
        silO = 0.62 * Math.sin(Math.PI * k);
        sil.position.x = -0.12 + 0.24 * k;
        if (k > 0.05) this.audio.silhouette();
      }
      (sil.material as THREE.MeshBasicMaterial).opacity = silO;
      // fondus
      let black = 0;
      if (state === 'INTRO_START') black = 1 - smooth(clamp01((u - 0.3) / 0.7));
      if (state === 'INTRO_VILLA') black = smooth(clamp01((u - 0.84) / 0.16));
      if (state === 'GAME_START') black = 1;
      this.onFade(black);
      // son
      const outside = state === 'INTRO_REVEAL' ? clamp01((u - 0.2) / 0.2) : ORDER.indexOf(state) > ORDER.indexOf('INTRO_REVEAL') ? 1 : 0;
      this.audio.update(state, speed, outside, u);
      villa.update(clock.elapsedTime);
      this.renderer.render(scene, this.camera);
    };
    loop();
    this.cleanup.push(() => {
      cast.dispose();
      vehicle.dispose();
    });
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.audio.dispose();
    this.loader.dispose();
    for (const c of this.cleanup) c();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
