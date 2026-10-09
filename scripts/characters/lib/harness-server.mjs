/**
 * Serveur Vite du banc d'essai (scripts/characters/harness) + navigateur Chromium (Playwright).
 * Chromium : variable CHROMIUM_PATH (défaut /opt/pw-browsers/chromium-*\/chrome-linux/chrome si présent).
 */
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { existsSync, readdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../config.mjs';

function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = '/opt/pw-browsers';
  if (!existsSync(base)) return undefined;
  for (const d of readdirSync(base).filter((n) => /^chromium-\d+$/.test(n))) {
    const p = join(base, d, 'chrome-linux', 'chrome');
    if (existsSync(p)) return p;
  }
  return undefined;
}

export async function openHarness({ width = 960, height = 540 } = {}) {
  const server = await createServer({
    configFile: false,
    root: join(ROOT, 'scripts', 'characters', 'harness'),
    publicDir: join(ROOT, 'public'),
    resolve: { alias: { '@shared': join(ROOT, 'src', 'shared') } },
    server: { port: 0, host: '127.0.0.1', fs: { allow: [ROOT, realpathSync(join(ROOT, 'node_modules'))] } },
    logLevel: 'warn',
  });
  await server.listen();
  const url = server.resolvedUrls.local[0];
  const browser = await chromium.launch({
    executablePath: chromiumPath(),
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(m.text()));
  await page.goto(url);
  await page.waitForFunction(() => document.title === 'ready', null, { timeout: 120000 });
  return {
    page,
    errors,
    async close() {
      await browser.close();
      await server.close();
    },
  };
}

/** data:image/...;base64,… → Buffer */
export const dataUrlToBuffer = (u) => Buffer.from(u.slice(u.indexOf(',') + 1), 'base64');
