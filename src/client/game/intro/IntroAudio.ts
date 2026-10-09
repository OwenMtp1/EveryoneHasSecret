/**
 * Son de la cinématique :
 *   Musique          — cue « intro » du directeur musical (audio.ts / music.ts) : piano espacé, nappes,
 *                      repères calés sur les moments clés (route, villa, silhouette, entrée…)
 *   Car ambience     — moteur, régime selon la vitesse
 *   Road ambience    — roulement des pneus (grave, surtout audible dehors)
 *   Character voices — brouhaha et rires indistincts dans l'habitacle (aucune parole)
 * Plus d'autoradio ni de nappe « cinématique » séparée : une seule musique à la fois.
 * Moteur, route et voix passent par le bus EFFETS ; la musique par le bus MUSIQUE.
 */
import type { GameIntroState } from '@shared/content/intro';
import { audio, music, type MusicMark } from '../../audio';

type Layer = 'car' | 'road' | 'voices';

/** Volume de chaque couche par état (dans l'habitacle jusqu'à la révélation). */
const MIX: Record<GameIntroState, Record<Layer, number>> = {
  INTRO_START: { car: 0.1, road: 0.03, voices: 0.03 },
  INTRO_CAR: { car: 0.11, road: 0.035, voices: 0.06 },
  INTRO_POINT: { car: 0.1, road: 0.035, voices: 0.03 },
  INTRO_REVEAL: { car: 0.05, road: 0.09, voices: 0 },
  INTRO_VILLA: { car: 0.03, road: 0.04, voices: 0 },
  GAME_START: { car: 0, road: 0, voices: 0 },
};

/** Repère musical à l'entrée de chaque état. */
export const STATE_MARK: Partial<Record<GameIntroState, MusicMark>> = {
  INTRO_CAR: 'drive',
  INTRO_POINT: 'pointing',
  INTRO_REVEAL: 'villaReveal',
  INTRO_VILLA: 'arrival',
  GAME_START: 'end',
};

export class IntroAudio {
  private ctx: AudioContext | null = null;
  private gains = new Map<Layer, GainNode>();
  private engine: OscillatorNode[] = [];
  private stoppables: AudioScheduledSourceNode[] = [];
  private unregister: (() => void)[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextBeat = 0;
  private state: GameIntroState = 'INTRO_START';
  private marked: GameIntroState | null = null;
  private lastMix = 0;
  private stung = false;
  private entered = false;

  start() {
    // la musique démarre même si l'audio n'est pas encore débloqué (elle entrera au premier geste)
    music.play('intro', { fade: 2.5 });
    const b = audio.buses();
    if (!b) return; // audio non débloqué : pas d'ambiance de voiture
    const { ctx, sfx } = b;
    this.ctx = ctx;
    const mk = (layer: Layer) => {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(sfx);
      this.gains.set(layer, g);
      return g;
    };
    // Car : moteur
    const engLp = ctx.createBiquadFilter();
    engLp.type = 'lowpass';
    engLp.frequency.value = 170;
    engLp.connect(mk('car'));
    for (const [f, type] of [[42, 'sawtooth'], [84, 'square']] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = type === 'square' ? 0.25 : 1;
      o.connect(g).connect(engLp);
      o.start();
      this.engine.push(o);
      this.stoppables.push(o);
    }
    this.unregister.push(audio.registerLoop('intro:engine'));
    // Road : bruit grave filtré en boucle (roulement des pneus, pas de pluie)
    const road = ctx.createBufferSource();
    road.buffer = audio.noiseBuffer(3);
    road.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 260;
    bp.Q.value = 0.8;
    road.connect(bp).connect(mk('road'));
    road.start();
    this.stoppables.push(road);
    this.unregister.push(audio.registerLoop('intro:road'));
    // Voices : sortie seulement ; les syllabes sont planifiées
    mk('voices');
    this.nextBeat = ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 100);
  }

  /** Mixage selon l'état ; `outside` 0 → 1 quand la caméra quitte l'habitacle ; `u` = progression dans l'état. */
  update(state: GameIntroState, speed: number, outside: number, u = 0) {
    this.state = state;
    // repères musicaux (indépendants du déblocage des effets)
    if (state !== this.marked) {
      this.marked = state;
      const m = STATE_MARK[state];
      if (m) music.mark(m);
    }
    if (state === 'INTRO_VILLA' && u > 0.84 && !this.entered) {
      this.entered = true;
      music.mark('enterHouse'); // fondu au noir : on passe la porte
    }
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    if (now - this.lastMix < 0.1) return; // transitions douces : on ne réajuste que 10×/s
    this.lastMix = now;
    const away = 1 - outside * 0.4; // dehors, le moteur s'éloigne
    for (const [layer, g] of this.gains) g.gain.setTargetAtTime(MIX[state][layer] * (layer === 'car' ? away : 1), now, 0.6);
    for (const [i, o] of this.engine.entries()) o.frequency.setTargetAtTime((i + 1) * (34 + speed * 1.6), now, 0.3);
  }

  /** Note discrète au passage de la silhouette (identique pour tous : déclenchée par l'horloge commune). */
  silhouette() {
    if (this.stung) return;
    this.stung = true;
    music.mark('silhouette');
  }

  /** Planification anticipée des voix. */
  private schedule() {
    const ctx = this.ctx;
    if (!ctx) return;
    const spb = 60 / 112;
    while (this.nextBeat < ctx.currentTime + 0.3) {
      if (this.state === 'INTRO_CAR' || this.state === 'INTRO_START' || this.state === 'INTRO_POINT') this.voices(this.nextBeat, spb);
      this.nextBeat += spb;
    }
  }

  private env(t: number, dest: AudioNode, peak: number, attack: number, decay: number) {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(dest);
    return g;
  }

  /** Brouhaha : syllabes de bruit formantique, et de temps en temps un éclat de rire. */
  private voices(t: number, spb: number) {
    const ctx = this.ctx!;
    const out = this.gains.get('voices')!;
    const syllables = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < syllables; i++) {
      const at = t + Math.random() * spb;
      const n = ctx.createBufferSource();
      n.buffer = audio.noiseBuffer(0.4);
      const f1 = ctx.createBiquadFilter();
      f1.type = 'bandpass';
      f1.frequency.value = 450 + Math.random() * 500;
      f1.Q.value = 6;
      const f2 = ctx.createBiquadFilter();
      f2.type = 'bandpass';
      f2.frequency.value = 1100 + Math.random() * 900;
      f2.Q.value = 8;
      const g = this.env(at, out, 0.9, 0.03, 0.12 + Math.random() * 0.15);
      n.connect(f1).connect(g);
      n.connect(f2).connect(g);
      n.start(at);
      n.stop(at + 0.4);
    }
    if (Math.random() < 0.12) {
      // « ha-ha-ha » : rafale d'impulsions
      for (let k = 0; k < 4; k++) {
        const at = t + k * 0.17;
        const n = ctx.createBufferSource();
        n.buffer = audio.noiseBuffer(0.2);
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 900 - k * 60;
        f.Q.value = 5;
        n.connect(f).connect(this.env(at, out, 1.2 - k * 0.2, 0.02, 0.1));
        n.start(at);
        n.stop(at + 0.2);
      }
    }
  }

  /** Arrêt des effets de la cinématique ; la musique, elle, est enchaînée par le directeur (voir App). */
  dispose() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const u of this.unregister) u();
    this.unregister = [];
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const g of this.gains.values()) g.gain.setTargetAtTime(0, now, 0.4);
    const gains = [...this.gains.values()];
    for (const s of this.stoppables) s.stop(now + 2.5);
    this.stoppables[0]?.addEventListener('ended', () => gains.forEach((g) => g.disconnect()), { once: true });
    this.stoppables = [];
    this.engine = [];
    this.gains.clear();
    this.ctx = null;
  }
}
