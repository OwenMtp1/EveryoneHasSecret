/**
 * Ambiance sonore procédurale (Web Audio) : pluie, grondements, sons d'interface.
 * Aucun fichier audio requis pour le prototype ; les vrais assets pourront remplacer ces générateurs.
 */
class AudioManager {
  private ctx: AudioContext | null = null;
  private music: GainNode | null = null;
  private sfx: GainNode | null = null;
  private musicVol = 0.4;
  private sfxVol = 0.6;
  private started = false;

  setVolumes(music: number, sfx: number) {
    this.musicVol = music;
    this.sfxVol = sfx;
    if (this.music) this.music.gain.value = music * 0.5;
    if (this.sfx) this.sfx.gain.value = sfx;
  }

  /** Doit être appelé après une interaction utilisateur (politique des navigateurs). */
  unlock() {
    if (this.started) return;
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
      this.music = this.ctx.createGain();
      this.sfx = this.ctx.createGain();
      this.music.connect(this.ctx.destination);
      this.sfx.connect(this.ctx.destination);
      this.setVolumes(this.musicVol, this.sfxVol);
      this.startRain();
      this.startDrone();
      this.started = true;
    } catch {
      /* audio indisponible */
    }
  }

  /** Accès aux bus audio pour les mises en scène (cinématique) ; null si l'audio n'est pas débloqué. */
  buses(): { ctx: AudioContext; music: GainNode; sfx: GainNode } | null {
    if (!this.ctx || !this.music || !this.sfx) return null;
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return { ctx: this.ctx, music: this.music, sfx: this.sfx };
  }

  noiseBuffer(seconds = 2) {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  private startRain() {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(3);
    src.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 900;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 5200;
    const g = ctx.createGain();
    g.gain.value = 0.16;
    src.connect(hp).connect(lp).connect(g).connect(this.music!);
    src.start();
  }

  private startDrone() {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.value = 0.05;
    g.connect(this.music!);
    for (const f of [55, 82.4, 110.3]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = 0.05 + Math.random() * 0.08;
      lg.gain.value = 1.5;
      lfo.connect(lg).connect(o.frequency);
      o.connect(g);
      o.start();
      lfo.start();
    }
  }

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
  sting() {
    this.tone(110, 2.4, 'sawtooth', 0.06, 55);
    this.tone(164.8, 2.4, 'sine', 0.08, 82);
  }
  danger() {
    this.tone(70, 1.6, 'sawtooth', 0.12, 40);
    this.tone(233, 0.9, 'square', 0.03, 200);
  }
  thunder() {
    if (!this.ctx || !this.sfx) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer(3);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 220;
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
    src.connect(lp).connect(g).connect(this.sfx);
    src.start();
  }
}

export const audio = new AudioManager();
