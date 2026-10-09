/**
 * Vérification visuelle et chiffrée des personnages dans un vrai navigateur (Chromium headless) :
 *   - les 40 modèles se chargent et s'animent (attente, marche, course : pas de pose en T) ;
 *   - glissement des pieds mesuré (vitesse du pied d'appui) aux vitesses du jeu ;
 *   - gestes, mort, photos d'exemple.
 * Captures dans screenshots/characters/ (ignoré par git).
 *
 *   node scripts/characters/verify.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CAST_SOURCES, ROOT } from './config.mjs';
import { dataUrlToBuffer, openHarness } from './lib/harness-server.mjs';

const SHOTS = join(ROOT, 'screenshots', 'characters');
mkdirSync(SHOTS, { recursive: true });
const ids = Object.keys(CAST_SOURCES);
const h = await openHarness({ width: 1600, height: 900 });
const { page } = h;
const shot = (name) => page.locator('#view').screenshot({ path: join(SHOTS, `${name}.png`) });
const lineup = (list, opts) => page.evaluate(([l, o]) => window.harness.lineup(l, o), [list, opts]);
await page.evaluate(() => {
  const c = document.getElementById('view');
  c.width = 1600;
  c.height = 900;
});

try {
  // 1. Tous les modèles, au repos (attente) puis en marche et en course
  for (const g of ['f', 'm']) {
    const list = ids.filter((i) => i[0] === g);
    await lineup(list, { time: 2, cols: 10 });
    await shot(`idle-${g}`);
    await lineup(list, { time: 2.3, speed: 1.9, cols: 10, angle: Math.PI / 2 });
    await shot(`walk-${g}`);
    await lineup(list, { time: 1.7, speed: 3.9, cols: 10, angle: Math.PI / 2 });
    await shot(`run-${g}`);
  }
  // 2. Séquence de marche (profil) pour juger la démarche
  for (const [i, t] of [0.1, 0.25, 0.4, 0.55].entries()) {
    await lineup(['f01', 'm08', 'f17', 'm18'], { time: 1 + t, speed: 1.9, angle: Math.PI / 2 });
    await shot(`walk-seq-${i}`);
  }
  // 3. Gestes et mort
  for (const g of ['take', 'search', 'examine', 'attack', 'wash']) {
    await lineup(['f04', 'm11'], { time: 0.7, gesture: g, gestureAt: 0.05, angle: 0.6 });
    await shot(`gesture-${g}`);
  }
  await lineup(['f14', 'm05'], { time: 0.5, dead: true, angle: 0.4 });
  await shot('dead');
  // pose assise de la cinématique (gestes procéduraux par-dessus l'attente)
  const SIT = { RightUpLeg: { bend: -1.4 }, LeftUpLeg: { bend: -1.4 }, RightLeg: { bend: 1.35 }, LeftLeg: { bend: 1.35 }, Spine: { bend: -0.06 }, RightArm: { aim: [0.08, -0.9, 0.35] }, RightForeArm: { aim: [0.25, -0.3, 1] }, LeftArm: { aim: [-0.08, -0.9, 0.35] }, LeftForeArm: { aim: [-0.25, -0.3, 1] } };
  await lineup(['f07', 'm02', 'f17', 'm18'], { time: 1, pose: SIT, angle: 0.9 });
  await shot('sit-intro');
  await lineup(['f02', 'm03', 'f18', 'm13'], { time: 1, view: 'head' });
  await shot('heads');
  // 4. Glissement des pieds
  const slide = [];
  for (const id of ['f01', 'f16', 'm01', 'm18']) for (const s of [1.0, 1.9, 3.9]) slide.push(await page.evaluate(([i, sp]) => window.harness.footSlide(i, sp), [id, s]));
  console.table(slide);
  writeFileSync(join(SHOTS, 'foot-slide.json'), JSON.stringify(slide, null, 2));
  // 5. Photos
  const specs = [
    { castIds: ['f03'], scene: 'portrait', seed: 1 },
    { castIds: ['f01', 'm04', 'f17', 'm20'], scene: 'group', caption: "'24 7 14", seed: 2 },
    { castIds: ['m07', 'f14'], scene: 'restaurant', seed: 3 },
    { castIds: ['f16', 'm06', 'f15'], scene: 'beach', caption: "'23 8 02", seed: 4 },
    { castIds: ['m05', 'f09'], scene: 'cliff', seed: 5 },
    { castIds: ['f11', 'm10', 'f10', 'm13', 'f16'], scene: 'party', seed: 6 },
    { castIds: ['m17', 'f18'], scene: 'office', seed: 7 },
    { castIds: ['m11', 'f08'], scene: 'street', seed: 8 },
    { castIds: ['m19', 'f05'], scene: 'car', seed: 9 },
    { castIds: ['f19', 'm03', 'f02'], scene: 'villa', caption: "'25 6 21", seed: 10 },
  ];
  const t0 = Date.now();
  for (const s of specs) {
    const url = await page.evaluate((sp) => window.harness.photo(sp), s);
    writeFileSync(join(SHOTS, `photo-${s.scene}.jpg`), dataUrlToBuffer(url));
  }
  console.log(`10 photos en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  const errs = h.errors.filter((e) => !/favicon|404 \(Not Found\)/.test(e));
  if (errs.length) console.warn('Erreurs navigateur :\n' + errs.join('\n'));
  else console.log('Aucune erreur navigateur.');
} finally {
  await h.close();
}
