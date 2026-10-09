/**
 * État interne d'une partie — VÉRITÉ SERVEUR. Jamais envoyé tel quel aux clients.
 */
import type {
  GestureKind,
  BoardEntry,
  Character,
  ChatMessage,
  FeedMessage,
  KnowledgeEntry,
  Phase,
  RelationStatus,
  RelationType,
  Vec2,
} from '@shared/types';
import type { ObjectTypeDef } from '@shared/content/objects';
import type { TruthEventType } from '@shared/content/events';

export interface TruthEvent {
  seq: number;
  type: TruthEventType;
  /** ms réelles depuis le début */
  t: number;
  /** horloge de jeu (minutes) */
  clock: number;
  actorId?: string;
  targetId?: string;
  objectId?: string;
  roomId?: string;
  /** Narration objective (pour l'épilogue / la reconstitution). */
  text?: string;
  data?: Record<string, unknown>;
}

export interface PlayerState {
  id: string;
  name: string;
  character: Character;
  alive: boolean;
  connected: boolean;
  pos: Vec2;
  input: Vec2;
  /** court (Maj) plutôt que marcher */
  running: boolean;
  facing: number;
  roomId: string;
  inventory: string[];
  // Identité cachée
  secretId: string;
  secretText: string;
  secretReveal: string;
  secretTargetId?: string;
  fingerprint: string;
  shoe: { pattern: string; size: number };
  // État physique
  muddyUntil: number;
  lastFootprintAt: number;
  stained: boolean;
  // Connaissances & rôle
  knowledge: KnowledgeEntry[];
  feed: FeedMessage[];
  roleId?: string;
  toolUses: Record<string, number>;
  /** dernière observation enregistrée d'un autre joueur (clé autreId|pièce → clock) */
  sightings: Map<string, number>;
  /** transitions de pièce : base de la vérification des témoignages */
  roomHistory: { clock: number; roomId: string }[];
  roomTime: Record<string, number>;
  metrics: { objectsTouched: number; socialActions: number; examinations: number };
  motiveAgainst: Set<string>;
  gesture: { kind: GestureKind; seq: number; until: number } | null;
  pendingTestimony: { requestId: string; question: string; fromId: string; fromName: string } | null;
  /** arrêté·e après un vote : hors jeu (spectateur) */
  arrested: boolean;
  accusationsUsed: number;
  /** gants enfilés : plus d'empreintes laissées */
  gloves: boolean;
  dirty: boolean;
}

export interface ObjectTrace {
  kind: 'print' | 'blood';
  playerId: string;
  clock: number;
  cleaned: boolean;
}

export type ObjectLocation =
  | { kind: 'floor'; roomId: string; pos: Vec2 }
  | { kind: 'hidden'; roomId: string; furnitureId: string; pos: Vec2 }
  | { kind: 'player'; playerId: string }
  | { kind: 'inside'; containerId: string }
  | { kind: 'destroyed' };

export interface GameObject {
  id: string;
  type: string;
  def: ObjectTypeDef;
  name: string;
  location: ObjectLocation;
  spawnRoomId: string | null;
  history: { clock: number; text: string }[];
  traces: ObjectTrace[];
  lit: boolean;
  /** joueurs qui savent où est cachée la chose */
  knownBy: Set<string>;
  props: Record<string, unknown>;
  cleanedAt?: number;
}

export type EvidenceKind = 'footprint' | 'blood_pool' | 'diluted_blood' | 'ashes' | 'forced_lock' | 'smear';

export interface Evidence {
  id: string;
  kind: EvidenceKind;
  roomId: string;
  pos: Vec2;
  clock: number;
  sourceId?: string;
  data: Record<string, unknown>;
  /** visible à l'œil nu (sinon seulement via inspection) */
  visible: boolean;
  cleaned: boolean;
  discoveredBy: Set<string>;
}

export interface Body {
  id: string;
  /** 'victim' pour la victime de l'affaire (personnage non joueur) */
  playerId: string;
  npc?: { name: string; character: Character };
  roomId: string;
  pos: Vec2;
  clock: number;
  diedAt: number;
  killerId: string;
  weaponId: string;
  discovered: boolean;
  discoveredBy?: string;
  discoveredAt?: number;
}

export interface Relation {
  id: string;
  type: RelationType;
  from: string;
  to: string;
  status: RelationStatus;
  createdAt: number;
  origin: string;
  history: { at: number; text: string }[];
}

export interface SocialEvent {
  clock: number;
  kind: 'helped' | 'betrayed' | 'accused' | 'declared_enemy' | 'allied' | 'friend' | 'pact' | 'vendetta' | 'reconciled' | 'argued';
  actorId: string;
  targetId: string;
  text: string;
  /** observable par d'autres (sinon seulement connu des intéressés) */
  public: boolean;
}

export interface CaseState {
  type: 'murder' | 'heist' | 'quiet';
  victimId?: string;
  roomId?: string;
  discoveredAt?: number;
  discoveredBy?: string;
  culpritId?: string;
  weaponId?: string;
  /** heure de référence des faits (mort, vol) */
  refClock?: number;
  openedAt: number;
}

export interface Testimony {
  id: string;
  playerId: string;
  roomId: string;
  text: string;
  clock: number;
  boardId: string;
}

export interface StoredChat extends Omit<ChatMessage, 'channel'> {
  channel: string;
  /** destinataires autorisés (null = tous les vivants / selon canal) */
  audience: string[] | null;
}

export interface GameStateShape {
  phase: Phase;
  phaseStartedAt: number;
  blackoutUntil: number;
  flags: Record<string, boolean>;
  board: BoardEntry[];
  chat: StoredChat[];
}
