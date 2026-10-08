/**
 * Identité et réglages globaux du jeu.
 * Le nom du jeu est centralisé ici : changer GAME_NAME suffit à le renommer partout
 * (écran d'accueil, titre du navigateur, menu, lobby, transitions).
 */
export const GAME_NAME = 'EVERYONE HAS A SECRET';
export const GAME_SHORT_NAME = 'EHAS';
export const GAME_TAGLINE = 'Les joueurs créent l’histoire. La villa garde la vérité.';
export const GAME_VERSION = '0.1.0-prototype';

export const META_CONFIG = {
  username: { min: 3, max: 20, pattern: /^[A-Za-z0-9_.-]+$/ },
  password: { min: 6, max: 128 },
  characterName: { min: 2, max: 20 },
  lobbyName: { min: 3, max: 32 },
  lobbyCodeLength: 6,
  /** Nombre minimum de joueurs pour lancer une partie (4 recommandé, 2 permis pour tester). */
  minPlayersToStart: 2,
  maxPlayersOptions: [2, 3, 4, 5, 6, 7, 8],
  defaultMaxPlayers: 6,
  sessionDays: 30,
  chatMaxLength: 280,
} as const;

export const GAME_CONFIG = {
  /** Fréquence de simulation du serveur (Hz). */
  tickRate: 20,
  /** Fréquence d'envoi des snapshots aux clients (Hz). */
  snapshotRate: 12,
  /** Vitesse de déplacement en tuiles / seconde. */
  moveSpeed: 4.2,
  playerRadius: 0.32,
  /** Distance d'interaction en tuiles. */
  interactRange: 1.6,
  inventorySize: 4,
  /** Heure de début de la nuit (minutes depuis minuit). 23:47 */
  startClockMinutes: 23 * 60 + 47,
  /** Minutes de jeu écoulées par seconde réelle. */
  gameMinutesPerSecond: 0.2,
  /** Durée pendant laquelle les chaussures restent boueuses après le jardin (s réelles). */
  mudDurationSec: 25,
  /** Intervalle minimum entre deux empreintes de boue d'un même joueur (s). */
  footprintIntervalSec: 1.6,
} as const;

/** Formate des minutes depuis minuit en HH:MM (gère le passage de minuit). */
export function formatClock(minutes: number): string {
  const m = ((Math.floor(minutes) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
