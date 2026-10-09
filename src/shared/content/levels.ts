/**
 * Niveaux de la villa — repère commun au serveur, aux clients et aux données (villa.ts, furnishing.ts).
 *
 * Le serveur raisonne en 2D sur UNE grille : chaque niveau y occupe sa propre bande horizontale
 * (même repère local, décalé de levelOffset(niveau) en x). Le rendu 3D replace chaque bande à sa
 * hauteur : x local = x − décalage, hauteur = niveau × LEVEL_HEIGHT.
 *
 *   bande 0 : rez-de-chaussée (0)   bande 1 : étage (1) + cabanes perchées   bande 2 : grenier (2)
 *   bande 3 : sous-sol (−1)
 */

export type Level = -1 | 0 | 1 | 2;
/** Du plus bas au plus haut. */
export const LEVELS: readonly Level[] = [-1, 0, 1, 2];

/** Emprise de la propriété (un niveau), en tuiles de 1 m : maison, jardin, verger, allée. */
export const WORLD_W = 66;
export const WORLD_H = 28;
/** Largeur d'une bande de niveau dans la grille (une colonne de marge pour les murs). */
export const LEVEL_STRIDE = WORLD_W + 2;
const BAND: Record<Level, number> = { 0: 0, 1: 1, 2: 2, [-1]: 3 };
const BAND_LEVEL: Level[] = [0, 1, 2, -1];
/** Largeur totale de la grille (toutes les bandes). */
export const GRID_W = BAND_LEVEL.length * LEVEL_STRIDE;
/** Hauteur d'un niveau (sol à sol), en mètres. */
export const LEVEL_HEIGHT = 3.3;

/** Décalage en x de la bande d'un niveau. */
export const levelOffset = (l: Level) => BAND[l] * LEVEL_STRIDE;
/** Abscisse de grille d'une abscisse locale d'un niveau. */
export const gridX = (l: Level, x: number) => x + BAND[l] * LEVEL_STRIDE;
/** Niveau d'une abscisse de grille (les murs à x = −1 / WORLD_W d'une bande en font partie). */
export function levelOf(x: number): Level {
  const b = Math.floor((x + 1) / LEVEL_STRIDE);
  return BAND_LEVEL[b < 0 ? 0 : b > 3 ? 3 : b];
}
/** Abscisse locale (repère du rez-de-chaussée) d'une abscisse de grille. */
export const localX = (x: number) => x - levelOffset(levelOf(x));
/** Hauteur (m) du sol d'un niveau. */
export const levelBase = (l: Level) => l * LEVEL_HEIGHT;
