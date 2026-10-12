/**
 * Progression du joueur : expérience calculée à partir des nuits jouées et gagnées (déjà enregistrées par le
 * serveur), niveaux et titres. Rien de plus à stocker : le calcul est le même partout.
 */
export const XP_PER_GAME = 100;
export const XP_PER_WIN = 150;

const TITLES: [number, string][] = [
  [1, 'Invité·e de passage'],
  [2, 'Témoin'],
  [3, 'Fouineur·se'],
  [5, 'Enquêteur·rice'],
  [8, 'Inspecteur·rice'],
  [12, 'Commissaire'],
  [18, 'Légende de la villa'],
];

/** XP total nécessaire pour atteindre le niveau n (n ≥ 1) : 0, 200, 600, 1200, 2000… */
export const xpForLevel = (n: number) => 100 * n * (n - 1);

export function progression(gamesPlayed: number, gamesWon: number) {
  const xp = gamesPlayed * XP_PER_GAME + gamesWon * XP_PER_WIN;
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  const from = xpForLevel(level);
  const to = xpForLevel(level + 1);
  const title = [...TITLES].reverse().find(([l]) => level >= l)![1];
  const next = TITLES.find(([l]) => l > level);
  return { xp, level, title, progress: (xp - from) / (to - from), toNext: to - xp, nextTitle: next ? { level: next[0], title: next[1] } : null };
}

export const xpForGame = (won: boolean) => XP_PER_GAME + (won ? XP_PER_WIN : 0);
