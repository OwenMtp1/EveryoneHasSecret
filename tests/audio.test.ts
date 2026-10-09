/**
 * Musique : mesures objectives (on ne peut pas écouter en CI).
 * Les cues sont rendues dans Chromium headless (OfflineAudioContext) avec la vraie chaîne du jeu
 * (directeur → réverbération → bus musique → limiteur), au réglage par défaut (musique 0,4).
 * Vérifie : niveaux bas (crête, RMS, sonie ≈ LUFS), aucun lit de bruit large bande (pluie),
 * fondus enchaînés sans bosse de volume, et — dans un vrai AudioContext — qu'après le passage en
 * partie il ne reste ni cue d'intro ni boucle, et que les réglages Musique / Effets s'appliquent en direct.
 * Ignoré si aucun Chromium n'est disponible (CHROMIUM_PATH ou /opt/pw-browsers).
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium, type Browser, type Page } from 'playwright-core';
import { introSchedule } from '../src/shared/content/intro';
import type { Analysis, Step } from './audio/harness';

const root = fileURLToPath(new URL('..', import.meta.url));
const VERBOSE = !!process.env.AUDIO_REPORT;

function chromiumPath(): string | undefined {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = '/opt/pw-browsers';
  if (!existsSync(base)) return undefined;
  const dir = readdirSync(base).find((d) => /^chromium-\d+$/.test(d));
  const exe = dir && `${base}/${dir}/chrome-linux/chrome`;
  return exe && existsSync(exe) ? exe : undefined;
}

let browser: Browser | null = null;
let page: Page | null = null;
let skip: string | false = false;

before(async () => {
  try {
    const bundle = await build({
      entryPoints: [`${root}tests/audio/harness.ts`],
      bundle: true,
      write: false,
      format: 'iife',
      target: 'es2022',
      alias: { '@shared': `${root}src/shared` },
      logLevel: 'silent',
    });
    const exe = chromiumPath();
    browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--autoplay-policy=no-user-gesture-required'] });
    page = await browser.newPage();
    await page.setContent('<!doctype html><html><body></body></html>');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
  } catch (e) {
    skip = `Chromium indisponible : ${(e as Error).message.split('\n')[0]}`;
  }
});

after(async () => {
  await browser?.close();
});

const render = (duration: number, steps: Step[], musicSetting = 0.4) =>
  page!.evaluate(([d, s, m]) => (window as any).__harness.renderScenario(d, s, m), [duration, steps, musicSetting] as const) as Promise<Analysis>;

/** Repères de la cinématique (durée serveur par défaut : 20 s), comme les envoie IntroSequence. */
function introSteps(durationMs = 20000, offset = 0): Step[] {
  const at = (s: string) => offset + introSchedule(durationMs).find((x) => x.state === s)!.at / 1000;
  const villa = at('INTRO_VILLA');
  const end = at('GAME_START');
  return [
    { at: offset, play: 'intro', fade: 2.5 },
    { at: at('INTRO_CAR'), mark: 'drive' },
    { at: at('INTRO_POINT'), mark: 'pointing' },
    { at: at('INTRO_REVEAL'), mark: 'villaReveal' },
    { at: villa, mark: 'arrival' },
    { at: villa + (end - villa) * 0.45, mark: 'silhouette' },
    { at: villa + (end - villa) * 0.84, mark: 'enterHouse' },
    { at: end - 1, mark: 'bodyDiscovered' },
    { at: end, mark: 'end' },
  ];
}

const report = (name: string, a: Analysis) => {
  if (VERBOSE)
    console.log(
      `${name.padEnd(22)} crête ${a.peakDb.toFixed(1)} dBFS · RMS ${a.rmsDb.toFixed(1)} dBFS · ≈${a.lufs.toFixed(1)} LUFS · platitude méd. ${a.flatnessMedian.toExponential(1)} p90 ${a.flatnessP90.toExponential(1)} · >5 kHz ${(a.hfRatio * 100).toFixed(2)} %`,
    );
};

/** Critères communs d'une musique « discrète, sans pluie ». */
function assertQuietTonal(name: string, a: Analysis) {
  assert.ok(a.peakDb < -14, `${name} : crête ${a.peakDb.toFixed(1)} dBFS (attendu < −14)`);
  assert.ok(a.lufs < -24 && a.lufs > -36, `${name} : sonie ${a.lufs.toFixed(1)} LUFS (attendu entre −36 et −24)`);
  assert.ok(a.flatnessMedian < 0.05, `${name} : platitude spectrale médiane ${a.flatnessMedian.toFixed(3)} (bruit large bande ?)`);
  assert.ok(a.flatnessP90 < 0.15, `${name} : platitude p90 ${a.flatnessP90.toFixed(3)}`);
  assert.ok(a.hfRatio < 0.01, `${name} : énergie > 5 kHz ${(a.hfRatio * 100).toFixed(2)} %`);
}

const cache = new Map<string, Promise<Analysis>>();
const once = (k: string, f: () => Promise<Analysis>) => {
  if (!cache.has(k)) cache.set(k, f());
  return cache.get(k)!;
};
const introSolo = () => once('intro', () => render(32, introSteps()));
const invSolo = () => once('inv', () => render(90, [{ at: 0, play: 'investigation', fade: 6 }]));

test('le témoin « ancienne pluie » est bien détecté comme bruit large bande', async (t) => {
  if (skip) return t.skip(skip);
  const rain = (await page!.evaluate(() => (window as any).__harness.renderOldRain(10))) as Analysis;
  report('ancienne pluie', rain);
  assert.ok(rain.flatnessMedian > 0.3, `platitude ${rain.flatnessMedian}`);
  assert.ok(rain.hfRatio > 0.05);
});

test('cue « menu » : discrète, tonale, sans bruit', async (t) => {
  if (skip) return t.skip(skip);
  const a = await render(70, [{ at: 0, play: 'menu', fade: 4 }]);
  report('menu', a);
  assertQuietTonal('menu', a);
});

test('cue « intro » (repères de la cinématique) : discrète, tonale, fondu d’entrée', async (t) => {
  if (skip) return t.skip(skip);
  const a = await introSolo();
  report('intro', a);
  assertQuietTonal('intro', a);
  // fondu d'entrée : la première demi-seconde est quasi muette, puis la musique monte
  assert.ok(a.envelope[0] < Math.max(...a.envelope.slice(4, 40)) - 12, 'pas d’attaque brutale au début');
});

test('cue « investigation » : la plus discrète, longs silences', async (t) => {
  if (skip) return t.skip(skip);
  const a = await invSolo();
  report('investigation', a);
  assertQuietTonal('investigation', a);
  const intro = await introSolo();
  assert.ok(a.lufs <= intro.lufs + 1, 'la musique de jeu ne dépasse pas celle de la cinématique');
});

test('repère « tension » en partie : inflexion douce, pas de pic', async (t) => {
  if (skip) return t.skip(skip);
  const a = await render(60, [{ at: 0, play: 'investigation', fade: 6 }, { at: 30, mark: 'tension' }]);
  report('investigation+tension', a);
  assertQuietTonal('investigation+tension', a);
});

test('enchaînement cinématique → partie : pas de bosse de volume, pas de chevauchement', async (t) => {
  if (skip) return t.skip(skip);
  const xEnd = 22; // fin de la cinématique + fondu de sortie de l'écran
  const a = await render(48, [...introSteps(), { at: xEnd, play: 'investigation', fade: 6 }]);
  report('intro→investigation', a);
  assertQuietTonal('intro→investigation', a);
  const intro = await introSolo();
  const inv = await invSolo();
  const win = a.envelope.slice(Math.floor(xEnd / 0.25), Math.floor((xEnd + 12) / 0.25));
  const ref = Math.max(...intro.envelope, ...inv.envelope);
  if (VERBOSE) console.log(`fondu : max ${Math.max(...win).toFixed(1)} dB (fenêtres 0,5 s) · référence cue seule ${ref.toFixed(1)} dB`);
  assert.ok(Math.max(...win) <= ref + 1, `fondu ${Math.max(...win).toFixed(1)} dB > référence ${ref.toFixed(1)} dB`);
  assert.ok(a.peakDb <= Math.max(intro.peakDb, inv.peakDb) + 1, 'crête du fondu');
  // pas de chute brutale au début du fondu (la nappe de fin d'intro est tenue : niveau stable)
  const k = Math.floor(xEnd / 0.25);
  const drop = a.envelope[k - 2] - a.envelope[k + 2];
  if (VERBOSE) console.log(`chute sur la première seconde du fondu : ${drop.toFixed(2)} dB`);
  assert.ok(drop < 2.5, `chute de ${drop.toFixed(1)} dB en 1 s au début du fondu`);
  // passage menu → partie très court (pire cas) : toujours rien au-dessus du niveau d'une cue seule
  const b = await render(30, [{ at: 0, play: 'menu', fade: 1 }, { at: 12, play: 'investigation', fade: 0.5 }]);
  assert.ok(b.peakDb < -14);
});

test('réglage Musique : le niveau suit le curseur, 0 = silence', async (t) => {
  if (skip) return t.skip(skip);
  const loud = await render(30, [{ at: 0, play: 'menu', fade: 2 }], 1);
  const def = await render(30, [{ at: 0, play: 'menu', fade: 2 }], 0.4);
  const mute = await render(10, [{ at: 0, play: 'menu', fade: 2 }], 0);
  report('menu @100 %', loud);
  assert.ok(loud.lufs > def.lufs + 6, 'plus fort au maximum');
  assert.ok(loud.peakDb < -1, `crête au maximum ${loud.peakDb.toFixed(1)} dBFS (limiteur)`);
  assert.equal(mute.peakDb, -Infinity);
});

test('AudioContext réel : intro → partie sans reste, réglages en direct, pas de fuite', async (t) => {
  if (skip) return t.skip(skip);
  const log = (await page!.evaluate(() => (window as any).__harness.liveFlow())) as Record<string, any>;
  if (VERBOSE) console.log(JSON.stringify({ intro: log.intro, game: log.game, afterRepeats: log.afterRepeats }, null, 1));
  assert.equal(log.menu.music, 'menu');
  assert.equal(log.intro.music, 'intro');
  assert.deepEqual(log.intro.cues.map((c: any) => c.name), ['intro']);
  assert.ok(log.intro.cues[0].liveSources > 0, 'la cinématique joue');
  assert.deepEqual([...log.intro.loops].sort(), ['intro:engine', 'intro:road']);
  // pendant le fondu : au plus l'intro qui s'éteint + la nouvelle cue
  assert.ok(log.crossfading.cues.length <= 2);
  // en partie : seule la musique d'enquête, aucune boucle (ni pluie, ni moteur, ni route)
  assert.equal(log.game.music, 'investigation');
  assert.deepEqual(log.game.cues.map((c: any) => c.name), ['investigation']);
  assert.deepEqual(log.game.loops, []);
  for (const snap of [log.menu, log.intro, log.game]) assert.ok(!JSON.stringify(snap).match(/rain|pluie|thunder/i));
  // réglages appliqués en direct sur les bus
  assert.ok(Math.abs(log.afterSettings.buses.music - log.expected.music08) < 0.02, `bus musique ${log.afterSettings.buses.music}`);
  assert.ok(Math.abs(log.afterSettings.buses.sfx - log.expected.sfx02) < 0.02, `bus effets ${log.afterSettings.buses.sfx}`);
  assert.ok(log.musicMuted.buses.music < 0.001);
  assert.ok(Math.abs(log.musicMuted.buses.sfx - 0.6) < 0.02, 'couper la musique ne touche pas les effets');
  // parties répétées : une seule cue, sources bornées, aucune boucle orpheline
  assert.deepEqual(log.afterRepeats.cues.map((c: any) => c.name), ['investigation']);
  assert.ok(log.afterRepeats.cues[0].liveSources < 200, `sources vivantes ${log.afterRepeats.cues[0].liveSources}`);
  assert.deepEqual(log.afterRepeats.loops, []);
});

test('plus aucun son de pluie / tonnerre dans le code client', () => {
  const files = ['src/client/audio.ts', 'src/client/music.ts', 'src/client/game/intro/IntroAudio.ts', 'src/client/ui/game/FeedPanel.tsx'];
  for (const f of files) {
    const src = readFileSync(`${root}${f}`, 'utf8');
    assert.ok(!/startRain|thunder\(|startDrone/.test(src), `${f} contient encore la pluie / le tonnerre`);
  }
});
