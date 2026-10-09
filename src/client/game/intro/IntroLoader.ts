/**
 * Chargement AVANT la cinématique (le serveur attend que tous les joueurs aient fini), par priorité :
 *   1. modèles des personnages + animations
 *   2. villa de la partie, construite à l'avance (la partie s'affichera sans attente)
 *   3. textures de la villa et environnement HDR (mis en cache, partagés avec la partie)
 *   4. compilation des shaders de la scène de la cinématique
 */
import * as THREE from 'three';
import { preloadCast } from '../../three/cast3d';
import { prebuildGameVilla } from '../../three/prebuilt';

export interface LoadStep {
  id: 'characters' | 'game' | 'textures' | 'shaders';
  label: string;
  done: boolean;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class IntroLoader {
  readonly steps: LoadStep[] = [
    { id: 'characters', label: 'Personnages', done: false },
    { id: 'game', label: 'Villa et partie', done: false },
    { id: 'textures', label: 'Textures', done: false },
    { id: 'shaders', label: 'Rendu', done: false },
  ];
  private pending = 0;
  private texturesIdle: Promise<void>;
  private resolveIdle!: () => void;
  private prev: Pick<THREE.LoadingManager, 'onStart' | 'onLoad' | 'onProgress' | 'onError'>;
  readonly ready: Promise<void>;
  private settle!: () => void;

  constructor() {
    const m = THREE.DefaultLoadingManager;
    this.prev = { onStart: m.onStart, onLoad: m.onLoad, onProgress: m.onProgress, onError: m.onError };
    this.texturesIdle = new Promise((r) => (this.resolveIdle = r));
    // suivi des chargements de textures/HDR qui passent par le gestionnaire par défaut de three.js
    m.onStart = (url, loaded, total) => {
      this.pending = total - loaded;
      this.prev.onStart?.(url, loaded, total);
    };
    m.onProgress = (url, loaded, total) => {
      this.pending = total - loaded;
      this.prev.onProgress?.(url, loaded, total);
    };
    m.onLoad = () => {
      this.pending = 0;
      this.resolveIdle();
      this.prev.onLoad?.();
    };
    this.ready = new Promise((r) => (this.settle = r));
  }

  private mark(id: LoadStep['id']) {
    this.steps.find((s) => s.id === id)!.done = true;
  }

  /** Priorité 1 : les personnages (délai max avant repli procédural). */
  async characters(maxMs = 20000, castIds: (string | undefined)[] = []) {
    // modèles réalistes génériques + personnages du catalogue présents dans le véhicule
    await Promise.race([preloadCast(castIds), wait(maxMs)]);
    this.mark('characters');
  }

  /** Priorité 2 : la villa de la partie, construite maintenant pour être affichée sans attente ensuite. */
  async game() {
    await wait(30); // laisse l'écran de chargement se peindre
    prebuildGameVilla();
    this.mark('game');
  }

  /** Priorités 3 et 4, une fois les scènes construites. */
  async rest(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, maxMs = 12000) {
    const textures = (async () => {
      // rien en cours → déjà en cache
      if (this.pending > 0) await this.texturesIdle;
      this.mark('textures');
    })();
    const shaders = (async () => {
      try {
        // compilation synchrone pendant l'écran de chargement : compileAsync continue de sonder les
        // programmes après coup et lève une erreur si la scène est libérée entre-temps (three r170)
        await new Promise((r) => requestAnimationFrame(r));
        renderer.compile(scene, camera);
      } catch {
        /* compilation à la volée au premier rendu */
      }
      this.mark('shaders');
    })();
    await Promise.race([Promise.all([textures, shaders]), wait(maxMs)]);
    this.settle();
  }

  progress() {
    return this.steps.filter((s) => s.done).length / this.steps.length;
  }

  dispose() {
    Object.assign(THREE.DefaultLoadingManager, this.prev);
    this.settle();
  }
}
