import { GAME_NAME, GAME_VERSION } from '@shared/config';
import { createApp } from './app';

const port = Number(process.env.PORT ?? 3001);
const ctx = createApp();

ctx.http.listen(port, () => {
  console.log(`\n  ${GAME_NAME} — serveur ${GAME_VERSION}`);
  console.log(`  → http://localhost:${port}\n`);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    ctx.close().finally(() => process.exit(0));
  });
}
