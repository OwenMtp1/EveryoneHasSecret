/**
 * Mini-jeu « forcer une serrure », partagé client/serveur : le serveur choisit la graine, le client joue, le
 * serveur recalcule chaque frappe (instant → position du curseur) et décide seul de la réussite.
 */
export const FORCE_PINS = 3;

/** Position du curseur (0…1) à `tMs` depuis le début du mini-jeu, pour la goupille `pin` (de plus en plus vite). */
export const forceCursor = (tMs: number, pin: number) => 0.5 - 0.5 * Math.cos((tMs / 1000) * (0.9 + pin * 0.35) * Math.PI);

/** Zones à viser (une par goupille, de plus en plus étroites), tirées de la graine. */
export function forceZones(seed: number): { at: number; w: number }[] {
  let s = (seed >>> 0) || 1;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const out: { at: number; w: number }[] = [];
  let w = 0.22;
  for (let i = 0; i < FORCE_PINS; i++) {
    out.push({ at: w / 2 + r() * (1 - w), w });
    w = Math.max(0.1, w - 0.05);
  }
  return out;
}

/** Les frappes (ms depuis le début) touchent-elles toutes leur zone ? Tolérance de 2 % pour l'affichage. */
export function forceSucceeds(seed: number, strikes: unknown): boolean {
  if (!Array.isArray(strikes) || strikes.length !== FORCE_PINS) return false;
  const zones = forceZones(seed);
  let prev = 0;
  for (let i = 0; i < FORCE_PINS; i++) {
    const t = Number(strikes[i]);
    if (!Number.isFinite(t) || t < prev + 80 || t > 60_000) return false;
    prev = t;
    if (Math.abs(forceCursor(t, i) - zones[i].at) > zones[i].w / 2 + 0.02) return false;
  }
  return true;
}
