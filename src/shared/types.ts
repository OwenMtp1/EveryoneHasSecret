/**
 * Types partagés client/serveur.
 * Règle : tout ce qui transite vers le client est une VUE (filtrée par le serveur),
 * jamais la vérité complète.
 */
import type { NightDuration } from './config';

// ───────────────────────── META ─────────────────────────

export type Appearance = 'masculine' | 'feminine';

/**
 * Personnage incarné dans une partie : un membre du catalogue prédéfini (castId), choisi dans le salon.
 * Les champs skinTone…outfitId ne servent qu'au rendu de repli (portraits SVG, figurine procédurale).
 */
export interface Character {
  castId: string;
  firstName: string;
  lastName: string;
  appearance: Appearance;
  skinTone: string;
  hairStyleId: string;
  hairColor: string;
  outfitId: string;
}

export interface PublicUser {
  id: string;
  username: string;
}

export interface Profile {
  userId: string;
  username: string;
  createdAt: number;
  gamesPlayed: number;
  gamesWon: number;
  character: Character | null;
}

export type PresenceStatus = 'OFFLINE' | 'ONLINE' | 'IN_LOBBY' | 'IN_GAME';

export interface FriendEntry {
  userId: string;
  username: string;
  character: Character | null;
  status: PresenceStatus;
  /** accepted = amis ; incoming/outgoing = demande en attente */
  relation: 'accepted' | 'incoming' | 'outgoing';
  lobbyId?: string | null;
}

export type NotificationType =
  | 'FRIEND_REQUEST'
  | 'FRIEND_ACCEPTED'
  | 'FRIEND_ONLINE'
  | 'FRIEND_JOINED_GAME'
  | 'GAME_INVITE'
  | 'KICKED'
  | 'LOBBY_CLOSED'
  | 'SYSTEM';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  payload?: Record<string, unknown>;
  read: boolean;
  createdAt: number;
}

export type LobbyVisibility = 'PUBLIC' | 'PRIVATE';
export type LobbyStatus = 'WAITING' | 'STARTING' | 'IN_GAME';

export interface LobbyPlayerView {
  userId: string;
  username: string;
  /** personnage réservé dans ce salon (null = pas encore choisi) */
  castId: string | null;
  character: Character | null;
  ready: boolean;
  isHost: boolean;
  connected: boolean;
}

export interface LobbyChatMessage {
  id: string;
  userId: string | null;
  name: string;
  text: string;
  at: number;
}

export interface LobbyView {
  id: string;
  /** incrémenté à chaque changement : le client ignore les états plus anciens que celui affiché */
  version: number;
  name: string;
  code: string;
  hostId: string;
  maxPlayers: number;
  visibility: LobbyVisibility;
  status: LobbyStatus;
  players: LobbyPlayerView[];
  chat: LobbyChatMessage[];
  minPlayers: number;
  canStart: boolean;
  duration: NightDuration;
}

export interface ServerListEntry {
  id: string;
  name: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  status: LobbyStatus;
  friendsInside: number;
}

export interface ServerFilters {
  availability?: 'all' | 'available';
  minPlayers?: number;
  withFriends?: boolean;
}

// ───────────────────────── GAME ─────────────────────────

/** Déroulé d'une nuit : découverte du corps → enquête (votes possibles) → délibération finale → épilogue. */
export type Phase = 'ARRIVAL' | 'INVESTIGATION' | 'RESOLUTION' | 'EPILOGUE';

export type RelationType = 'FRIEND' | 'ALLY' | 'PACT' | 'ENEMY' | 'VENDETTA';
export type RelationStatus = 'pending' | 'active' | 'broken';

export interface Vec2 {
  x: number;
  y: number;
}

/** Joueur tel que vu par un autre joueur (aucune donnée cachée). */
export interface GamePlayerView {
  id: string;
  name: string;
  character: Character;
  alive: boolean;
  connected: boolean;
  /** Position seulement si le joueur est visible par l'observateur. */
  pos?: Vec2;
  facing?: number;
  roomId?: string;
  hasLight?: boolean;
  /** Indice visuel : vêtements tachés (perçu). */
  stained?: boolean;
  /** Visible car allié (position partagée). */
  viaAlliance?: boolean;
  /** Geste en cours (visible seulement par ceux qui voient le joueur). */
  gesture?: { kind: GestureKind; seq: number };
}

export type GestureKind = 'take' | 'drop' | 'hide' | 'search' | 'give' | 'examine' | 'use' | 'wash' | 'clean' | 'destroy' | 'attack';

export interface ObjectView {
  id: string;
  type: string;
  name: string;
  icon: string;
  pos?: Vec2;
  roomId?: string;
  /** visible pour le propriétaire uniquement */
  inInventory?: boolean;
  bloody?: boolean;
  lit?: boolean;
  /** verrouillé (code ou clé) */
  locked?: boolean;
  /** le joueur a déjà lu / vu son contenu */
  known?: boolean;
  /** gants enfilés */
  worn?: boolean;
  /** interactions possibles : read, code, key, open, insert, device, burn, wipe, wear, light, present */
  caps?: string[];
  /** indice du verrou (« code à 4 chiffres »…) */
  lockHint?: string;
}

export interface BodyView {
  id: string;
  /** 'victim' pour la victime (personnage non joueur) */
  playerId: string;
  npc?: boolean;
  name: string;
  character: Character;
  pos: Vec2;
  roomId: string;
}

export interface TraceView {
  id: string;
  kind: string;
  pos: Vec2;
  roomId: string;
  label: string;
}

export interface RelationView {
  id: string;
  type: RelationType;
  status: RelationStatus;
  from: string;
  to: string;
  createdAt: number;
  origin: string;
  history: { at: number; text: string }[];
}

export type KnowledgeKind =
  | 'seen'
  | 'heard'
  | 'deduced'
  | 'received'
  | 'role'
  | 'evidence'
  | 'secret'
  | 'self';

export interface KnowledgeEntry {
  id: string;
  /** minutes de jeu */
  at: number;
  kind: KnowledgeKind;
  text: string;
  sourceId?: string;
  sourceName?: string;
  important?: boolean;
}

export interface FeedMessage {
  id: string;
  at: number;
  style: 'narration' | 'announce' | 'whisper' | 'system' | 'danger';
  text: string;
}

export type ChatChannel = 'general' | `dm:${string}` | `ally:${string}` | 'dead';

export interface ChatMessage {
  id: string;
  channel: ChatChannel;
  fromId: string;
  fromName: string;
  text: string;
  at: number;
}

export interface BoardEntry {
  id: string;
  authorId: string;
  authorName: string;
  kind: 'evidence' | 'claim' | 'testimony' | 'accusation' | 'system';
  text: string;
  /** true = issu d'une connaissance réelle partagée telle quelle */
  verified: boolean;
  at: number;
}

export interface RoleView {
  id: string;
  name: string;
  description: string;
  tools: { id: string; name: string; description: string; usesLeft?: number }[];
}

/** Spécification d'une photo d'enquête : rendue par le client avec les vrais personnages de la partie. */
export interface PhotoView {
  castIds: string[];
  scene: 'portrait' | 'group' | 'restaurant' | 'beach' | 'cliff' | 'party' | 'office' | 'street' | 'car' | 'villa';
  caption: string;
  seed: number;
}

/** Ce que l'affaire a de public (connu de tous dès le début). */
export interface CaseView {
  scenarioTitle: string;
  brief: string;
  victimName: string;
  victimCastId: string;
  victimBio: string;
  roomId: string;
  roomName: string;
  /** lieux de la soirée proposés pour une déclaration d'alibi */
  places: { id: string; name: string }[];
  /** fin de la phase d'enquête (horodatage client) */
  endsAt: number;
  /** une accusation peut-elle être déposée maintenant */
  canAccuse: boolean;
  accuseBlockedReason?: string;
  accusationsLeft: number;
}

/** Dossier personnel (privé). */
export interface DossierView {
  camp: 'murderer' | 'innocent' | 'protector';
  objective: string;
  secret: string;
  memories: string[];
  briefing: string[];
  /** pièces que vous avez lues (contenu exact, horodaté) */
  evidence: EvidenceView[];
  arrested: boolean;
}

export interface EvidenceView {
  objectId: string;
  title: string;
  lines: string[];
  photos?: PhotoView[];
  at: number;
}

/** Pièce versée au dossier commun : texte authentique tiré de la preuve, recoupements automatiques. */
export interface PublicEvidenceView {
  id: string;
  authorId: string;
  authorName: string;
  title: string;
  lines: string[];
  photos?: PhotoView[];
  againstName?: string;
  checks: { playerName: string; status: 'confirms' | 'contradicts'; text: string }[];
  at: number;
}

export interface AlibiView {
  playerId: string;
  playerName: string;
  place: string;
  placeName: string;
  text: string;
  at: number;
  /** recoupements avec les pièces versées au dossier */
  status: 'unverified' | 'confirmed' | 'contradicted';
}

/** Opposition officielle (irrévocable) : base des éliminations possibles par le meurtrier. */
export interface OppositionView {
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  cause: string;
  at: number;
}

export interface VoteView {
  id: string;
  kind: 'accusation' | 'final';
  /** déclencheur lisible : « Accusation formelle de X », « Délibération finale »… */
  trigger: string;
  accusedId?: string;
  accusedName?: string;
  accuserName?: string;
  accusationText?: string;
  evidence: { title: string; lines: string[]; photos?: PhotoView[] }[];
  defense?: string;
  /** vote final : candidats ; vote d'accusation : 'guilty' | 'innocent' */
  options: { id: string; label: string }[];
  eligible: boolean;
  myChoice?: string;
  votesCast: number;
  votesNeeded: number;
  endsAt: number;
  rules: string;
}

export interface EpilogueView {
  winner: 'innocents' | 'murderer';
  headline: string;
  scenarioTitle: string;
  motive: string;
  murdererId: string;
  murdererName: string;
  protectorNames: string[];
  arrested: { name: string; guilty: boolean }[];
  victims: string[];
  truthTimeline: { at: number; text: string }[];
  secrets: { playerId: string; name: string; secret: string; camp: string }[];
  votes: { trigger: string; accusedName?: string; result: string }[];
  oppositions: { fromName: string; toName: string }[];
  roles: { name: string; role: string }[];
  /** résultat personnel de chaque joueur */
  outcomes: { playerId: string; won: boolean }[];
}

/** Occasion d'élimination (meurtrier uniquement). */
export interface Opportunity {
  targetId: string;
  targetName: string;
  objectId: string;
  objectName: string;
  text: string;
}

/** État privé complet envoyé à un joueur (sa vision du monde). */
export interface GameSelfView {
  gameId: string;
  lobbyId: string;
  title: string;
  you: string;
  alive: boolean;
  phase: Phase;
  clock: number;
  blackout: boolean;
  players: GamePlayerView[];
  objects: ObjectView[];
  bodies: BodyView[];
  traces: TraceView[];
  inventory: ObjectView[];
  relations: RelationView[];
  knowledge: KnowledgeEntry[];
  role: RoleView | null;
  caseInfo: CaseView | null;
  dossier: DossierView | null;
  publicEvidence: PublicEvidenceView[];
  alibis: AlibiView[];
  oppositions: OppositionView[];
  board: BoardEntry[];
  feed: FeedMessage[];
  chat: ChatMessage[];
  opportunity: Opportunity | null;
  vote: VoteView | null;
  epilogue: EpilogueView | null;
  unlockedDoors: string[];
  muddy: boolean;
  testimonyRequest: { requestId: string; question: string; fromName: string } | null;
  /** joueurs arrêtés (hors jeu, spectateurs) */
  arrested: string[];
  /** meubles encore verrouillés */
  lockedFurniture: { id: string; kind: 'code' | 'key' }[];
}

/** Snapshot léger envoyé à haute fréquence. */
export interface GameSnapshot {
  clock: number;
  phase: Phase;
  blackout: boolean;
  /** sans `character` (repris de la dernière vue complète) */
  players: Omit<GamePlayerView, 'character'>[];
  objects: ObjectView[];
  bodies: BodyView[];
  traces: TraceView[];
  opportunity: Opportunity | null;
}
