/**
 * Reconstruit tout le catalogue depuis le clone Rocketbox :
 *   node scripts/characters/build.mjs
 * (avatars → animations → licence → vignettes). Voir public/characters/README.md.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OUT } from './config.mjs';
import { ROCKETBOX } from './lib/rocketbox.mjs';

const here = dirname(fileURLToPath(import.meta.url));
for (const step of ['build-avatars.mjs', 'build-anims.mjs']) {
  console.log(`\n── ${step}`);
  execFileSync(process.execPath, [join(here, step)], { stdio: 'inherit' });
}
// Licence MIT d'origine, avec attribution
const license = execFileSync('git', ['-C', ROCKETBOX, 'show', 'HEAD:LICENSE.md']).toString();
writeFileSync(
  join(OUT, 'LICENSE-ROCKETBOX.txt'),
  `Personnages 3D et animations : Microsoft Rocketbox Avatar Library\nhttps://github.com/microsoft/Microsoft-Rocketbox\nConvertis et redimensionnés pour « Everyone Has a Secret » (scripts/characters/).\n\n${license}`,
);
console.log('\n── render-thumbs.mjs');
execFileSync(process.execPath, [join(here, 'render-thumbs.mjs')], { stdio: 'inherit' });
