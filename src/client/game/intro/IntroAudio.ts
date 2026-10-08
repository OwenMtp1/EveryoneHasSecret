/**
 * Son de la cinématique, en couches indépendantes mixées selon l'état :
 *   Music            — groove de soirée à l'autoradio (net dans l'habitacle, étouffé dehors)
 *   Car ambience     — moteur, régime selon la vitesse
 *   Road ambience    — roulement des pneus (surtout audible dehors)
 *   Character voices — brouhaha et rires indistincts dans l'habitacle (aucune parole)
 *   Cinematic sounds — nappe grave à la révélation, frisson quasi imperceptible pour la silhouette
 * Tout est synthétisé (Web Audio) ; de vrais enregistrements pourront remplacer chaque couche.
 */
import type { GameIntroState } from '@shared/content/intro';
import { audio } from '../../audio';

type Layer = 'music' | 'car' | 'road' | 'voices' | 'cinematic';

/** Volume de chaque couche par état (dans l'habitacle jusqu'à la révélation). */
const MIX: Record<GameIntroState, Record<Layer, number>> = {
  INTRO_START: { music: 0.22, car: 0.1, road: 0.03, voices: 0.03, cinematic: 0 },
  INTRO_CAR: { music: 0.32, car: 0.11, road: 0.035, voices: 0.06, cinematic: 0 },
  INTRO_POINT: { music: 0.24, car: 0.1, road: 0.035, voices: 0.03, cinematic: 0.02 },
  INTRO_REVEAL: { music: 0.12, car: 0.05, road: 0.12, voices: 0, cinematic: 0.08 },
  INTRO_VILLA: { music: 0.05, car: 0.03, road: 0.05, voices: 0, cinematic: 0.12 },
  GAME_START: { music: 0, car: 0, road: 0, voices: 0, cinematic: 0 },
};

const CHORDS = [
  [110, 130.8, 164.8], // la mineur
  [87.3, 110, 130.8], // fa
  [130.8, 164.8, 196], // do
  [98, 123.5, 146.8], // sol
];

export class IntroAudio {
  private ctx: AudioContext | null = null;
  private gains = new Map<Layer, GainNode>();
  private musicFilter: BiquadFilterNode | null = null;
  private engine: OscillatorNode[] = [];
  private stoppables: (AudioScheduledSourceNode | null)[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextBeat = 0;
  private beat = 0;
  private state: GameIntroState = 'INTRO_START';
  private lastMix = 0;
  private stung = false;

  start() {
    const b = audio.buses();
    if (!b) return; // audio non débloqué : la cinématique reste muette
    const { ctx, music, sfx } = b;
    this.ctx = ctx;
    const mk = (layer: Layer, dest: AudioNode) => {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(dest);
      this.gains.set(layer, g);
      return g;
    };
    // Music : groove → filtre (autoradio / entendu de dehors)
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 2600;
    this.musicFilter.connect(mk('music', music));
    // Car : moteur
    const engLp = ctx.createBiquadFilter();
    engLp.type = 'lowpass';
    engLp.frequency.value = 170;
    engLp.connect(mk('car', sfx));
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
    // Road : bruit filtré en boucle
    const road = ctx.createBufferSource();
    road.buffer = audio.noiseBuffer(3);
    road.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 320;
    bp.Q.value = 0.6;
    road.connect(bp).connect(mk('road', sfx));
    road.start();
    this.stoppables.push(road);
    // Voices : sortie seulement ; les syllabes sont planifiées
    mk('voices', sfx);
    // Cinematic : nappe grave
    const cine = mk('cinematic', music);
    for (const f of [55, 55.35, 82.4]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      o.connect(cine);
      o.start();
      this.stoppables.push(o);
    }
    this.nextBeat = ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 100);
  }

  /** Mixage selon l'état ; `outside` 0 → 1 quand la caméra quitte l'habitacle. */
  update(state: GameIntroState, speed: number, outside: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    this.state = state;
    const now = ctx.currentTime;
    if (now - this.lastMix < 0.1) return; // transitions douces : on ne réajuste que 10×/s
    this.lastMix = now;
    for (const [layer, g] of this.gains) g.gain.setTargetAtTime(MIX[state][layer], now, 0.6);
    this.musicFilter?.frequency.setTargetAtTime(2600 - outside * 2100, now, 0.4);
    for (const [i, o] of this.engine.entries()) o.frequency.setTargetAtTime((i + 1) * (34 + speed * 1.6), now, 0.3);
  }

  /** Frisson discret au passage de la silhouette (identique pour tous : déclenché par l'horloge commune). */
  silhouette() {
    const ctx = this.ctx;
    const out = this.gains.get('cinematic');
    if (!ctx || !out || this.stung) return;
    this.stung = true;
    const t = ctx.currentTime;
    for (const f of [1244.5, 1318.5]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 1.9);
    }
  }

  /** Planification anticipée de la musique et des voix. */
  private schedule() {
    const ctx = this.ctx!;
    const spb = 60 / 112;
    while (this.nextBeat < ctx.currentTime + 0.3) {
      const t = this.nextBeat;
      const chord = CHORDS[Math.floor(this.beat / 4) % CHORDS.length];
      this.kick(t);
      this.hat(t + spb / 2);
      this.bass(t, chord[0] / 2, spb * 0.45);
      if (this.beat % 4 === 0) for (const f of chord) this.pad(t, f, spb * 4);
      if (this.state === 'INTRO_CAR' || this.state === 'INTRO_START' || this.state === 'INTRO_POINT') this.voices(t, spb);
      this.nextBeat += spb;
      this.beat++;
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

  private kick(t: number) {
    const o = this.ctx!.createOscillator();
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    o.connect(this.env(t, this.musicFilter!, 0.9, 0.005, 0.25));
    o.start(t);
    o.stop(t + 0.3);
  }

  private hat(t: number) {
    const ctx = this.ctx!;
    const n = ctx.createBufferSource();
    n.buffer = audio.noiseBuffer(0.1);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    n.connect(hp).connect(this.env(t, this.musicFilter!, 0.18, 0.002, 0.05));
    n.start(t);
  }

  private bass(t: number, f: number, dur: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380;
    o.connect(lp).connect(this.env(t, this.musicFilter!, 0.35, 0.01, dur));
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private pad(t: number, f: number, dur: number) {
    const o = this.ctx!.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f * 2;
    o.connect(this.env(t, this.musicFilter!, 0.06, 0.3, dur - 0.3));
    o.start(t);
    o.stop(t + dur);
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

  dispose() {
    if (this.timer) clearInterval(this.timer);
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const g of this.gains.values()) g.gain.setTargetAtTime(0, now, 0.4);
    setTimeout(() => {
      for (const s of this.stoppables) s?.stop();
      for (const g of this.gains.values()) g.disconnect();
    }, 2500);
    this.ctx = null;
  }
}
