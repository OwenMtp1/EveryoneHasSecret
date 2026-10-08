/**
 * Villa de jeu construite à l'avance (pendant l'écran de chargement qui précède la cinématique) :
 * la partie s'affiche ensuite sans attendre la génération de la villa.
 */
import { buildVilla, type Villa3D } from './villa3d';

let cached: Villa3D | null = null;

export function prebuildGameVilla(): Villa3D {
  return (cached ??= buildVilla());
}

/** La vue de jeu prend la villa pré-construite (ou en construit une si aucune n'est prête). */
export function takeGameVilla(): Villa3D {
  const v = cached ?? buildVilla();
  cached = null;
  return v;
}
