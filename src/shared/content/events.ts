/**
 * Système d'événements — règles data-driven.
 *
 * Chaque règle écoute des faits du JOURNAL DE VÉRITÉ (on), vérifie des conditions (when)
 * et applique des conséquences (effects). Le moteur (server/game/events/engine.ts) ne contient
 * aucune histoire : uniquement des handlers génériques de conditions et d'effets.
 *
 * Les durées sont en secondes réelles et multipliées par le facteur d'échelle de la partie
 * (EHAS_TIME_SCALE) pour accélérer les tests.
 *
 * Gabarits de texte : {actor} {target} {object} {room} {victim} {clock}
 */
import type { Phase } from '../types';

export const TRUTH_EVENT_TYPES = [
  'GAME_STARTED',
  'TICK',
  'PHASE_CHANGED',
  'PLAYER_ENTERED_ROOM',
  'PLAYER_LEFT_ROOM',
  'OBJECT_SPAWNED',
  'OBJECT_PICKED_UP',
  'OBJECT_DROPPED',
  'OBJECT_HIDDEN',
  'OBJECT_GIVEN',
  'OBJECT_FOUND',
  'OBJECT_USED',
  'OBJECT_EXAMINED',
  'OBJECT_CLEANED',
  'OBJECT_DESTROYED',
  'PLAYER_TOUCHED_OBJECT',
  'DOOR_UNLOCKED',
  'DOOR_FORCED',
  'FURNITURE_SEARCHED',
  'RELATION_PROPOSED',
  'RELATION_CREATED',
  'RELATION_DECLINED',
  'RELATION_BROKEN',
  'BETRAYAL',
  'SECRET_DISCOVERED',
  'PLAYER_WASHED',
  'PLAYER_ATTACKED',
  'PLAYER_DIED',
  'BODY_DISCOVERED',
  'EVIDENCE_CREATED',
  'EVIDENCE_DESTROYED',
  'BLACKOUT_STARTED',
  'BLACKOUT_ENDED',
  'CASE_OPENED',
  'ROLE_ASSIGNED',
  'TOOL_USED',
  'KNOWLEDGE_SHARED',
  'CLAIM_MADE',
  'TESTIMONY_GIVEN',
  'VOTE_CAST',
  'EVENT_TRIGGERED',
  'GAME_ENDED',
] as const;
export type TruthEventType = (typeof TRUTH_EVENT_TYPES)[number];

export type Condition =
  | { type: 'phaseIn'; phases: Phase[] }
  | { type: 'elapsedAtLeast'; seconds: number }
  | { type: 'phaseElapsedAtLeast'; seconds: number }
  | { type: 'noCase' }
  | { type: 'hasCase' }
  | { type: 'flag'; name: string; value: boolean }
  | { type: 'eventField'; field: string; in: (string | number | boolean)[] }
  | { type: 'objectHasTag'; tag: string }
  | { type: 'random'; chance: number }
  | { type: 'bodyUndiscoveredFor'; seconds: number }
  | { type: 'objectMovedFromSpawn'; objectType: string }
  | { type: 'relationCountAtLeast'; relTypes: string[]; count: number }
  | { type: 'alivePlayersAtLeast'; count: number };

export type Effect =
  | { type: 'announce'; text: string; style?: 'narration' | 'announce' | 'danger' }
  | { type: 'whisper'; to: 'actor' | 'target' | 'room' | 'adjacent' | 'all'; text: string }
  | { type: 'setPhase'; phase: Phase }
  | { type: 'setFlag'; name: string; value: boolean }
  | { type: 'blackout'; seconds: number }
  | { type: 'openCase'; caseType: 'murder' | 'heist' | 'quiet' }
  | { type: 'assignRoles' }
  | { type: 'spawnSecretLetter'; roomId: string }
  | { type: 'discoverBodyByNpc'; npcName: string }
  | { type: 'startVote' }
  | { type: 'endGame' }
  | { type: 'delay'; seconds: number; effects: Effect[] };

export interface EventRule {
  id: string;
  description: string;
  on: TruthEventType[];
  when?: Condition[];
  effects: Effect[];
  /** ne se déclenche qu'une fois par partie */
  once?: boolean;
  /** délai minimal entre deux déclenchements (s) */
  cooldown?: number;
}

const EARLY: Phase[] = ['ARRIVAL', 'EXPLORATION', 'SOCIAL'];
const PRE_MAJOR: Phase[] = ['ARRIVAL', 'EXPLORATION', 'SOCIAL', 'ESCALATION'];

export const EVENT_RULES: EventRule[] = [
  // ── Rythme de la nuit (phases) ──
  {
    id: 'arrival_intro',
    description: 'Introduction narrative.',
    on: ['GAME_STARTED'],
    once: true,
    effects: [
      { type: 'announce', style: 'narration', text: '{clock}. La pluie martèle les vitres de la Villa Beaumont. Votre hôte, Victor Beaumont, devait vous accueillir. Il n’est pas là.' },
      { type: 'delay', seconds: 6, effects: [{ type: 'announce', style: 'narration', text: 'Chacun ici a une raison d’être venu. Et chacun a quelque chose à cacher.' }] },
    ],
  },
  {
    id: 'to_exploration',
    description: 'Fin de l’arrivée.',
    on: ['TICK'],
    once: true,
    when: [{ type: 'phaseIn', phases: ['ARRIVAL'] }, { type: 'elapsedAtLeast', seconds: 20 }],
    effects: [{ type: 'setPhase', phase: 'EXPLORATION' }],
  },
  {
    id: 'to_social',
    description: 'Le dîner n’est jamais servi : place aux conversations.',
    on: ['TICK'],
    once: true,
    when: [{ type: 'phaseIn', phases: ['EXPLORATION'] }, { type: 'elapsedAtLeast', seconds: 100 }],
    effects: [
      { type: 'setPhase', phase: 'SOCIAL' },
      { type: 'announce', style: 'narration', text: 'La table est dressée pour un dîner qui ne sera jamais servi. Les invités commencent à se jauger.' },
    ],
  },
  {
    id: 'escalation_by_conflict',
    description: 'Une hostilité déclarée fait monter la tension.',
    on: ['RELATION_CREATED', 'BETRAYAL'],
    once: true,
    when: [{ type: 'phaseIn', phases: EARLY }, { type: 'eventField', field: 'relType', in: ['ENEMY', 'VENDETTA', 'BETRAYAL'] }, { type: 'elapsedAtLeast', seconds: 60 }],
    effects: [
      { type: 'setPhase', phase: 'ESCALATION' },
      { type: 'announce', style: 'danger', text: 'Des éclats de voix résonnent dans la villa. Quelque chose vient de se briser entre certains invités.' },
    ],
  },
  {
    id: 'escalation_by_time',
    description: 'La nuit avance, la tension monte d’elle-même.',
    on: ['TICK'],
    once: true,
    when: [{ type: 'phaseIn', phases: EARLY }, { type: 'elapsedAtLeast', seconds: 210 }],
    effects: [
      { type: 'setPhase', phase: 'ESCALATION' },
      { type: 'announce', style: 'danger', text: '{clock}. L’orage se rapproche. Les portes claquent. Personne ne se sent plus vraiment en sécurité.' },
    ],
  },

  // ── Événements émergents ──
  {
    id: 'weapon_whisper',
    description: 'Prendre une arme fait naître une idée.',
    on: ['OBJECT_PICKED_UP'],
    cooldown: 45,
    when: [{ type: 'objectHasTag', tag: 'weapon' }, { type: 'random', chance: 0.5 }],
    effects: [{ type: 'whisper', to: 'actor', text: 'Vous soupesez l’objet ({object}). Une pensée vous traverse — vous la chassez aussitôt… ou pas.' }],
  },
  {
    id: 'anonymous_letter',
    description: 'Une lettre anonyme révèle le secret de quelqu’un.',
    on: ['TICK'],
    once: true,
    when: [{ type: 'phaseIn', phases: ['SOCIAL', 'ESCALATION'] }, { type: 'elapsedAtLeast', seconds: 150 }, { type: 'random', chance: 0.02 }],
    effects: [
      { type: 'spawnSecretLetter', roomId: 'hall' },
      { type: 'announce', style: 'narration', text: 'Un froissement de papier dans le hall. Quelqu’un a glissé une enveloppe sous la porte d’entrée.' },
    ],
  },
  {
    id: 'phone_rings',
    description: 'Le téléphone du bureau sonne.',
    on: ['TICK'],
    once: true,
    when: [{ type: 'phaseIn', phases: ['SOCIAL', 'ESCALATION'] }, { type: 'elapsedAtLeast', seconds: 130 }, { type: 'random', chance: 0.015 }],
    effects: [
      { type: 'announce', style: 'narration', text: 'Le vieux téléphone du bureau sonne. Une fois. Deux fois. Puis plus rien.' },
      { type: 'whisper', to: 'adjacent', text: 'Vous entendez une voix étouffée dans le combiné du bureau : « Il sait ce que tu as fait. »' },
    ],
  },
  {
    id: 'storm_blackout',
    description: 'La foudre coupe le courant : opportunités dans le noir.',
    on: ['TICK'],
    once: true,
    when: [{ type: 'phaseIn', phases: ['ESCALATION'] }, { type: 'noCase' }, { type: 'elapsedAtLeast', seconds: 300 }],
    effects: [
      { type: 'announce', style: 'danger', text: 'Un éclair aveuglant. Un craquement. Le courant saute dans toute la villa.' },
      { type: 'blackout', seconds: 45 },
    ],
  },
  {
    id: 'betrayal_echo',
    description: 'Une trahison ne passe jamais inaperçue.',
    on: ['BETRAYAL'],
    effects: [{ type: 'whisper', to: 'target', text: '{actor} a rompu votre pacte. Vous pouvez désormais lui déclarer une vendetta.' }],
  },

  // ── Événement majeur : meurtre ──
  {
    id: 'body_discovered',
    description: 'La découverte d’un corps ouvre l’enquête.',
    on: ['BODY_DISCOVERED'],
    once: true,
    effects: [
      { type: 'openCase', caseType: 'murder' },
      { type: 'setPhase', phase: 'MAJOR_EVENT' },
      { type: 'announce', style: 'danger', text: '{clock}. Un cri déchire la nuit. {actor} vient de découvrir le corps de {victim} — {room}.' },
      {
        type: 'delay',
        seconds: 8,
        effects: [
          { type: 'setPhase', phase: 'INVESTIGATION' },
          { type: 'assignRoles' },
          { type: 'announce', style: 'announce', text: 'Les lignes sont coupées, la route inondée. Personne ne quittera la villa avant l’aube. L’enquête commence.' },
        ],
      },
    ],
  },
  {
    id: 'body_found_by_dog',
    description: 'Si personne ne trouve le corps, le chien finit par aboyer.',
    on: ['TICK'],
    once: true,
    when: [{ type: 'bodyUndiscoveredFor', seconds: 70 }],
    effects: [{ type: 'discoverBodyByNpc', npcName: 'Le chien de la villa' }],
  },

  // ── Événement majeur alternatif : vol ──
  {
    id: 'heist_reveal',
    description: 'Si le collier a quitté sa place, sa disparition est découverte.',
    on: ['TICK'],
    once: true,
    when: [{ type: 'noCase' }, { type: 'elapsedAtLeast', seconds: 520 }, { type: 'objectMovedFromSpawn', objectType: 'necklace' }],
    effects: [
      { type: 'openCase', caseType: 'heist' },
      { type: 'setPhase', phase: 'MAJOR_EVENT' },
      { type: 'announce', style: 'danger', text: '{clock}. Un hurlement dans la chambre de maître : le Collier Beaumont a disparu.' },
      { type: 'delay', seconds: 6, effects: [{ type: 'setPhase', phase: 'INVESTIGATION' }, { type: 'assignRoles' }, { type: 'announce', style: 'announce', text: 'Quelqu’un ici est un voleur. Trouvez qui.' }] },
    ],
  },

  // ── Fin calme ──
  {
    id: 'quiet_dawn',
    description: 'Si rien de majeur n’arrive, l’aube révèle les secrets.',
    on: ['TICK'],
    once: true,
    when: [{ type: 'noCase' }, { type: 'elapsedAtLeast', seconds: 640 }],
    effects: [
      { type: 'openCase', caseType: 'quiet' },
      { type: 'announce', style: 'narration', text: 'L’aube se lève. Personne n’est mort cette nuit… mais personne ne repartira avec ses secrets.' },
      { type: 'setPhase', phase: 'RESOLUTION' },
      { type: 'startVote' },
    ],
  },

  // ── Clôture de l'enquête ──
  {
    id: 'investigation_end',
    description: 'Le temps d’enquête est écoulé : place au vote.',
    on: ['TICK'],
    once: true,
    when: [{ type: 'phaseIn', phases: ['INVESTIGATION'] }, { type: 'phaseElapsedAtLeast', seconds: 300 }],
    effects: [
      { type: 'announce', style: 'announce', text: '{clock}. Les premières lueurs de l’aube. Il est temps de désigner un coupable.' },
      { type: 'setPhase', phase: 'RESOLUTION' },
      { type: 'startVote' },
    ],
  },
];

/** Phases durant lesquelles une opportunité d'agression peut apparaître. */
export const OPPORTUNITY_PHASES: Phase[] = ['ESCALATION'];
/** Phases durant lesquelles le mobile (vendetta) suffit à créer l'opportunité. */
export const MOTIVE_PHASES: Phase[] = ['SOCIAL', 'ESCALATION'];
export const PRE_MAJOR_PHASES = PRE_MAJOR;
/** Durée du vote (s). */
export const VOTE_DURATION_SEC = 75;
