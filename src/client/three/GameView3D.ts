/**
 * Vue 3D d'une partie. N'affiche QUE ce que le serveur envoie (vue filtrée du joueur).
 *
 * Caméra : troisième personne (défaut) ↔ première personne (touche V).
 * Souris : cliquer dans la vue verrouille le pointeur (Échap pour libérer) ; glisser fonctionne aussi.
 * Molette : distance de la caméra. Les déplacements sont relatifs à la caméra ; le serveur reste autoritaire.
 */
import * as THREE from 'three';
import type { BodyView, GamePlayerView, GameSelfView, ObjectView, TraceView } from '@shared/types';
import { ROOMS, WORLD_H, WORLD_W } from '@shared/content/villa';
import { buildCharacter, type Character3D } from './character3d';
import type { Villa3D } from './villa3d';
import { takeGameVilla } from './prebuilt';
import { labelSprite, emojiSprite } from './sprites';
import { objectModel } from './objects3d';
import { voice } from '../voice';
import { loadEnvironment } from './materials';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { allFurniture, buildWorldGrid, doorAt, elevationAt, localX, stepMove } from '@shared/content/villa';
import { GAME_CONFIG } from '@shared/config';

type CamMode = 'third' | 'first';

interface Actor {
  c3d: Character3D;
  speak?: THREE.Sprite;
  gestureSeq?: number;
  pos: THREE.Vector3;
  rotY: number;
  tag: THREE.Sprite;
  key: string;
  /** objet personnage de la dernière vue (évite de recalculer la clé à chaque image) */
  charRef: unknown;
  /** vitesse lissée (m/s) qui pilote l'animation de marche/course */
  speed: number;
  light?: THREE.SpotLight;
}

/**
 * Niveaux de qualité, ajustés automatiquement selon la fluidité mesurée :
 * 0 = complet · 1 = sans halo, résolution 1× · 2 = sans ombres, résolution réduite, pluie allégée.
 */
const QUALITY = [
  { pixelRatio: 1.5, bloom: true, shadows: true, rain: 1 },
  { pixelRatio: 1, bloom: false, shadows: true, rain: 0.6 },
  { pixelRatio: 0.75, bloom: false, shadows: false, rain: 0.35 },
] as const;
const QUALITY_KEY = 'ehas.quality';

const MOVE_KEYS: Record<string, [number, number]> = {
  KeyW: [0, 1], KeyZ: [0, 1], ArrowUp: [0, 1],
  KeyS: [0, -1], ArrowDown: [0, -1],
  KeyA: [-1, 0], KeyQ: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};

export class GameView3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(62, 1, 0.05, 220);
  private villa: Villa3D;
  private actors = new Map<string, Actor>();
  private bodies = new Map<string, Character3D>();
  private objects = new Map<string, { visual: THREE.Object3D; label: THREE.Sprite; ring: THREE.Mesh; base: THREE.Vector3; modeled: boolean }>();
  private traces = new Map<string, THREE.Mesh>();
  private allyMarkers = new Map<string, THREE.Sprite>();
  private rain: THREE.LineSegments;
  private hemi: THREE.HemisphereLight;
  private moon: THREE.DirectionalLight;
  private selfLight = new THREE.PointLight('#ffd9a8', 2.2, 4.5, 1.4);
  private raycaster = new THREE.Raycaster();
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private grid = buildWorldGrid();
  private clock = new THREE.Clock();
  private raf = 0;
  private view: GameSelfView | null = null;
  private wasBlackout = false;
  private flash = 0;
  private nextLightning = 8;
  private quality = 0;
  private frameTimes: number[] = [];
  private slowWindows = 0;
  private fastWindows = 0;
  private lastFrameAt = performance.now();
  /** position prédite localement de notre personnage (réponse immédiate aux touches) */
  private pred: THREE.Vector3 | null = null;

  mode: CamMode = 'third';
  /** 0 = regarde vers le sud (+z) ; π = vers le nord, l'intérieur de la villa depuis le hall */
  yaw = Math.PI;
  private tpPitch = 0.38;
  private fpPitch = 0;
  private dist = 3.4;
  private pressed = new Set<string>();
  private lastSent = { x: 0, y: 0 };
  private lastSentAt = 0;
  private dragging = false;
  private running = false;
  /** positions reçues du serveur (horodatées à la réception) : les autres joueurs sont affichés
   *  avec un léger différé et interpolés entre deux positions → mouvement continu, sans à-coups */
  private samples = new Map<string, { t: number; x: number; y: number; z: number }[]>();
  onInput: (dx: number, dy: number, run: boolean) => void = () => {};
  /** appelé après la première image (shaders compilés, scène affichée) */
  onFirstFrame: () => void = () => {};
  private framesDrawn = 0;
  onModeChange: (m: CamMode) => void = () => {};
  /** cible d'interaction visée (raycast), notifiée seulement quand elle change */
  onTarget: (key: string | null) => void = () => {};
  private target: string | null = null;
  private lastPick = 0;
  /** plan de découverte du corps (début de partie) : la caméra tourne autour de la victime */
  private reveal: { t0: number; target: THREE.Vector3 } | null = null;
  private revealDone = false;
  private revealTarget: THREE.Vector3 | null = null;

  /** Lance le plan de découverte du corps (appelé quand la cinématique d'arrivée se referme). */
  beginReveal() {
    if (!this.revealTarget) return;
    this.reveal = { t0: performance.now(), target: this.revealTarget };
    this.revealTarget = null;
    this.onReveal(true);
  }
  onReveal: (active: boolean) => void = () => {};

  constructor(private container: HTMLElement, opts: { reducedMotion?: boolean } = {}) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    try {
      this.quality = Math.min(QUALITY.length - 1, Math.max(0, Number(localStorage.getItem(QUALITY_KEY) ?? 0) || 0));
    } catch {
      this.quality = 0;
    }
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.className = 'villa-canvas';
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color('#05070c');
    this.scene.fog = new THREE.FogExp2('#06080e', 0.03);
    this.hemi = new THREE.HemisphereLight('#6d7fa8', '#0b0b10', 0.32);
    this.scene.add(this.hemi);
    // Clair de lune : ombres portées à l'extérieur et à travers les fenêtres
    this.moon = new THREE.DirectionalLight('#8fa6d8', 0.6);
    this.moon.position.set(WORLD_W / 2 - 18, 32, -14);
    this.moon.target.position.set(WORLD_W / 2, 0, WORLD_H / 2);
    this.moon.castShadow = true;
    this.moon.shadow.mapSize.set(1024, 1024);
    Object.assign(this.moon.shadow.camera, { left: -32, right: 32, top: 24, bottom: -24, near: 1, far: 90 });
    this.moon.shadow.bias = -0.0008;
    this.scene.add(this.moon, this.moon.target);
    this.scene.add(new THREE.AmbientLight('#1a1c26', 0.35));
    this.scene.add(this.selfLight);
    loadEnvironment(this.renderer, this.scene, 0.22);

    // Post-traitement : halo léger autour des sources lumineuses
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.55, 0.88);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.villa = takeGameVilla();
    this.scene.add(this.villa.group);
    this.rain = this.buildRain(opts.reducedMotion ? 0 : 2600);
    this.scene.add(this.rain);
    this.applyQuality();

    this.bindInput();
    this.resize();
    // compilation des shaders dès maintenant (masquée par la fin de la cinématique)
    try {
      this.renderer.compile(this.scene, this.camera);
    } catch {
      /* compilé au premier rendu */
    }
    window.addEventListener('resize', this.resize);
    this.raf = requestAnimationFrame(this.loop);
  }

  // ───────────── entrées ─────────────

  private bindInput() {
    const el = this.renderer.domElement;
    el.addEventListener('mousedown', (e) => {
      this.dragging = true;
      if (e.button === 0 && document.pointerLockElement !== el) el.requestPointerLock?.()?.catch?.(() => {});
    });
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    el.addEventListener('wheel', this.onWheel, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private onMouseUp = () => {
    this.dragging = false;
  };

  private onMouseMove = (e: MouseEvent) => {
    const locked = document.pointerLockElement === this.renderer.domElement;
    if (!locked && !this.dragging) return;
    const s = 0.0028;
    this.yaw -= e.movementX * s;
    if (this.mode === 'third') this.tpPitch = THREE.MathUtils.clamp(this.tpPitch + e.movementY * s, -0.15, 1.25);
    else this.fpPitch = THREE.MathUtils.clamp(this.fpPitch - e.movementY * s, -1.3, 1.3);
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (this.mode === 'third') this.dist = THREE.MathUtils.clamp(this.dist + e.deltaY * 0.004, 1.4, 7);
  };

  /** Appelé par l'interface (clavier). Retourne true si la touche est gérée. */
  key(code: string, down: boolean): boolean {
    if (code === 'KeyV' && down) {
      this.toggleMode();
      return true;
    }
    if (code === 'ShiftLeft' || code === 'ShiftRight') {
      this.running = down;
      this.sendInput(true);
      return true;
    }
    if (!MOVE_KEYS[code]) return false;
    if (down) this.pressed.add(code);
    else this.pressed.delete(code);
    this.sendInput(true);
    return true;
  }

  releaseAll() {
    this.pressed.clear();
    this.running = false;
    this.sendInput(true);
  }

  toggleMode() {
    this.mode = this.mode === 'third' ? 'first' : 'third';
    if (this.mode === 'first') this.fpPitch = 0;
    this.onModeChange(this.mode);
  }

  /** Direction monde (x, z) à partir des touches et de l'orientation de la caméra. */
  private sendInput(force = false) {
    let f = 0;
    let r = 0;
    for (const k of this.pressed) {
      f += MOVE_KEYS[k][1];
      r += MOVE_KEYS[k][0];
    }
    let dx = 0;
    let dz = 0;
    if (f || r) {
      const sy = Math.sin(this.yaw);
      const cy = Math.cos(this.yaw);
      // avant = (sin, cos) ; droite = (-cos, sin)
      dx = sy * f - cy * r;
      dz = cy * f + sy * r;
      const len = Math.hypot(dx, dz);
      dx /= len;
      dz /= len;
    }
    dx = Math.round(dx * 100) / 100;
    dz = Math.round(dz * 100) / 100;
    const changed = Math.abs(dx - this.lastSent.x) > 0.06 || Math.abs(dz - this.lastSent.y) > 0.06;
    // au plus ~30 envois/s en tournant la caméra ; l'arrêt (0,0) part toujours immédiatement
    const stop = dx === 0 && dz === 0;
    if (force || (changed && (stop || performance.now() - this.lastSentAt > 33))) {
      this.lastSentAt = performance.now();
      this.lastSent = { x: dx, y: dz };
      this.onInput(dx, dz, this.running);
    }
  }

  // ───────────── données ─────────────

  setView(v: GameSelfView) {
    this.view = v;
    if (!this.revealDone) {
      this.revealDone = true;
      const body = v.bodies.find((b) => b.npc);
      let seen = false;
      try {
        seen = sessionStorage.getItem(`ehas.reveal.${v.gameId}`) === '1';
        sessionStorage.setItem(`ehas.reveal.${v.gameId}`, '1');
      } catch {
        /* stockage indisponible */
      }
      if (body && (v.phase === 'ARRIVAL' || v.phase === 'INVESTIGATION') && v.alive && !seen) this.revealTarget = toRender(body.pos.x, body.pos.y, new THREE.Vector3());
    }
    const t = performance.now();
    for (const p of v.players) {
      if (!p.pos) continue;
      let buf = this.samples.get(p.id);
      if (!buf) this.samples.set(p.id, (buf = []));
      const last = buf[buf.length - 1];
      toRender(p.pos.x, p.pos.y, _tmpR);
      if (last && last.x === _tmpR.x && last.z === _tmpR.z && last.y === _tmpR.y && t - last.t < 400) continue;
      buf.push({ t, x: _tmpR.x, y: _tmpR.y, z: _tmpR.z });
      if (buf.length > 12) buf.shift();
    }
  }

  /** Position interpolée d'un autre joueur, affichée ~150 ms dans le passé. */
  private interpolated(id: string, fallback: THREE.Vector3): THREE.Vector3 {
    const buf = this.samples.get(id);
    if (!buf || !buf.length) return fallback;
    const rt = performance.now() - 150;
    if (rt <= buf[0].t) return _interp.set(buf[0].x, buf[0].y, buf[0].z);
    for (let i = buf.length - 1; i >= 0; i--) {
      const a = buf[i];
      if (a.t <= rt) {
        const b = buf[i + 1];
        if (!b) return _interp.set(a.x, a.y, a.z);
        const k = (rt - a.t) / Math.max(1, b.t - a.t);
        return _interp.set(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k);
      }
    }
    return fallback;
  }

  private lastDt = 0;

  private sync(dt: number) {
    this.lastDt = dt;
    const v = this.view;
    if (!v) return;
    this.villa.setUnlocked(v.unlockedDoors);
    if (v.blackout !== this.wasBlackout) {
      this.villa.setBlackout(v.blackout);
      if (v.blackout) this.flash = 1;
      this.wasBlackout = v.blackout;
    }
    // Les corps d'abord : on sait encore si la victime était visible (chute animée)
    this.syncBodies(v.bodies);
    this.syncPlayers(v.players, dt);
    this.syncObjects(v.objects);
    this.syncTraces(v.traces);
  }

  private syncPlayers(players: GamePlayerView[], dt: number) {
    const seen = new Set<string>();
    for (const p of players) {
      if (!p.alive || !p.pos) continue;
      if (p.viaAlliance) {
        seen.add(`ally:${p.id}`);
        let m = this.allyMarkers.get(p.id);
        if (!m) {
          m = labelSprite(`🛡 ${p.name.split(' ')[0]}`, '#9cc9ff');
          this.allyMarkers.set(p.id, m);
          this.scene.add(m);
        }
        toRender(p.pos.x, p.pos.y, m.position);
        m.position.y += 2.3;
        continue;
      }
      seen.add(p.id);
      let a = this.actors.get(p.id);
      if (a && a.charRef !== p.character) {
        // nouvelle vue : on ne reconstruit que si l'apparence a vraiment changé
        const key = JSON.stringify(p.character);
        if (a.key !== key) {
          this.removeActor(p.id);
          a = undefined;
        } else a.charRef = p.character;
      }
      if (!a) {
        const c3d = buildCharacter(p.character);
        const tag = labelSprite(p.name.split(' ')[0]);
        this.scene.add(c3d.root);
        this.scene.add(tag);
        a = { c3d, pos: toRender(p.pos.x, p.pos.y, new THREE.Vector3()), rotY: p.id === this.view!.you ? this.yaw : 0, tag, key: JSON.stringify(p.character), charRef: p.character, speed: 0 };
        this.actors.set(p.id, a);
      }
      const isMe = p.id === this.view!.you;
      toRender(p.pos.x, p.pos.y, _target);
      _before.copy(a.pos);
      if (isMe) {
        const g = this.predict(p.pos.x, p.pos.y, dt);
        toRender(g.x, g.z, a.pos);
      } else a.pos.copy(this.interpolated(p.id, _target));
      const delta = _delta.copy(a.pos).sub(_before).setY(0);
      const instant = delta.length() / Math.max(dt, 1e-3);
      // téléportation (escalier, reconnexion) : pas d'animation de course
      a.speed += ((instant > 8 ? a.speed : instant) - a.speed) * Math.min(1, dt * 10);
      const speed = a.speed;
      if (isMe && this.mode === 'first') a.rotY = this.yaw;
      else if (instant > 0.3 && instant < 8) a.rotY = lerpAngle(a.rotY, Math.atan2(delta.x, delta.z), Math.min(1, dt * 10));
      a.c3d.root.position.copy(a.pos);
      a.c3d.root.rotation.y = a.rotY;
      if (p.gesture && p.gesture.seq !== a.gestureSeq) {
        a.gestureSeq = p.gesture.seq;
        a.c3d.gesture(p.gesture.kind);
      }
      a.c3d.update(dt, speed);
      a.tag.position.set(a.pos.x, a.pos.y + 2.12, a.pos.z);
      // Indicateur de parole (chat vocal)
      const talking = voice.speaking.has(p.id) && !isMe;
      if (talking && !a.speak) {
        a.speak = emojiSprite('🔊', 0.3);
        this.scene.add(a.speak);
      }
      if (a.speak) {
        a.speak.visible = talking;
        a.speak.position.set(a.pos.x, a.pos.y + 2.38 + Math.sin(this.clock.elapsedTime * 8) * 0.02, a.pos.z);
      }
      a.tag.visible = !isMe;
      (a.tag.material as THREE.SpriteMaterial).color.set(p.stained ? '#ff9a9a' : '#ffffff');
      // Lampe torche
      if (p.hasLight && !a.light) {
        a.light = new THREE.SpotLight('#fff1cf', 18, 12, 0.6, 0.5, 1.2);
        a.light.position.set(0.22, 1.05, 0.3);
        a.light.target.position.set(0, 0.6, 4);
        a.c3d.root.add(a.light, a.light.target);
        // La lampe est visible dans la main
        const torch = objectModel('flashlight');
        if (torch) {
          torch.name = 'torch';
          torch.rotation.y = -Math.PI / 2;
          torch.position.set(0.22, 1.0, 0.18);
          torch.scale.setScalar(1.2);
          a.c3d.root.add(torch);
        }
      }
      if (a.light) {
        a.light.visible = !!p.hasLight;
        const torch = a.c3d.root.getObjectByName('torch');
        if (torch) torch.visible = !!p.hasLight;
      }
    }
    for (const id of [...this.actors.keys()]) if (!seen.has(id)) this.removeActor(id);
    for (const [id, m] of this.allyMarkers)
      if (!seen.has(`ally:${id}`)) {
        this.scene.remove(m);
        this.allyMarkers.delete(id);
      }
  }

  // ───────────── prédiction de notre déplacement ─────────────

  /** Mêmes règles que le serveur (GameInstance.fits) : murs, meubles, portes verrouillées. */
  private passable(x: number, y: number) {
    const g = this.grid;
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= g.w || ty >= g.h) return false;
    const idx = ty * g.w + tx;
    if (!g.rooms[idx] || g.blocked[idx]) return false;
    const door = doorAt(g, tx, ty);
    return !door?.lockedBy || !!this.view?.unlockedDoors.includes(door.id);
  }

  private fits(x: number, y: number) {
    const r = GAME_CONFIG.playerRadius;
    return this.passable(x - r, y - r) && this.passable(x + r, y - r) && this.passable(x - r, y + r) && this.passable(x + r, y + r);
  }
  private fitsFn = (x: number, y: number) => this.fits(x, y);

  /**
   * Notre personnage avance tout de suite (pas d'attente du serveur), puis se recale en douceur
   * sur la position officielle. Écart trop grand (téléportation, collision refusée) → recalage net.
   */
  private predict(sx: number, sy: number, dt: number): THREE.Vector3 {
    // repère de la grille : x = colonne (étage décalé), z = ligne
    _server.set(sx, 0, sy);
    if (!this.pred || !this.view?.alive) return (this.pred = _server.clone());
    const p = this.pred;
    const { x: dx, y: dz } = this.lastSent;
    const moving = Math.hypot(dx, dz) > 0.01;
    if (moving) {
      const len = Math.hypot(dx, dz);
      const sp = this.running ? GAME_CONFIG.runSpeed : GAME_CONFIG.walkSpeed;
      const vx = (dx / len) * sp * dt;
      const vz = (dz / len) * sp * dt;
      // mêmes règles que le serveur (stepMove partagé) : murs, garde-corps, changements de niveau
      _step.x = p.x;
      _step.y = p.z;
      stepMove(_step, vx, vz, this.fitsFn);
      p.set(_step.x, 0, _step.y);
    }
    const err = _server.distanceTo(p);
    if (err > 2) p.copy(_server);
    else if (!moving) p.lerp(_server, Math.min(1, dt * 6));
    // en mouvement, le serveur a toujours un temps de retard : on ne corrige que les vrais écarts
    else if (err > 0.9) p.lerp(_server, Math.min(1, dt * 2));
    return p;
  }

  private removeActor(id: string) {
    const a = this.actors.get(id);
    if (!a) return;
    this.scene.remove(a.c3d.root, a.tag);
    if (a.speak) this.scene.remove(a.speak);
    a.c3d.dispose();
    this.actors.delete(id);
  }

  private syncBodies(bodies: BodyView[]) {
    const seen = new Set<string>();
    for (const b of bodies) {
      seen.add(b.id);
      if (this.bodies.has(b.id)) continue;
      const c3d = buildCharacter(b.character);
      // Si on voyait la victime à l'instant, elle s'effondre sous nos yeux
      const witnessed = this.actors.get(b.playerId);
      c3d.setDead(true, !!witnessed);
      toRender(b.pos.x, b.pos.y, c3d.root.position);
      c3d.root.rotation.y = witnessed ? witnessed.rotY : (b.pos.x * 7) % (Math.PI * 2);
      this.scene.add(c3d.root);
      this.bodies.set(b.id, c3d);
    }
    for (const [, c] of this.bodies) c.update(this.lastDt, 0);
    for (const [id, c] of this.bodies)
      if (!seen.has(id)) {
        this.scene.remove(c.root);
        c.dispose();
        this.bodies.delete(id);
      }
  }

  private syncObjects(objects: ObjectView[]) {
    const seen = new Set<string>();
    for (const o of objects) {
      if (!o.pos) continue;
      seen.add(o.id);
      let e = this.objects.get(o.id);
      const hidden = o.name.endsWith('(caché)');
      if (!e) {
        const model = objectModel(o.type);
        const visual: THREE.Object3D = model ?? emojiSprite(o.icon);
        if (model) model.scale.setScalar(1.6); // lisibilité en jeu
        const label = labelSprite(`${o.icon} ${o.name}`, '#ffe2b0');
        label.scale.multiplyScalar(0.8);
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.25, 32), new THREE.MeshBasicMaterial({ color: '#ffcf88', transparent: true, opacity: 0.5, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2;
        this.scene.add(visual, ring, label);
        e = { visual, label, ring, base: new THREE.Vector3(), modeled: !!model };
        this.objects.set(o.id, e);
      }
      // Objet caché (connu) : posé dans le meuble, à mi-hauteur
      toRender(o.pos.x, o.pos.y, e.base);
      const fy = e.base.y;
      e.base.y += hidden ? 0.5 : e.modeled ? 0.012 : 0.75;
      e.ring.position.set(e.base.x, fy + 0.015, e.base.z);
      e.label.position.set(e.base.x, fy + (hidden ? 0.5 : 0) + 0.6, e.base.z);
      (e.ring.material as THREE.MeshBasicMaterial).color.set(o.bloody ? '#ff3344' : '#ffcf88');
    }
    for (const [id, e] of this.objects)
      if (!seen.has(id)) {
        this.scene.remove(e.visual, e.ring, e.label);
        this.objects.delete(id);
      }
  }

  private syncTraces(traces: TraceView[]) {
    const seen = new Set<string>();
    for (const t of traces) {
      seen.add(t.id);
      if (this.traces.has(t.id)) continue;
      let mesh: THREE.Mesh;
      if (t.kind === 'footprint') {
        mesh = new THREE.Mesh(new THREE.CircleGeometry(0.07, 12), new THREE.MeshBasicMaterial({ color: '#2a1a0e', transparent: true, opacity: 0.75, depthWrite: false }));
        mesh.scale.set(0.8, 1.7, 1);
      } else if (t.kind === 'blood_pool') {
        mesh = new THREE.Mesh(new THREE.CircleGeometry(0.55, 24), new THREE.MeshStandardMaterial({ color: '#5a0610', roughness: 0.15, transparent: true, opacity: 0.92, depthWrite: false }));
        mesh.scale.set(1.3, 0.9, 1);
      } else if (t.kind === 'ashes') {
        mesh = new THREE.Mesh(new THREE.CircleGeometry(0.18, 12), new THREE.MeshBasicMaterial({ color: '#7a7a7a', transparent: true, opacity: 0.8, depthWrite: false }));
      } else {
        mesh = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.28, 24), new THREE.MeshBasicMaterial({ color: t.kind === 'diluted_blood' ? '#ff5060' : '#c8d0e0', transparent: true, opacity: 0.8, depthWrite: false }));
      }
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.z = (t.pos.x * 13) % 3;
      toRender(t.pos.x, t.pos.y, mesh.position);
      mesh.position.y += 0.012 + this.traces.size * 0.00001;
      this.scene.add(mesh);
      this.traces.set(t.id, mesh);
    }
    for (const [id, m] of this.traces)
      if (!seen.has(id)) {
        this.scene.remove(m);
        this.traces.delete(id);
      }
  }

  // ───────────── caméra ─────────────

  private updateCamera() {
    const v = this.view;
    const me = v ? this.actors.get(v.you) : undefined;
    if (this.reveal) {
      const k = (performance.now() - this.reveal.t0) / 1000;
      if (k > 6 || this.pressed.size) {
        this.reveal = null;
        this.onReveal(false);
      } else {
        const a = 0.6 + k * 0.32;
        const r = 3.4 - k * 0.25;
        this.camera.position.set(this.reveal.target.x + Math.cos(a) * r, this.reveal.target.y + 2.1 - k * 0.12, this.reveal.target.z + Math.sin(a) * r);
        this.camera.lookAt(this.reveal.target.x, this.reveal.target.y + 0.2, this.reveal.target.z);
        return;
      }
    }
    const spectator = !v || !v.alive || !!v.epilogue || !me;
    if (spectator) {
      // Vue plongeante lente autour de la villa
      const t = this.clock.elapsedTime * 0.04;
      this.camera.position.set(WORLD_W / 2 + Math.sin(t) * 26, 26, WORLD_H / 2 + Math.cos(t) * 22);
      this.camera.lookAt(WORLD_W / 2, 0, WORLD_H / 2);
      return;
    }
    const head = me.pos.clone().add(new THREE.Vector3(0, 1.62, 0));
    if (this.mode === 'first') {
      me.c3d.setVisibleBody(false);
      const dir = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.fpPitch), Math.sin(this.fpPitch), Math.cos(this.yaw) * Math.cos(this.fpPitch));
      this.camera.position.copy(head).add(new THREE.Vector3(Math.sin(this.yaw) * 0.12, 0, Math.cos(this.yaw) * 0.12));
      this.camera.lookAt(this.camera.position.clone().add(dir));
      this.selfLight.position.copy(head);
      return;
    }
    const target = me.pos.clone().add(new THREE.Vector3(0, 1.45, 0));
    const offset = new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.tpPitch), Math.sin(this.tpPitch), -Math.cos(this.yaw) * Math.cos(this.tpPitch));
    // Collision : la caméra ne traverse pas les murs
    this.raycaster.set(target, offset);
    this.raycaster.far = this.dist;
    const hit = this.raycaster.intersectObjects(this.villa.colliders, false)[0];
    const d = hit ? Math.max(0.35, hit.distance - 0.25) : this.dist;
    this.camera.position.copy(target).addScaledVector(offset, d);
    this.camera.position.y = Math.max(me.pos.y + 0.3, this.camera.position.y);
    this.camera.lookAt(target);
    me.c3d.setVisibleBody(d > 0.75);
    this.selfLight.position.copy(head);
  }

  // ───────────── boucle ─────────────

  private buildRain(count: number) {
    // extérieurs du rez-de-chaussée, au prorata de leur surface (les cabanes sont dans le verger)
    const outdoor = ROOMS.filter((r) => r.outdoor && !r.level);
    const area = outdoor.reduce((s, r) => s + r.rect.w * r.rect.h, 0);
    const pos = new Float32Array(count * 6);
    for (let i = 0; i < count; i++) {
      let k = Math.random() * area;
      const r = (outdoor.find((o) => (k -= o.rect.w * o.rect.h) < 0) ?? outdoor[0]).rect;
      const x = r.x + Math.random() * r.w;
      const z = r.y + Math.random() * r.h;
      const y = Math.random() * 12;
      pos.set([x, y, z, x + 0.02, y - 0.35, z + 0.01], i * 6);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#9fb4dc', transparent: true, opacity: 0.35 }));
  }

  private updateRain(dt: number) {
    const a = this.rain.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = a.array as Float32Array;
    for (let i = 0; i < arr.length; i += 6) {
      arr[i + 1] -= dt * 14;
      arr[i + 4] -= dt * 14;
      if (arr[i + 4] < 0) {
        arr[i + 1] += 12;
        arr[i + 4] += 12;
      }
    }
    a.needsUpdate = true;
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    if (this.pressed.size) this.sendInput();
    this.sync(dt);
    const mePos = this.view ? this.actors.get(this.view.you)?.pos : undefined;
    for (const [, o] of this.objects) {
      o.visual.position.copy(o.base);
      if (!o.modeled) o.visual.position.y += Math.sin(t * 2 + o.base.x) * 0.05;
      (o.ring.material as THREE.MeshBasicMaterial).opacity = 0.3 + Math.sin(t * 3 + o.base.x) * 0.2;
      o.label.visible = !!mePos && Math.hypot(mePos.x - o.base.x, mePos.z - o.base.z) < 2.6 && Math.abs(mePos.y - o.base.y) < 2;
    }
    // Étiquettes proches : empilées pour rester lisibles
    const shown = [...this.objects.values()].filter((o) => o.label.visible).sort((a, b) => a.base.x - b.base.x || a.base.z - b.base.z);
    shown.forEach((o, i) => {
      const stack = shown.slice(0, i).filter((p) => Math.hypot(p.base.x - o.base.x, p.base.z - o.base.z) < 1.2).length;
      o.label.position.y = o.base.y + 0.55 + stack * 0.2;
    });
    this.villa.update(t);
    this.updateRain(dt);
    // Éclairs
    if (t > this.nextLightning) {
      this.flash = 0.6 + Math.random() * 0.4;
      this.nextLightning = t + 10 + Math.random() * 18;
    }
    this.trackPerformance();
    const blackout = this.view?.blackout;
    this.hemi.intensity = (blackout ? 0.06 : 0.32) + this.flash * 2.2;
    this.moon.intensity = (blackout ? 0.18 : 0.6) + this.flash * 1.8;
    this.selfLight.intensity = blackout ? 0.8 : 2.2;
    this.flash = Math.max(0, this.flash - dt * 4);
    this.updateCamera();
    if (t - this.lastPick > 0.1) {
      this.lastPick = t;
      const k = this.pickTarget();
      if (k !== this.target) {
        this.target = k;
        this.onTarget(k);
      }
    }
    // Ombres de la lampe de la pièce où l'on se trouve
    const me = this.view ? this.actors.get(this.view.you) : undefined;
    const meView = this.view?.players.find((p) => p.id === this.view!.you);
    if (me) this.villa.focus(me.pos.x, me.pos.z, meView?.roomId, me.pos.y);
    else this.villa.focus(this.camera.position.x, this.camera.position.z);
    if (QUALITY[this.quality].bloom) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
    if (++this.framesDrawn === 2) this.onFirstFrame();
  };

  // ───────────── cible d'interaction (raycast) ─────────────

  /**
   * Une seule cible à la fois : le rayon partant du centre de l'écran touche le volume d'interaction
   * le plus proche (objets, corps, joueurs, meubles utiles, traces) ; les murs l'arrêtent. À défaut,
   * la cible la plus proche dans un cône étroit devant le personnage, à vue directe.
   * Seules les cibles à portée d'interaction du personnage (même pièce) sont candidates.
   */
  private pickTarget(): string | null {
    const v = this.view;
    const me = v ? this.actors.get(v.you) : undefined;
    const meV = v?.players.find((p) => p.id === v.you);
    if (!v || !me || !meV?.pos || !v.alive || v.epilogue || v.arrested.includes(v.you)) return null;
    const R = GAME_CONFIG.interactRange;
    const near = (x: number, y: number, extra = 0) => Math.hypot(x - meV.pos!.x, y - meV.pos!.y) <= R + extra;
    const cands: { key: string; c: THREE.Vector3; r: number }[] = [];
    const at = (x: number, y: number, h: number) => toRender(x, y, new THREE.Vector3()).add(new THREE.Vector3(0, h, 0));
    for (const o of v.objects) if (o.pos && o.roomId === meV.roomId && near(o.pos.x, o.pos.y, o.name.endsWith(')') ? 1.6 : 0.6)) cands.push({ key: `o:${o.id}`, c: at(o.pos.x, o.pos.y, 0.15), r: 0.32 });
    for (const b of v.bodies) if (b.roomId === meV.roomId && near(b.pos.x, b.pos.y, 0.6)) cands.push({ key: `b:${b.id}`, c: at(b.pos.x, b.pos.y, 0.2), r: 0.75 });
    for (const p of v.players)
      if (p.id !== v.you && p.alive && p.pos && !p.viaAlliance && p.roomId === meV.roomId && near(p.pos.x, p.pos.y, 0.4)) cands.push({ key: `p:${p.id}`, c: at(p.pos.x, p.pos.y, 1.0), r: 0.45 });
    for (const f of allFurniture()) {
      if (f.roomId !== meV.roomId || !(f.hiding || f.kind === 'sink' || f.kind === 'fireplace')) continue;
      const cx = Math.max(f.x, Math.min(meV.pos.x, f.x + f.w));
      const cy = Math.max(f.y, Math.min(meV.pos.y, f.y + f.h));
      if (Math.hypot(cx - meV.pos.x, cy - meV.pos.y) > R) continue;
      cands.push({ key: `f:${f.id}`, c: at(f.x + f.w / 2, f.y + f.h / 2, 0.55), r: Math.max(0.45, Math.min(1.1, Math.max(f.w, f.h) * 0.55)) });
    }
    if (v.inventory.some((o) => o.type === 'cloth'))
      for (const t of v.traces) if (t.roomId === meV.roomId && near(t.pos.x, t.pos.y, 0.4)) cands.push({ key: `t:${t.id}`, c: at(t.pos.x, t.pos.y, 0.05), r: 0.3 });
    if (!cands.length) return null;
    const occluded = (from: THREE.Vector3, to: THREE.Vector3) => {
      const dir = to.clone().sub(from);
      const d = dir.length();
      this.raycaster.set(from, dir.normalize());
      this.raycaster.far = Math.max(0.01, d - 0.2);
      return this.raycaster.intersectObjects(this.villa.colliders, false).length > 0;
    };
    // 1) rayon du centre de l'écran
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const ray = this.raycaster.ray.clone();
    let best: { key: string; t: number } | null = null;
    for (const c of cands) {
      const toC = c.c.clone().sub(ray.origin);
      const t = toC.dot(ray.direction);
      if (t < 0) continue;
      const dist2 = toC.lengthSq() - t * t;
      if (dist2 > c.r * c.r) continue;
      if (!best || t < best.t) best = { key: c.key, t };
    }
    if (best) {
      const hit = cands.find((c) => c.key === best!.key)!;
      if (!occluded(this.camera.position.clone(), hit.c)) return best.key;
    }
    // 2) repli : devant le personnage (cône de 40°), le plus proche, sans mur entre les deux
    const eye = me.pos.clone().add(new THREE.Vector3(0, 1.5, 0));
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    let fb: { key: string; d: number } | null = null;
    for (const c of cands) {
      const flat = c.c.clone().sub(me.pos).setY(0);
      const d = flat.length();
      if (d > 0.35 && flat.normalize().dot(fwd) < Math.cos(THREE.MathUtils.degToRad(40))) continue;
      if (occluded(eye, c.c)) continue;
      if (!fb || d < fb.d) fb = { key: c.key, d };
    }
    return fb?.key ?? null;
  }

  // ───────────── qualité adaptative ─────────────

  private applyQuality() {
    const q = QUALITY[this.quality];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    if (this.renderer.shadowMap.enabled !== q.shadows) {
      this.renderer.shadowMap.enabled = q.shadows;
      this.scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        if (m) for (const x of Array.isArray(m) ? m : [m]) x.needsUpdate = true;
      });
    }
    this.moon.castShadow = q.shadows;
    this.villa.setShadows(q.shadows);
    this.rain.geometry.setDrawRange(0, Math.floor((this.rain.geometry.getAttribute('position').count * q.rain) / 2) * 2);
    this.resize();
  }

  /**
   * Fenêtres de 2 s : si l'image dépasse ~28 ms en moyenne deux fois de suite, on baisse d'un cran ;
   * si tout reste très fluide (< 12 ms) pendant 10 s, on remonte d'un cran.
   */
  private trackPerformance() {
    const now = performance.now();
    const dt = (now - this.lastFrameAt) / 1000; // durée réelle (non bornée) de l'image
    this.lastFrameAt = now;
    if (document.hidden || dt > 1) return; // onglet en arrière-plan : mesure ignorée
    this.frameTimes.push(dt);
    const total = this.frameTimes.reduce((a, b) => a + b, 0);
    if (total < 2) return;
    const avg = total / this.frameTimes.length;
    this.frameTimes = [];
    this.slowWindows = avg > 0.028 ? this.slowWindows + 1 : 0;
    this.fastWindows = avg < 0.012 ? this.fastWindows + 1 : 0;
    const next = this.slowWindows >= 2 ? this.quality + 1 : this.fastWindows >= 5 ? this.quality - 1 : this.quality;
    if (next !== this.quality && next >= 0 && next < QUALITY.length) {
      this.quality = next;
      this.slowWindows = 0;
      this.fastWindows = 0;
      try {
        localStorage.setItem(QUALITY_KEY, String(this.quality));
      } catch {
        /* stockage indisponible */
      }
      this.applyQuality();
    }
  }

  private resize = () => {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  /** À appeler quand le conteneur change de taille. */
  refreshSize() {
    this.resize();
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock();
    for (const id of [...this.actors.keys()]) this.removeActor(id);
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
    });
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

const _target = new THREE.Vector3();
const _step = { x: 0, y: 0 };
const _tmpR = new THREE.Vector3();
const _server = new THREE.Vector3();

/** Position serveur (grille, étage décalé) → position 3D (étage replacé au-dessus, hauteur de l'escalier). */
function toRender(x: number, y: number, out: THREE.Vector3): THREE.Vector3 {
  return out.set(localX(x), elevationAt(x, y), y);
}
const _interp = new THREE.Vector3();
const _before = new THREE.Vector3();
const _delta = new THREE.Vector3();

function lerpAngle(a: number, b: number, t: number) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
