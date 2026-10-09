/**
 * Banc de mesure audio exécuté DANS Chromium (empaqueté par esbuild, voir tests/audio.test.ts).
 * Rend les cues avec un OfflineAudioContext (même directeur, même bus, même limiteur que le jeu),
 * puis mesure crête, RMS, sonie intégrée (approximation LUFS, pondération K + porte) et spectre.
 */
import { MusicDirector, createMusicBus, musicVolumeToGain, sfxVolumeToGain, type CueName, type MusicMark } from '../../src/client/music';
import { audio, audioDebug, music } from '../../src/client/audio';
import { IntroAudio } from '../../src/client/game/intro/IntroAudio';

export interface Step {
  at: number;
  play?: CueName | 'silence';
  mark?: MusicMark;
  fade?: number;
}

export interface Analysis {
  seconds: number;
  peakDb: number;
  rmsDb: number;
  lufs: number;
  /** RMS glissant (fenêtres de 0,5 s, pas de 0,25 s) en dB */
  envelope: number[];
  /** platitude spectrale médiane (300 Hz–8 kHz) sur les trames non silencieuses : ~0 tonal, ~1 bruit */
  flatnessMedian: number;
  flatnessP90: number;
  /** part d'énergie au-dessus de 5 kHz */
  hfRatio: number;
  activeFrames: number;
}

const db = (x: number) => (x > 0 ? 20 * Math.log10(x) : -Infinity);

function quantize(t: number, sr: number) {
  return (Math.round((t * sr) / 128) * 128) / sr;
}

/** Rend un scénario (suite d'actions du directeur) ; `musicSetting` = réglage joueur 0..1. */
export async function renderScenario(duration: number, steps: Step[], musicSetting = 0.4, sr = 44100): Promise<Analysis> {
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * sr), sr);
  const { bus, limiter } = createMusicBus(ctx);
  bus.gain.value = musicVolumeToGain(musicSetting);
  limiter.connect(ctx.destination);
  const dir = new MusicDirector(ctx);
  dir.output.connect(bus);
  const apply = (t: number) => {
    for (const s of steps) {
      if (quantize(s.at, sr) !== t) continue;
      if (s.play) dir.play(s.play, { fade: s.fade });
      if (s.mark) dir.mark(s.mark);
    }
    dir.tick();
  };
  // minuteur simulé : un tick toutes les 250 ms, plus un à chaque action
  const times = new Set<number>();
  for (let t = 0.25; t < duration - 0.01; t += 0.25) times.add(quantize(t, sr));
  for (const s of steps) if (s.at > 0) times.add(quantize(s.at, sr));
  for (const t of [...times].sort((a, b) => a - b)) {
    void ctx.suspend(t).then(() => {
      apply(t);
      void ctx.resume();
    });
  }
  apply(0);
  return analyze(await ctx.startRendering());
}

/** Témoin négatif : l'ancienne pluie (bruit blanc filtré 900–5200 Hz) dans la même chaîne. */
export async function renderOldRain(duration = 10, musicSetting = 0.4, sr = 44100): Promise<Analysis> {
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * sr), sr);
  const { bus, limiter } = createMusicBus(ctx);
  bus.gain.value = musicVolumeToGain(musicSetting);
  limiter.connect(ctx.destination);
  const buf = ctx.createBuffer(1, sr * 3, sr);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const hp = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 900 });
  const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 5200 });
  const g = new GainNode(ctx, { gain: 0.16 * 0.5 / musicVolumeToGain(musicSetting) * musicSetting });
  src.connect(hp).connect(lp).connect(g).connect(bus);
  src.start();
  return analyze(await ctx.startRendering());
}

/** Pondération K (BS.1770) approchée par deux biquads, rendue hors ligne. */
async function kWeight(buf: AudioBuffer) {
  const ctx = new OfflineAudioContext(buf.numberOfChannels, buf.length, buf.sampleRate);
  const src = new AudioBufferSourceNode(ctx, { buffer: buf });
  const shelf = new BiquadFilterNode(ctx, { type: 'highshelf', frequency: 1681, gain: 4 });
  const hp = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 38, Q: 0.5 });
  src.connect(shelf).connect(hp).connect(ctx.destination);
  src.start();
  return ctx.startRendering();
}

function lufsOf(k: AudioBuffer) {
  const sr = k.sampleRate;
  const block = Math.floor(0.4 * sr);
  const hop = Math.floor(0.1 * sr);
  const chans = Array.from({ length: k.numberOfChannels }, (_, c) => k.getChannelData(c));
  const powers: number[] = [];
  for (let s = 0; s + block <= k.length; s += hop) {
    let z = 0;
    for (const ch of chans) {
      let acc = 0;
      for (let i = s; i < s + block; i++) acc += ch[i] * ch[i];
      z += acc / block;
    }
    powers.push(z);
  }
  const L = (p: number) => -0.691 + 10 * Math.log10(p);
  const abs = powers.filter((p) => L(p) > -70);
  if (!abs.length) return -Infinity;
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const rel = L(mean(abs)) - 10;
  const gated = abs.filter((p) => L(p) > rel);
  return L(mean(gated));
}

function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const c = Math.cos(ang * k);
        const s = Math.sin(ang * k);
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * c - im[b] * s;
        const ti = re[b] * s + im[b] * c;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
      }
    }
  }
}

export async function analyze(buf: AudioBuffer): Promise<Analysis> {
  const sr = buf.sampleRate;
  const L = buf.getChannelData(0);
  const R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
  let peak = 0;
  let sum = 0;
  const mono = new Float32Array(buf.length);
  for (let i = 0; i < buf.length; i++) {
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
    sum += (L[i] * L[i] + R[i] * R[i]) / 2;
    mono[i] = (L[i] + R[i]) / 2;
  }
  const envelope: number[] = [];
  const w = Math.floor(0.5 * sr);
  for (let s = 0; s + w <= buf.length; s += Math.floor(0.25 * sr)) {
    let acc = 0;
    for (let i = s; i < s + w; i++) acc += (L[i] * L[i] + R[i] * R[i]) / 2;
    envelope.push(10 * Math.log10(acc / w + 1e-20));
  }
  // spectre
  const N = 4096;
  const win = Float64Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
  const flat: number[] = [];
  let hf = 0;
  let tot = 0;
  const lo = Math.ceil((300 * N) / sr);
  const hi = Math.floor((8000 * N) / sr);
  const hfBin = Math.floor((5000 * N) / sr);
  for (let s = 0; s + N <= mono.length; s += N / 2) {
    let e = 0;
    for (let i = 0; i < N; i++) e += mono[s + i] * mono[s + i];
    if (10 * Math.log10(e / N + 1e-20) < -70) continue; // silence
    const re = new Float64Array(N);
    const im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = mono[s + i] * win[i];
    fft(re, im);
    let logSum = 0;
    let linSum = 0;
    for (let k = 1; k < N / 2; k++) {
      const p = re[k] * re[k] + im[k] * im[k] + 1e-24;
      tot += p;
      if (k >= hfBin) hf += p;
      if (k >= lo && k <= hi) {
        logSum += Math.log(p);
        linSum += p;
      }
    }
    const nb = hi - lo + 1;
    flat.push(Math.exp(logSum / nb) / (linSum / nb));
  }
  flat.sort((a, b) => a - b);
  const q = (p: number) => (flat.length ? flat[Math.min(flat.length - 1, Math.floor(p * flat.length))] : 0);
  return {
    seconds: buf.length / sr,
    peakDb: db(peak),
    rmsDb: 10 * Math.log10(sum / buf.length + 1e-20),
    lufs: lufsOf(await kWeight(buf)),
    envelope,
    flatnessMedian: q(0.5),
    flatnessP90: q(0.9),
    hfRatio: tot > 0 ? hf / tot : 0,
    activeFrames: flat.length,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Parcours « réel » (vrai AudioContext, minuteurs du jeu) : menu → cinématique → partie,
 * avec l'accroche de débogage ; vérifie aussi les réglages en direct et l'absence de fuite.
 */
export async function liveFlow() {
  const log: Record<string, unknown> = {};
  audio.setVolumes(0.4, 0.6);
  audio.unlock();
  music.play('menu', { fade: 0.3 });
  await sleep(600);
  log.menu = audioDebug();
  // cinématique
  music.stop({ fade: 0.3 });
  const intro = new IntroAudio();
  intro.start();
  intro.update('INTRO_CAR', 10, 0, 0.1);
  intro.update('INTRO_REVEAL', 5, 1, 0.5);
  intro.silhouette();
  music.mark('bodyDiscovered');
  await sleep(1200);
  log.intro = audioDebug();
  intro.update('GAME_START', 0, 1, 1);
  intro.dispose();
  music.play('investigation', { fade: 0.5 });
  await sleep(400);
  log.crossfading = audioDebug();
  await sleep(3200); // fondu + arrêt des effets de la cinématique (2,5 s)
  log.game = audioDebug();
  // réglages en direct
  audio.setVolumes(0.8, 0.2);
  audio.click(); // un nœud sans entrée n'avance pas son automation dans Chromium : on joue un son
  await sleep(400);
  log.afterSettings = audioDebug();
  audio.setVolumes(0, 0.6);
  audio.click();
  await sleep(400);
  log.musicMuted = audioDebug();
  audio.setVolumes(0.4, 0.6);
  // parties répétées : pas d'accumulation de cues ni de sources
  for (let i = 0; i < 6; i++) {
    music.play('menu', { fade: 0.2 });
    const ia = new IntroAudio();
    ia.start();
    ia.update('INTRO_CAR', 10, 0, 0.5);
    music.mark('villaReveal');
    await sleep(150);
    ia.dispose();
    music.play('investigation', { fade: 0.2 });
    await sleep(150);
  }
  await sleep(3500);
  log.afterRepeats = audioDebug();
  log.expected = { music08: musicVolumeToGain(0.8), sfx02: sfxVolumeToGain(0.2) };
  return log;
}

(window as unknown as { __harness: unknown }).__harness = { renderScenario, renderOldRain, liveFlow };
