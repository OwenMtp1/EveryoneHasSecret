/**
 * Chargement masqué par la cinématique, par ordre de priorité :
 *   1. modèles des personnages + animations (nécessaires dès le premier plan)
 *   2. textures de la villa et de l'environnement HDR (déclenchées par la construction de la scène,
 *      mises en cache → la villa du jeu les retrouve déjà prêtes)
 *   3. compilation des shaders de la scène
 * La partie ne s'affiche qu'une fois ce chargement fini (ou après un délai de sécurité).
 */
import * as THREE from 'three';
import { preloadRealistic } from '../../three/realistic';

export interface LoadStep {
  id: 'characters' | 'textures' | 'shaders';
  label: string;
  done: boolean;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class IntroLoader {
  readonly steps: LoadStep[] = [
    { id: 'characters', label: 'Personnages', done: false },
    { id: 'textures', label: 'Villa', done: false },
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
  async characters(maxMs = 5000) {
    await Promise.race([preloadRealistic(), wait(maxMs)]);
    this.mark('characters');
  }

  /** Priorités 2 et 3, une fois la scène construite. */
  async rest(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, maxMs = 12000) {
    const textures = (async () => {
      // rien en cours → déjà en cache
      if (this.pending > 0) await this.texturesIdle;
      this.mark('textures');
    })();
    const shaders = (async () => {
      try {
        await renderer.compileAsync(scene, camera);
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
