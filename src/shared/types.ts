/**
 * Types partagés client/serveur.
 * Règle : tout ce qui transite vers le client est une VUE (filtrée par le serveur),
 * jamais la vérité complète.
 */

// ───────────────────────── META ─────────────────────────

export type Appearance = 'masculine' | 'feminine';

export interface Character {
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
  bot?: boolean;
  username: string;
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
  duration: 'short' | 'normal';
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

export type Phase =
  | 'ARRIVAL'
  | 'EXPLORATION'
  | 'SOCIAL'
  | 'ESCALATION'
  | 'MAJOR_EVENT'
  | 'INVESTIGATION'
  | 'RESOLUTION'
  | 'EPILOGUE';

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
}

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
}

export interface BodyView {
  id: string;
  playerId: string;
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

export interface CaseView {
  type: 'murder' | 'heist' | 'quiet';
  title: string;
  victimId?: string;
  victimName?: string;
  roomId?: string;
  roomName?: string;
  discoveredAt?: number;
  discoveredBy?: string;
  summary: string;
}

export interface Opportunity {
  targetId: string;
  targetName: string;
  objectId: string;
  objectName: string;
  text: string;
}

export interface VoteState {
  candidates: { id: string; name: string }[];
  myVote?: string;
  votesCast: number;
  votesNeeded: number;
  endsAt: number;
}

export interface EpilogueView {
  caseType: CaseView['type'];
  headline: string;
  culpritId?: string;
  culpritName?: string;
  accusedId?: string;
  accusedName?: string;
  culpritCaught: boolean;
  truthTimeline: { at: number; text: string }[];
  secrets: { playerId: string; name: string; secret: string }[];
  votes: { voterName: string; suspectName: string; correct: boolean }[];
  roles: { name: string; role: string }[];
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
  secret: string;
  role: RoleView | null;
  caseInfo: CaseView | null;
  board: BoardEntry[];
  feed: FeedMessage[];
  chat: ChatMessage[];
  opportunity: Opportunity | null;
  vote: VoteState | null;
  epilogue: EpilogueView | null;
  unlockedDoors: string[];
  muddy: boolean;
  testimonyRequest: { requestId: string; question: string; fromName: string } | null;
  /** inventaires des partenaires de pacte */
  pactInventories: { playerId: string; items: string[] }[];
}

/** Snapshot léger envoyé à haute fréquence. */
export interface GameSnapshot {
  clock: number;
  phase: Phase;
  blackout: boolean;
  players: GamePlayerView[];
  objects: ObjectView[];
  bodies: BodyView[];
  traces: TraceView[];
  opportunity: Opportunity | null;
}
