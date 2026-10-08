/**
 * Familles de scénarios. Un scénario n'est PAS une histoire écrite : c'est une « graine »
 * (secrets, objets, règles d'événements) posée au début de la partie. Ce que les joueurs
 * en font décide de la suite. Plusieurs graines peuvent coexister (scénarios hybrides).
 */
export interface ScenarioFamily {
  id: 'murder' | 'heist' | 'conspiracy' | 'disappearance' | 'survival';
  name: string;
  description: string;
  implemented: boolean;
  /** Probabilité que la graine soit posée dans une partie. */
  seedChance: number;
  /** Secrets qui portent la graine. */
  seedSecrets?: string[];
}

export const SCENARIO_FAMILIES: ScenarioFamily[] = [
  { id: 'murder', name: 'Meurtre', description: 'Aucun tueur désigné : un meurtre devient possible lorsque le monde crée une opportunité.', implemented: true, seedChance: 1 },
  { id: 'heist', name: 'Vol', description: 'Le Collier Beaumont attire au moins un invité. Sa disparition peut devenir l’événement majeur.', implemented: true, seedChance: 0.6, seedSecrets: ['thief'] },
  { id: 'conspiracy', name: 'Conspiration', description: 'Deux invités sont liés par un pacte caché qu’ils ne peuvent révéler.', implemented: true, seedChance: 0.5, seedSecrets: ['old_pact'] },
  { id: 'disappearance', name: 'Disparition', description: 'Un invité disparaît. (prévu)', implemented: false, seedChance: 0 },
  { id: 'survival', name: 'Survie', description: 'Un événement met tous les invités en danger. (prévu)', implemented: false, seedChance: 0 },
];

/** Motifs de semelles et formats d'empreintes : identités physiques cachées des joueurs. */
export const SHOE_PATTERNS = ['chevrons', 'losanges', 'crampons', 'vagues', 'semelle lisse', 'étoiles', 'grille', 'cercles concentriques'];
export const SHOE_SIZES = [37, 38, 39, 40, 41, 42, 43, 44, 45];
