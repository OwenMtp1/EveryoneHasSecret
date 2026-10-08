import { randomBytes, randomUUID } from 'node:crypto';

export const newId = () => randomUUID();
export const shortId = (prefix = '') => prefix + randomBytes(5).toString('hex');

/** Code de partie lisible (sans caractères ambigus). */
export function lobbyCode(len = 6): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

/** Générateur pseudo-aléatoire déterministe (mulberry32) — utile pour rejouer/tester une graine. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: T[], rnd: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const pick = <T>(arr: readonly T[], rnd: () => number = Math.random): T => arr[Math.floor(rnd() * arr.length)];

export class UserError extends Error {}
