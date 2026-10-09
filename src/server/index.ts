import { GAME_NAME, GAME_VERSION } from '@shared/config';
import { createApp } from './app';

// Variables locales facultatives (.env, jamais commité)
try {
  process.loadEnvFile();
} catch {
  /* pas de fichier .env */
}

const port = Number(process.env.PORT ?? 3001);
const ctx = createApp();

ctx.http.listen(port, () => {
  console.log(`\n  ${GAME_NAME} — serveur ${GAME_VERSION}`);
  console.log(`  → http://localhost:${port}`);
  console.log(`  comptes : ${ctx.auth.mode === 'supabase' ? 'Supabase Auth' : 'locaux'} · données : ${ctx.store.kind}\n`);
  if (ctx.store.kind === 'sqlite' && process.env.NODE_ENV === 'production')
    console.warn('  ⚠ Production sans Supabase : les comptes ne survivront que si le fichier SQLite est sur un disque persistant (voir docs/SUPABASE.md).\n');
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    ctx.close().finally(() => process.exit(0));
  });
}
