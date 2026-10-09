/**
 * Partition procédurale (Web Audio) : underscore d'enquête discret, composition ORIGINALE.
 *
 *   Instruments — piano de synthèse (partiels légèrement inharmoniques, attaque de marteau, extinction
 *                 naturelle), nappes (dents de scie désaccordées filtrées, LFO lent), note grave tenue.
 *   Cues        — 'menu' (très clairsemé), 'intro' (cinématique, suit des repères), 'investigation'
 *                 (en partie, extrêmement discret, longs silences), plus 'silence'.
 *   Directeur   — au plus UNE cue active ; enchaînement en fondu (l'ancienne s'éteint, la nouvelle
 *                 entre à mi-fondu : la somme des gains ne dépasse jamais 1), réverbération commune.
 *
 * Harmonie modale (ré dorien / la mineur), accords suspendus, tempo lent et irrégulier.
 * Aucun bruit large bande (pas de pluie, pas d'orage), pas de percussion.
 * Fonctionne avec un AudioContext comme avec un OfflineAudioContext (mesures automatisées).
 */

export type CueName = 'menu' | 'intro' | 'investigation';
/** Repères musicaux : la cinématique (et le jeu) les signalent, la cue active y répond en douceur. */
export type MusicMark =
  | 'drive' // INTRO_CAR : la route, premières notes
  | 'pointing' // INTRO_POINT : un passager montre la villa
  | 'villaReveal' // INTRO_REVEAL : la villa apparaît
  | 'silhouette' // la silhouette à la fenêtre (une note aiguë, pas de « jump scare »)
  | 'arrival' // INTRO_VILLA : arrivée devant la villa
  | 'enterHouse' // fondu au noir : on entre
  | 'bodyDiscovered' // découverte du corps (plan ajouté en fin de cinématique, ou en partie)
  | 'end' // fin de la cinématique : la musique s'amincit
  | 'tension'; // en partie : un événement inquiétant

export interface MusicPlayOptions {
  /** durée du fondu (s) */
  fade?: number;
}

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Générateur pseudo-aléatoire déterministe (mulberry32) : rendus hors ligne reproductibles. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Maintient une valeur à l'instant `at` puis libère la suite de l'automation (sans saut). */
function holdAt(p: AudioParam, at: number) {
  const anyP = p as AudioParam & { cancelAndHoldAtTime?: (t: number) => AudioParam };
  if (anyP.cancelAndHoldAtTime) anyP.cancelAndHoldAtTime(at);
  else {
    const v = p.value;
    p.cancelScheduledValues(at);
    p.setValueAtTime(v, at);
  }
}

// ───────────── instruments ─────────────

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();
/** Court bruit (attaque du marteau uniquement, 30 ms filtrés) — jamais en boucle. */
function hammerNoise(ctx: BaseAudioContext) {
  let b = noiseCache.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.05), ctx.sampleRate);
    const d = b.getChannelData(0);
    const r = rng(7);
    for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1;
    noiseCache.set(ctx, b);
  }
  return b;
}

export interface PadHandle {
  release(at: number, time: number): void;
}

/** Fabrique de notes ; chaque source planifiée est suivie (arrêt propre à la fin de la cue). */
class Instruments {
  constructor(
    private ctx: BaseAudioContext,
    private dest: AudioNode,
    private track: (s: AudioScheduledSourceNode, end: number) => void,
  ) {}

  /** Note de piano : `vel` 0..1 (on reste piano/pianissimo), `hold` = durée avant étouffoir. */
  piano(midi: number, t: number, vel: number, hold = 6, pan = 0) {
    const ctx = this.ctx;
    const f0 = mtof(midi);
    const peak = 0.2 * vel;
    const tau = clamp(2.4 * Math.pow(220 / f0, 0.45), 0.7, 4.5); // les graves sonnent plus longtemps
    const end = t + Math.min(hold, tau * 4.5);
    const stopAt = end + 1.2;

    const out = ctx.createGain();
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(peak, t + 0.006);
    out.gain.setTargetAtTime(0, t + 0.006, tau);
    out.gain.setTargetAtTime(0, end, 0.2); // étouffoir
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.min(9000, 700 + vel * 2400 + f0 * 1.6); // doux = sombre
    lp.Q.value = 0.3;
    const pn = ctx.createStereoPanner();
    pn.pan.value = pan;
    lp.connect(out).connect(pn).connect(this.dest);

    // partiels : f_n = n·f0·√(1 + B·n²), amplitudes décroissantes, les aigus s'éteignent plus vite
    const B = 0.00035;
    const parts: [number, number, number][] = []; // fréquence, amplitude, constante de temps
    for (let n = 1; n <= 8; n++) {
      const f = n * f0 * Math.sqrt(1 + B * n * n);
      if (f > 9500) break;
      parts.push([f, Math.pow(n, -1.5) * Math.pow(0.45 + vel, (n - 1) * 0.35), n === 1 ? 0 : tau / (0.35 * (n - 1))]);
    }
    parts.push([f0 * 1.0009, 0.45, 0]); // seconde corde du chœur : battement lent
    const norm = 1 / parts.reduce((s, p) => s + p[1], 0);
    for (const [f, a, tn] of parts) {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(a * norm, t);
      if (tn > 0) g.gain.setTargetAtTime(0, t, tn);
      o.connect(g).connect(lp);
      o.start(t);
      o.stop(stopAt);
      this.track(o, stopAt);
    }
    // marteau : impulsion de 30 ms, filtrée, très faible
    const h = ctx.createBufferSource();
    h.buffer = hammerNoise(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = clamp(f0 * 5, 900, 3200);
    bp.Q.value = 1.2;
    const hg = ctx.createGain();
    hg.gain.setValueAtTime(0, t);
    hg.gain.linearRampToValueAtTime(peak * 0.25, t + 0.002);
    hg.gain.setTargetAtTime(0, t + 0.002, 0.008);
    h.connect(bp).connect(hg).connect(pn);
    h.start(t);
    h.stop(t + 0.05);
    this.track(h, t + 0.05);
  }

  /** Nappe : accord tenu jusqu'à `release`. */
  pad(midis: number[], t: number, o: { level: number; cutoff: number; attack: number }): PadHandle {
    const ctx = this.ctx;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(o.level, t + o.attack);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = o.cutoff;
    lp.Q.value = 0.6;
    lp.connect(env).connect(this.dest);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05 + (midis[0] % 5) * 0.007;
    const lg = ctx.createGain();
    lg.gain.value = o.cutoff * 0.22;
    lfo.connect(lg).connect(lp.frequency);
    const srcs: OscillatorNode[] = [lfo];
    const per = 1 / (midis.length * 1.8);
    midis.forEach((m, i) => {
      const f = mtof(m);
      const pn = ctx.createStereoPanner();
      pn.pan.value = midis.length > 1 ? -0.45 + (0.9 * i) / (midis.length - 1) : 0;
      pn.connect(lp);
      for (const [type, cents, a] of [['sawtooth', 6, 0.33], ['sawtooth', -7, 0.33], ['sine', 0, 0.6]] as const) {
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.value = f * Math.pow(2, cents / 1200);
        const g = ctx.createGain();
        g.gain.value = a * per;
        osc.connect(g).connect(pn);
        srcs.push(osc);
      }
    });
    for (const s of srcs) {
      s.start(t);
      this.track(s, Infinity);
    }
    let released = false;
    return {
      release: (at, time) => {
        if (released) return;
        released = true;
        const when = Math.max(at, t);
        holdAt(env.gain, when);
        env.gain.setTargetAtTime(0, when, time / 4);
        for (const s of srcs) {
          s.stop(when + time + 0.2);
          this.track(s, when + time + 0.2);
        }
      },
    };
  }

  /** Note grave tenue (sinus + un soupçon d'harmonique), très douce. */
  low(midi: number, t: number, level: number, attack = 3): PadHandle {
    const ctx = this.ctx;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(level, t + attack);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 280;
    lp.connect(env).connect(this.dest);
    const srcs: OscillatorNode[] = [];
    for (const [type, mul, a] of [['sine', 1, 1], ['triangle', 2, 0.12]] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = mtof(midi) * mul;
      const g = ctx.createGain();
      g.gain.value = a;
      o.connect(g).connect(lp);
      o.start(t);
      this.track(o, Infinity);
      srcs.push(o);
    }
    let released = false;
    return {
      release: (at, time) => {
        if (released) return;
        released = true;
        const when = Math.max(at, t);
        holdAt(env.gain, when);
        env.gain.setTargetAtTime(0, when, time / 4);
        for (const s of srcs) {
          s.stop(when + time + 0.2);
          this.track(s, when + time + 0.2);
        }
      },
    };
  }
}

// ───────────── harmonie ─────────────

const CH = {
  Dsus2: [50, 57, 62, 64], // ré la ré mi
  Dm7: [50, 57, 60, 65], // ré la do fa
  Bbmaj7: [46, 53, 57, 62], // si♭ fa la ré
  Bbmaj7s11: [46, 53, 57, 64], // si♭ fa la mi : triton discret
  Gm9: [43, 50, 58, 69], // sol ré si♭ la
  Gsus2: [43, 50, 57, 62, 69], // sol ré la ré la
  Asus4: [45, 52, 57, 62], // la mi la ré
  Fmaj7: [41, 48, 57, 64], // fa do la mi
  Open5: [50, 57], // quinte à vide
};

/** Gamme de ré dorien dans le registre du piano (ré4 → la5). */
const DORIAN = [62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81];

// ───────────── cues ─────────────

/**
 * Niveau propre à chaque cue (mesuré, voir tests/audio.test.ts) : au réglage par défaut (0,4),
 * menu ≈ −29, cinématique ≈ −28, partie ≈ −29 LUFS (estimation), crêtes vers −18 dBFS.
 */
const CUE_TRIM: Record<CueName, number> = { menu: 0.75, intro: 0.8, investigation: 0.6 };

abstract class Cue {
  readonly out: GainNode;
  /** sources encore vivantes → instant d'arrêt prévu (debug, arrêt propre) */
  readonly live = new Map<AudioScheduledSourceNode, number>();
  protected inst: Instruments;
  protected r: () => number;
  protected stopAt = Infinity;
  private padH: PadHandle | null = null;
  private lowH: PadHandle | null = null;

  constructor(
    readonly name: CueName,
    protected ctx: BaseAudioContext,
    dest: AudioNode,
    protected startAt: number,
    seed: number,
  ) {
    this.out = ctx.createGain();
    this.out.gain.value = CUE_TRIM[name];
    this.out.connect(dest);
    this.r = rng(seed);
    this.inst = new Instruments(ctx, this.out, (s, end) => {
      if (!this.live.has(s)) s.addEventListener('ended', () => this.live.delete(s), { once: true });
      this.live.set(s, end);
    });
  }

  protected between(a: number, b: number) {
    return a + (b - a) * this.r();
  }

  protected setPad(chord: number[] | null, at: number, o: { level: number; cutoff: number; attack: number; release?: number }) {
    this.padH?.release(at, o.release ?? 3);
    this.padH = chord && at < this.stopAt ? this.inst.pad(chord, at, o) : null;
  }

  protected setLow(midi: number | null, at: number, level: number, attack = 3, release = 4) {
    this.lowH?.release(at, release);
    this.lowH = midi !== null && at < this.stopAt ? this.inst.low(midi, at, level, attack) : null;
  }

  protected note(midi: number, at: number, vel: number, hold?: number) {
    if (at >= this.stopAt) return;
    this.inst.piano(midi, at, vel, hold, this.between(-0.3, 0.3));
  }

  /** Planifie tout ce qui doit commencer avant `horizon` (temps du contexte). */
  scheduleUntil(horizon: number) {
    this.schedule(Math.min(horizon, this.stopAt), this.ctx.currentTime);
  }
  protected abstract schedule(horizon: number, now: number): void;
  abstract mark(m: MusicMark, now: number): void;
  abstract section(): string;

  /** Arrêt : plus rien de nouveau après `at` ; les sources en cours s'arrêtent à `at`. */
  stop(at: number) {
    this.stopAt = at;
    for (const [s, end] of this.live) {
      if (end <= at) continue; // s'arrête déjà avant : on ne prolonge rien
      try {
        s.stop(at);
        this.live.set(s, at);
      } catch {
        /* déjà arrêtée */
      }
    }
  }

  dispose() {
    this.out.disconnect();
    this.live.clear();
  }
}

/** Cue d'ambiance (menu, partie) : accords lents, phrases de piano rares, beaucoup de silence. */
class AmbientCue extends Cue {
  private progression: number[][];
  private ci = -1;
  private chordAt: number;
  private pianoAt: number;
  private phrase: { midi: number; at: number; vel: number }[] = [];
  private lastNote = 0;
  private tense = false;
  private p: { padLevel: number; cutoff: number; chordLen: [number, number]; gap: [number, number]; vel: [number, number]; low: number; firstNote: number };

  constructor(name: CueName, ctx: BaseAudioContext, dest: AudioNode, startAt: number, seed: number) {
    super(name, ctx, dest, startAt, seed);
    if (name === 'menu') {
      this.progression = [CH.Dsus2, CH.Bbmaj7, CH.Dsus2, CH.Gm9];
      this.p = { padLevel: 0.75, cutoff: 650, chordLen: [16, 22], gap: [11, 22], vel: [0.16, 0.26], low: 0, firstNote: 6 };
    } else {
      this.progression = [CH.Dsus2, CH.Bbmaj7, CH.Gm9, CH.Asus4, CH.Dm7, CH.Fmaj7, CH.Gm9, CH.Asus4];
      this.p = { padLevel: 0.8, cutoff: 720, chordLen: [13, 19], gap: [7, 16], vel: [0.17, 0.3], low: 0.025, firstNote: 5 };
    }
    this.chordAt = startAt;
    this.pianoAt = startAt + this.p.firstNote + this.between(0, 3);
  }

  section() {
    return `${this.name}:${this.ci % this.progression.length}`;
  }

  private nextChord(at: number, chord?: number[]) {
    this.ci++;
    const c = chord ?? this.progression[this.ci % this.progression.length];
    const first = this.ci === 0;
    this.setPad(c, at, { level: this.p.padLevel, cutoff: this.p.cutoff + this.between(-80, 80), attack: first ? 6 : 4, release: 5 });
    if (this.p.low > 0 && (this.ci % 2 === 0 || this.tense)) this.setLow(36 + ((c[0] - 36) % 12), at + 1, this.p.low, 4, 5);
    else this.setLow(null, at, 0, 3, 5);
    this.chordAt = at + this.between(...this.p.chordLen);
    this.tense = false;
    return c;
  }

  protected schedule(h: number, now: number) {
    // retard (onglet masqué) : on repart de maintenant au lieu de rattraper
    if (this.chordAt < now - 0.5) this.chordAt = now + 0.1;
    if (this.pianoAt < now - 0.5 && this.phrase.length === 0) this.pianoAt = now + this.between(2, 5);
    while (this.chordAt < h) this.nextChord(this.chordAt);
    while (this.pianoAt < h) {
      if (this.phrase.length === 0) this.composePhrase(this.pianoAt);
      const n = this.phrase.shift()!;
      this.note(n.midi, n.at, n.vel);
      this.pianoAt = this.phrase.length ? this.phrase[0].at : n.at + this.between(...this.p.gap);
    }
  }

  private composePhrase(at: number) {
    const chord = this.progression[Math.max(0, this.ci) % this.progression.length];
    const pcs = new Set(chord.map((m) => m % 12));
    const tones = DORIAN.filter((m) => pcs.has(m % 12));
    const count = this.r() < 0.45 ? 1 : this.r() < 0.75 ? 2 : 3;
    let t = at;
    let prev = this.lastNote || tones[Math.floor(this.r() * tones.length)];
    for (let i = 0; i < count; i++) {
      // pas conjoint ou note de l'accord, jamais deux fois la même
      const pool = (i === 0 ? tones : DORIAN).filter((m) => m !== prev && Math.abs(m - prev) <= 7);
      const m = pool.length ? pool[Math.floor(this.r() * pool.length)] : tones[0];
      this.phrase.push({ midi: m, at: t, vel: this.between(...this.p.vel) * (i === count - 1 ? 0.85 : 1) });
      prev = m;
      t += this.between(0.9, 2.3);
    }
    this.lastNote = prev;
  }

  mark(m: MusicMark, now: number) {
    if (m !== 'tension' && m !== 'bodyDiscovered') return;
    // inflexion discrète : accord à triton, une note grave isolée
    const at = Math.max(now + 0.1, this.startAt);
    this.tense = true;
    this.nextChord(at, CH.Bbmaj7s11);
    this.note(50, at + 0.6, 0.26, 4);
    this.phrase = [];
    this.pianoAt = at + this.between(6, 9);
  }
}

interface IntroSection {
  chord: number[] | null;
  cutoff: number;
  padLevel: number;
  low: number | null;
  /** motif joué à l'entrée de la section : [note, décalage (s), vélocité] */
  motif: [number | number[], number, number][];
  /** notes isolées ensuite (vide = le piano se tait) */
  pool: number[];
  gap: [number, number];
}

const INTRO: Record<string, IntroSection> = {
  open: { chord: CH.Dsus2, cutoff: 560, padLevel: 0.7, low: 38, motif: [], pool: [], gap: [3, 4] },
  drive: { chord: CH.Dsus2, cutoff: 680, padLevel: 0.8, low: 38, motif: [[69, 0.6, 0.32], [76, 2.5, 0.28], [74, 4.4, 0.26]], pool: [69, 72, 74, 76], gap: [2.2, 3.6] },
  pointing: { chord: CH.Bbmaj7s11, cutoff: 700, padLevel: 0.8, low: 34, motif: [[69, 0.3, 0.3], [69, 1.7, 0.2]], pool: [], gap: [3, 4] },
  villaReveal: { chord: CH.Gsus2, cutoff: 1100, padLevel: 0.9, low: 38, motif: [[74, 0.4, 0.34], [77, 1.7, 0.3], [76, 3.1, 0.28], [69, 4.9, 0.24]], pool: [74, 76, 69, 72], gap: [2.6, 4] },
  arrival: { chord: CH.Asus4, cutoff: 850, padLevel: 0.8, low: 33, motif: [[72, 0.5, 0.28], [71, 2.3, 0.24]], pool: [69, 71, 74], gap: [3, 5] },
  enterHouse: { chord: CH.Open5, cutoff: 600, padLevel: 0.7, low: 38, motif: [], pool: [], gap: [3, 4] },
  bodyDiscovered: { chord: CH.Bbmaj7, cutoff: 720, padLevel: 0.8, low: 38, motif: [[65, 0.3, 0.34], [64, 1.9, 0.3], [62, 3.5, 0.28], [[38, 50], 5.6, 0.3]], pool: [], gap: [3, 4] },
  end: { chord: CH.Open5, cutoff: 480, padLevel: 0.55, low: null, motif: [], pool: [], gap: [3, 4] },
};

/** Cue de la cinématique : sections déclenchées par les repères, transitions de 2–3 s. */
class IntroCue extends Cue {
  private sec = 'open';
  private queue: { midi: number | number[]; at: number; vel: number }[] = [];
  private noodleAt = Infinity;
  private started = false;

  section() {
    return `intro:${this.sec}`;
  }

  private enter(name: string, at: number) {
    const s = INTRO[name];
    this.sec = name;
    this.setPad(s.chord, at, { level: s.padLevel, cutoff: s.cutoff, attack: this.started ? 2.5 : 4, release: 3 });
    this.setLow(s.low, at, 0.03, 3, 4);
    this.started = true;
    this.queue = s.motif.map(([midi, dt, vel]) => ({ midi, at: at + dt, vel }));
    const last = s.motif.length ? s.motif[s.motif.length - 1][1] : 0;
    this.noodleAt = s.pool.length ? at + last + this.between(...s.gap) : Infinity;
  }

  protected schedule(h: number, now: number) {
    if (!this.started) this.enter('open', this.startAt);
    while (this.queue.length && this.queue[0].at < h) {
      const n = this.queue.shift()!;
      if (n.at < now - 0.3) continue; // trop tard (onglet masqué) : on saute
      for (const m of Array.isArray(n.midi) ? n.midi : [n.midi]) this.note(m, n.at, n.vel);
    }
    const s = INTRO[this.sec];
    if (this.noodleAt < now - 0.5) this.noodleAt = now + 0.5;
    while (!this.queue.length && this.noodleAt < h) {
      this.note(s.pool[Math.floor(this.r() * s.pool.length)], this.noodleAt, this.between(0.2, 0.3));
      this.noodleAt += this.between(...s.gap);
    }
  }

  mark(m: MusicMark, now: number) {
    const at = Math.max(now + 0.05, this.startAt);
    if (m === 'silhouette') {
      this.note(88, at, 0.2, 3); // mi6, pianissimo
      return;
    }
    if (m === 'tension') m = 'pointing';
    if (!INTRO[m] || m === this.sec) return;
    this.enter(m, at);
  }
}

export function createCue(name: CueName, ctx: BaseAudioContext, dest: AudioNode, startAt: number, seed: number): Cue {
  return name === 'intro' ? new IntroCue(name, ctx, dest, startAt, seed) : new AmbientCue(name, ctx, dest, startAt, seed);
}

// ───────────── chaîne de sortie ─────────────

/** Réverbération à convolution : réponse impulsionnelle générée (bruit à décroissance exponentielle, assombri). */
export function createReverb(ctx: BaseAudioContext, seconds = 3.6, seed = 11) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    const r = rng(seed + ch);
    let lp = 0;
    let energy = 0;
    for (let i = 0; i < len; i++) {
      const t = i / ctx.sampleRate;
      const k = 0.55 - 0.45 * Math.min(1, t / seconds); // la queue s'assombrit
      lp += k * (r() * 2 - 1 - lp);
      d[i] = lp * Math.exp(-t * 2.1);
      energy += d[i] * d[i];
    }
    const n = 1 / Math.sqrt(energy);
    for (let i = 0; i < len; i++) d[i] *= n;
  }
  const conv = ctx.createConvolver();
  conv.normalize = false;
  conv.buffer = ir;
  return conv;
}

/** Bus musique : gain (réglage joueur) → limiteur. */
export function createMusicBus(ctx: BaseAudioContext) {
  const bus = ctx.createGain();
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -14;
  limiter.knee.value = 4;
  limiter.ratio.value = 16;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.35;
  bus.connect(limiter);
  return { bus, limiter };
}

/** Réglage « Musique » (0..1) → gain du bus : courbe douce, la valeur par défaut (0,4) reste basse. */
export function musicVolumeToGain(v: number) {
  return clamp(v, 0, 1) ** 2 * 1.6;
}
/** Réglage « Effets sonores » (0..1) → gain du bus (linéaire, comme avant). */
export function sfxVolumeToGain(v: number) {
  return clamp(v, 0, 1);
}

// ───────────── directeur ─────────────

interface Slot {
  name: CueName;
  cue: Cue;
  gain: GainNode;
  /** fin du fondu de sortie (temps du contexte), Infinity si active */
  until: number;
  /** rampe d'entrée : de 0 à 1 entre `inAt` et `inAt + inFade` */
  inAt: number;
  inFade: number;
}

export interface CueDebug {
  name: CueName;
  role: 'active' | 'fading';
  gain: number;
  liveSources: number;
  section: string;
}

/**
 * Directeur musical : une seule cue active, fondus enchaînés, repères.
 * `tick()` est appelé par un minuteur (contexte réel) ou à chaque suspension (rendu hors ligne).
 */
export class MusicDirector {
  /** sortie (après réverbération) à brancher sur le bus musique */
  readonly output: GainNode;
  private input: GainNode;
  private reverb: ConvolverNode;
  private active: Slot | null = null;
  private fading: Slot[] = [];
  private seed = 1;
  /** suspendu (onglet masqué) : on ne planifie plus rien */
  paused = false;
  lookahead = 1.2;

  constructor(private ctx: BaseAudioContext) {
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    const dry = ctx.createGain();
    dry.gain.value = 0.8;
    const wet = ctx.createGain();
    wet.gain.value = 0.45;
    const pre = ctx.createDelay(0.1);
    pre.delayTime.value = 0.03;
    this.reverb = createReverb(ctx);
    this.input.connect(dry).connect(this.output);
    this.input.connect(pre).connect(this.reverb).connect(wet).connect(this.output);
  }

  get current(): CueName | 'silence' {
    return this.active?.name ?? 'silence';
  }

  /** Lance une cue (ou le silence) ; ne fait rien si elle joue déjà. */
  play(name: CueName | 'silence', opts: MusicPlayOptions = {}) {
    if (this.current === name) return;
    const fade = Math.max(0.05, opts.fade ?? 3);
    const now = this.ctx.currentTime;
    const old = this.active;
    if (old) {
      // niveau actuel calculé (pas lu) : une rampe démarre au DERNIER événement, il faut un point d'ancrage à `now`
      const v = clamp((now - old.inAt) / old.inFade, 0, 1);
      const g = old.gain.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(v, now);
      g.linearRampToValueAtTime(0, now + fade);
      old.cue.stop(now + fade + 0.05);
      old.until = now + fade + 0.1;
      this.fading.push(old);
      this.active = null;
    }
    if (name === 'silence') return;
    // la nouvelle cue n'entre qu'à mi-fondu : jamais deux musiques à plein volume
    // (idem si une cue précédente s'éteint encore après un `stop`)
    const tail = Math.max(0, ...this.fading.map((s) => s.until));
    const startAt = Math.max(now + (old ? fade * 0.5 : 0.05), tail - fade * 0.5);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.setValueAtTime(0, startAt);
    gain.gain.linearRampToValueAtTime(1, startAt + fade);
    gain.connect(this.input);
    const cue = createCue(name, this.ctx, gain, startAt, this.seed++ * 7919);
    this.active = { name, cue, gain, until: Infinity, inAt: startAt, inFade: fade };
    this.tick();
  }

  stop(opts: MusicPlayOptions = {}) {
    this.play('silence', opts);
  }

  mark(m: MusicMark) {
    this.active?.cue.mark(m, this.ctx.currentTime);
    this.tick();
  }

  tick() {
    const now = this.ctx.currentTime;
    this.fading = this.fading.filter((s) => {
      if (now < s.until) {
        if (!this.paused) s.cue.scheduleUntil(now + this.lookahead);
        return true;
      }
      s.cue.dispose();
      s.gain.disconnect();
      return false;
    });
    if (this.active && !this.paused) this.active.cue.scheduleUntil(now + this.lookahead);
  }

  debug(): CueDebug[] {
    const slots = [...(this.active ? [this.active] : []), ...this.fading];
    return slots.map((s) => ({
      name: s.name,
      role: s === this.active ? 'active' : 'fading',
      gain: s.gain.gain.value,
      liveSources: s.cue.live.size,
      section: s.cue.section(),
    }));
  }

  dispose() {
    const now = this.ctx.currentTime;
    for (const s of [...(this.active ? [this.active] : []), ...this.fading]) {
      s.cue.stop(now);
      s.cue.dispose();
      s.gain.disconnect();
    }
    this.active = null;
    this.fading = [];
    this.output.disconnect();
  }
}
