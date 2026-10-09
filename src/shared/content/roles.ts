/**
 * Spécialités d'enquête — distribuées au début de la nuit (le meurtrier en reçoit une aussi, et peut mentir).
 * affinity : métriques (calculées par le serveur à partir du journal de vérité)
 * qui rendent un joueur plus susceptible d'obtenir ce rôle.
 * Chaque outil est implémenté par un handler générique côté serveur (roles.ts).
 */
export type RoleMetric =
  | 'discoveredBody'
  | 'objectsTouched'
  | 'timeInOffice'
  | 'timeInCrimeRoom'
  | 'socialActions'
  | 'relationsCount'
  | 'examinations';

export interface RoleToolDef {
  id: string;
  name: string;
  description: string;
  /** cible attendue : joueur proche, objet (inventaire/proche), corps, aucune */
  target: 'player' | 'object' | 'body' | 'none' | 'testimony';
  maxUses?: number;
}

export interface RoleDef {
  id: string;
  name: string;
  description: string;
  /** ordre de priorité si moins de joueurs que de rôles */
  priority: number;
  affinity: Partial<Record<RoleMetric, number>>;
  tools: RoleToolDef[];
}

export const ROLES: RoleDef[] = [
  {
    id: 'investigator',
    name: 'Enquêteur·rice',
    description: 'Reconstitue les déplacements, interroge, et peut vérifier la cohérence de deux témoignages.',
    priority: 1,
    affinity: { socialActions: 2 },
    tools: [
      { id: 'request_testimony', name: 'Interroger', description: 'Exige d’un joueur une déclaration publique d’alibi pour 21h00–22h00.', target: 'player' },
      { id: 'verify_testimony', name: 'Vérifier un alibi', description: 'Confronte une déclaration d’alibi aux faits : exacte, partiellement exacte ou fausse.', target: 'player', maxUses: 1 },
    ],
  },
  {
    id: 'forensic',
    name: 'Médecin légiste',
    description: 'Examine le corps : cause, heure de la mort, et ce que la victime a laissé sous ses ongles.',
    priority: 2,
    affinity: { discoveredBody: 5, examinations: 1 },
    tools: [{ id: 'examine_body', name: 'Autopsie', description: 'Examiner le corps (être à proximité).', target: 'body', maxUses: 2 }],
  },
  {
    id: 'scientist',
    name: 'Scientifique',
    description: 'Relève et compare les empreintes digitales. Ne connaît pas les empreintes des autres sans les prélever.',
    priority: 3,
    affinity: { objectsTouched: 1, examinations: 2 },
    tools: [
      { id: 'analyze_prints', name: 'Analyser les empreintes', description: 'Analyser un objet (en main ou à proximité).', target: 'object' },
      { id: 'take_prints', name: 'Prélever des empreintes', description: 'Relever les empreintes d’un joueur proche.', target: 'player' },
    ],
  },
  {
    id: 'inspector',
    name: 'Inspecteur·rice',
    description: 'Analyse la scène : traces de pas, sang dilué, cachettes dérangées. Peut examiner les semelles.',
    priority: 4,
    affinity: { timeInCrimeRoom: 3 },
    tools: [
      { id: 'inspect_room', name: 'Inspecter la pièce', description: 'Révèle les traces de la pièce où vous êtes.', target: 'none' },
      { id: 'examine_shoes', name: 'Examiner les semelles', description: 'Relever le motif des chaussures d’un joueur proche.', target: 'player' },
    ],
  },
  {
    id: 'analyst',
    name: 'Analyste numérique',
    description: 'Contourne un verrouillage (téléphone, ordinateur, coffret) et lit les métadonnées des photos et fichiers.',
    priority: 3,
    affinity: {},
    tools: [{ id: 'bypass_lock', name: 'Contourner un verrou', description: 'Déverrouille un appareil ou un coffret à portée, sans le code.', target: 'object', maxUses: 1 }],
  },
  {
    id: 'profiler',
    name: 'Profileur·se',
    description: 'Lit les comportements : qui s’est disputé, qui a trahi, qui a aidé qui.',
    priority: 6,
    affinity: { relationsCount: 3 },
    tools: [{ id: 'social_profile', name: 'Dresser les profils', description: 'Analyse des tensions sociales de la soirée.', target: 'none', maxUses: 2 }],
  },
];

export const roleById = (id: string) => ROLES.find((r) => r.id === id);
