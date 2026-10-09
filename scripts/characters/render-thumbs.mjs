/**
 * Vignettes du catalogue, rendues avec les vrais modèles dans Chromium (Playwright + Three.js) :
 *   public/characters/thumbs/<castId>.jpg  (256×320, tête et épaules)
 *   public/characters/cards/<castId>.jpg   (240×480, en pied)
 *
 *   node scripts/characters/render-thumbs.mjs [castId…]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CAST_SOURCES, OUT } from './config.mjs';
import { dataUrlToBuffer, openHarness } from './lib/harness-server.mjs';

const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CAST_SOURCES);
const h = await openHarness();
try {
  for (const dir of ['thumbs', 'cards']) mkdirSync(join(OUT, dir), { recursive: true });
  for (const id of ids) {
    for (const [kind, dir] of [['thumb', 'thumbs'], ['card', 'cards']]) {
      const url = await h.page.evaluate(([i, k]) => window.harness.shot(i, k), [id, kind]);
      writeFileSync(join(OUT, dir, `${id}.jpg`), dataUrlToBuffer(url));
    }
    console.log(`${id} ✓`);
  }
  if (h.errors.length) console.warn('Erreurs navigateur :\n' + h.errors.join('\n'));
} finally {
  await h.close();
}
