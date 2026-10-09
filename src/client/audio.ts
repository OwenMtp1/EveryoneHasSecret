/**
 * Moteur audio du jeu (Web Audio, un seul AudioContext) :
 *   bus musique  — directeur musical (music.ts) → gain « Musique » → limiteur → sortie
 *   bus effets   — sons d'interface et de jeu → gain « Effets sonores » → sortie
 * Les deux réglages s'appliquent en direct. Plus aucune pluie ni orage : la musique est un
 * underscore d'enquête discret (composition originale procédurale, voir docs/AUDIO.md).
 * Le chat vocal (voice.ts) a son propre contexte et n'est jamais touché ici.
 */
import { MusicDirector, createMusicBus, musicVolumeToGain, sfxVolumeToGain, type CueDebug, type CueName, type MusicMark, type MusicPlayOptions } from './music';

export type { CueName, MusicMark, MusicPlayOptions } from './music';

const TICK_MS = 250;

class AudioManager {
  private ctx: AudioContext | null = null;
  private musicBus: GainNode | null = null;
  private duck: GainNode | null = null;
  private sfx: GainNode | null = null;
  private director: MusicDirector | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private musicVol = 0.4;
  private sfxVol = 0.6;
  private started = false;
  private hidden = false;
  /** cue demandée avant le déblocage de l'audio (jouée au premier geste) */
  private wanted: { cue: CueName | 'silence'; fade?: number } = { cue: 'silence' };
  /** boucles persistantes en cours (debug : vérifie qu'aucune ne survit à un changement de scène) */
  private loops = new Map<string, number>();
  private gestureHandler: (() => void) | null = null;

  constructor() {
    if (typeof window === 'undefined') return;
    // politique d'autoplay : on (re)démarre au premier geste, tant que le contexte n'est pas actif
    this.gestureHandler = () => this.unlock();
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, this.gestureHandler, { passive: true });
    document.addEventListener('visibilitychange', () => this.setHidden(document.hidden));
  }

  setVolumes(music: number, sfx: number) {
    this.musicVol = music;
    this.sfxVol = sfx;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // petite rampe : pas de clic quand on fait glisser le curseur
    this.musicBus?.gain.setTargetAtTime(musicVolumeToGain(music), now, 0.03);
    this.sfx?.gain.setTargetAtTime(sfxVolumeToGain(sfx), now, 0.03);
  }

  /** Doit être appelé après une interaction utilisateur (politique des navigateurs). */
  unlock() {
    if (!this.started) {
      try {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new Ctx();
        this.ctx = ctx;
        const { bus, limiter } = createMusicBus(ctx);
        this.musicBus = bus;
        this.duck = ctx.createGain();
        this.sfx = ctx.createGain();
        bus.gain.value = musicVolumeToGain(this.musicVol);
        this.sfx.gain.value = sfxVolumeToGain(this.sfxVol);
        limiter.connect(this.duck).connect(ctx.destination);
        this.sfx.connect(ctx.destination);
        this.director = new MusicDirector(ctx);
        this.director.output.connect(bus);
        this.timer = setInterval(() => this.director?.tick(), TICK_MS);
        ctx.addEventListener('statechange', () => this.onState());
        this.started = true;
        this.setHidden(typeof document !== 'undefined' && document.hidden);
        if (this.wanted.cue !== 'silence') this.director.play(this.wanted.cue, { fade: this.wanted.fade ?? 2.5 });
      } catch {
        return; /* audio indisponible */
      }
    }
    if (this.ctx?.state === 'suspended') void this.ctx.resume().catch(() => {});
    this.onState();
  }

  private onState() {
    if (this.ctx?.state === 'running' && this.gestureHandler) {
      for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.removeEventListener(ev, this.gestureHandler);
      this.gestureHandler = null;
    }
  }

  /** Onglet masqué : la musique s'efface et ne planifie plus rien ; les effets restent actifs. */
  private setHidden(h: boolean) {
    this.hidden = h;
    if (!this.ctx || !this.duck || !this.director) return;
    this.director.paused = h;
    this.duck.gain.setTargetAtTime(h ? 0 : 1, this.ctx.currentTime, h ? 0.15 : 0.6);
    if (!h) this.director.tick();
  }

  // ───────────── musique ─────────────

  playMusic(cue: CueName | 'silence', opts: MusicPlayOptions = {}) {
    this.wanted = { cue, fade: opts.fade };
    this.director?.play(cue, opts);
  }

  markMusic(m: MusicMark) {
    this.director?.mark(m);
  }

  currentMusic(): CueName | 'silence' {
    return this.director?.current ?? this.wanted.cue;
  }

  /** Déclare une boucle persistante (moteur, route…) ; renvoie la fonction de retrait. */
  registerLoop(name: string) {
    this.loops.set(name, (this.loops.get(name) ?? 0) + 1);
    let done = false;
    return () => {
      if (done) return;
      done = true;
      const n = (this.loops.get(name) ?? 1) - 1;
      if (n <= 0) this.loops.delete(name);
      else this.loops.set(name, n);
    };
  }

  /** Accès aux bus audio pour les mises en scène (cinématique) ; null si l'audio n'est pas débloqué. */
  buses(): { ctx: AudioContext; sfx: GainNode } | null {
    if (!this.ctx || !this.sfx) return null;
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {});
    return { ctx: this.ctx, sfx: this.sfx };
  }

  noiseBuffer(seconds = 2) {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** État courant (tests, débogage). */
  debug(): AudioDebug {
    return {
      unlocked: this.started,
      state: this.ctx?.state ?? 'none',
      hidden: this.hidden,
      settings: { music: this.musicVol, sfx: this.sfxVol },
      buses: {
        musicTarget: musicVolumeToGain(this.musicVol),
        music: this.musicBus?.gain.value ?? null,
        sfxTarget: sfxVolumeToGain(this.sfxVol),
        sfx: this.sfx?.gain.value ?? null,
        duck: this.duck?.gain.value ?? null,
      },
      music: this.currentMusic(),
      cues: this.director?.debug() ?? [],
      loops: [...this.loops.keys()],
    };
  }

  /** Libère tout (tests) ; un nouvel `unlock()` recrée le contexte. */
  async close() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.director?.dispose();
    this.director = null;
    const ctx = this.ctx;
    this.ctx = this.musicBus = this.duck = this.sfx = null;
    this.started = false;
    await ctx?.close().catch(() => {});
  }

  // ───────────── effets ─────────────

  private tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.15, slide?: number) {
    if (!this.ctx || !this.sfx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  click() {
    this.tone(880, 0.06, 'triangle', 0.05);
  }
  notify() {
    this.tone(660, 0.12, 'sine', 0.08);
    setTimeout(() => this.tone(990, 0.18, 'sine', 0.06), 90);
  }
  error() {
    this.tone(180, 0.18, 'sawtooth', 0.05);
  }
  danger() {
    this.tone(70, 1.6, 'sawtooth', 0.12, 40);
    this.tone(233, 0.9, 'square', 0.03, 200);
  }
}

export interface AudioDebug {
  unlocked: boolean;
  state: AudioContextState | 'none';
  hidden: boolean;
  settings: { music: number; sfx: number };
  buses: { musicTarget: number; music: number | null; sfxTarget: number; sfx: number | null; duck: number | null };
  music: CueName | 'silence';
  cues: CueDebug[];
  loops: string[];
}

export const audio = new AudioManager();

/**
 * Musique : une seule cue à la fois, fondus enchaînés.
 *   music.play('investigation', { fade: 6 }) · music.stop({ fade: 3 }) · music.mark('bodyDiscovered')
 */
export const music = {
  play: (cue: CueName | 'silence', opts?: MusicPlayOptions) => audio.playMusic(cue, opts),
  stop: (opts?: MusicPlayOptions) => audio.playMusic('silence', opts),
  mark: (m: MusicMark) => audio.markMusic(m),
  get current() {
    return audio.currentMusic();
  },
};

/** Accroche de débogage : cues actives, sources vivantes, gains des bus, boucles persistantes. */
export const audioDebug = () => audio.debug();
