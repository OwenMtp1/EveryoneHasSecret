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
import { buildVilla, type Villa3D } from './villa3d';
import { labelSprite, emojiSprite } from './sprites';
import { realisticReady } from './realistic';
import { objectModel } from './objects3d';
import { voice } from '../voice';

type CamMode = 'third' | 'first';

interface Actor {
  c3d: Character3D;
  speak?: THREE.Sprite;
  gestureSeq?: number;
  pos: THREE.Vector3;
  rotY: number;
  tag: THREE.Sprite;
  key: string;
  light?: THREE.SpotLight;
}

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
  private clock = new THREE.Clock();
  private raf = 0;
  private view: GameSelfView | null = null;
  private wasBlackout = false;
  private flash = 0;
  private nextLightning = 8;

  mode: CamMode = 'third';
  /** 0 = regarde vers le sud (+z) ; π = vers le nord, l'intérieur de la villa depuis le hall */
  yaw = Math.PI;
  private tpPitch = 0.38;
  private fpPitch = 0;
  private dist = 3.4;
  private pressed = new Set<string>();
  private lastSent = { x: 0, y: 0 };
  private dragging = false;
  onInput: (dx: number, dy: number) => void = () => {};
  onModeChange: (m: CamMode) => void = () => {};

  constructor(private container: HTMLElement, opts: { reducedMotion?: boolean } = {}) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.className = 'villa-canvas';
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color('#05070c');
    this.scene.fog = new THREE.FogExp2('#06080e', 0.045);
    this.hemi = new THREE.HemisphereLight('#6d7fa8', '#0b0b10', 0.55);
    this.scene.add(this.hemi);
    this.moon = new THREE.DirectionalLight('#8fa6d8', 0.5);
    this.moon.position.set(WORLD_W / 2 - 20, 30, -10);
    this.scene.add(this.moon);
    this.scene.add(new THREE.AmbientLight('#1a1c26', 0.6));
    this.scene.add(this.selfLight);

    this.villa = buildVilla();
    this.scene.add(this.villa.group);
    this.rain = this.buildRain(opts.reducedMotion ? 0 : 2600);
    this.scene.add(this.rain);

    this.bindInput();
    this.resize();
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
    if (!MOVE_KEYS[code]) return false;
    if (down) this.pressed.add(code);
    else this.pressed.delete(code);
    this.sendInput(true);
    return true;
  }

  releaseAll() {
    this.pressed.clear();
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
    if (force || Math.abs(dx - this.lastSent.x) > 0.06 || Math.abs(dz - this.lastSent.y) > 0.06) {
      this.lastSent = { x: dx, y: dz };
      this.onInput(dx, dz);
    }
  }

  // ───────────── données ─────────────

  setView(v: GameSelfView) {
    this.view = v;
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
        m.position.set(p.pos.x, 2.3, p.pos.y);
        continue;
      }
      seen.add(p.id);
      const key = `${JSON.stringify(p.character)}|${realisticReady()}`;
      let a = this.actors.get(p.id);
      if (a && a.key !== key) {
        this.removeActor(p.id);
        a = undefined;
      }
      if (!a) {
        const c3d = buildCharacter(p.character);
        const tag = labelSprite(p.name.split(' ')[0]);
        this.scene.add(c3d.root);
        this.scene.add(tag);
        a = { c3d, pos: new THREE.Vector3(p.pos.x, 0, p.pos.y), rotY: p.id === this.view!.you ? this.yaw : 0, tag, key };
        this.actors.set(p.id, a);
      }
      const target = new THREE.Vector3(p.pos.x, 0, p.pos.y);
      if (a.pos.distanceTo(target) > 3) a.pos.copy(target);
      const before = a.pos.clone();
      a.pos.lerp(target, Math.min(1, dt * 12));
      const delta = a.pos.clone().sub(before);
      const speed = delta.length() / Math.max(dt, 1e-3);
      const isMe = p.id === this.view!.you;
      if (isMe && this.mode === 'first') a.rotY = this.yaw;
      else if (speed > 0.3) a.rotY = lerpAngle(a.rotY, Math.atan2(delta.x, delta.z), Math.min(1, dt * 12));
      a.c3d.root.position.copy(a.pos);
      a.c3d.root.rotation.y = a.rotY;
      if (p.gesture && p.gesture.seq !== a.gestureSeq) {
        a.gestureSeq = p.gesture.seq;
        a.c3d.gesture(p.gesture.kind);
      }
      a.c3d.update(dt, speed);
      a.tag.position.set(a.pos.x, 2.12, a.pos.z);
      // Indicateur de parole (chat vocal)
      const talking = voice.speaking.has(p.id) && !isMe;
      if (talking && !a.speak) {
        a.speak = emojiSprite('🔊', 0.3);
        this.scene.add(a.speak);
      }
      if (a.speak) {
        a.speak.visible = talking;
        a.speak.position.set(a.pos.x, 2.38 + Math.sin(this.clock.elapsedTime * 8) * 0.02, a.pos.z);
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
      c3d.root.position.set(b.pos.x, 0, b.pos.y);
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
      e.base.set(o.pos.x, hidden ? 0.5 : e.modeled ? 0.012 : 0.75, o.pos.y);
      e.ring.position.set(o.pos.x, 0.015, o.pos.y);
      e.label.position.set(o.pos.x, (hidden ? 0.5 : 0) + 0.6, o.pos.y);
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
      mesh.position.set(t.pos.x, 0.012 + this.traces.size * 0.00001, t.pos.y);
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
    this.camera.position.y = Math.max(0.3, this.camera.position.y);
    this.camera.lookAt(target);
    me.c3d.setVisibleBody(d > 0.75);
    this.selfLight.position.copy(head);
  }

  // ───────────── boucle ─────────────

  private buildRain(count: number) {
    const outdoor = ROOMS.filter((r) => r.outdoor);
    const pos = new Float32Array(count * 6);
    for (let i = 0; i < count; i++) {
      const r = outdoor[i % outdoor.length].rect;
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
      o.label.visible = !!mePos && mePos.distanceTo(new THREE.Vector3(o.base.x, 0, o.base.z)) < 2.6;
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
    const blackout = this.view?.blackout;
    this.hemi.intensity = (blackout ? 0.08 : 0.55) + this.flash * 2.2;
    this.moon.intensity = (blackout ? 0.12 : 0.5) + this.flash * 1.5;
    this.selfLight.intensity = blackout ? 0.8 : 2.2;
    this.flash = Math.max(0, this.flash - dt * 4);
    this.updateCamera();
    this.renderer.render(this.scene, this.camera);
  };

  private resize = () => {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
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
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

function lerpAngle(a: number, b: number, t: number) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
