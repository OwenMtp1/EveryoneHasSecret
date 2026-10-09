/**
 * Protocole client ↔ serveur.
 * Le client DEMANDE (événement + ack), le serveur VALIDE, APPLIQUE puis DIFFUSE.
 */
import type {
  AppNotification,
  ChatChannel,
  FriendEntry,
  GameSelfView,
  GameSnapshot,
  LobbyView,
  LobbyVisibility,
  RelationType,
  ServerFilters,
  ServerListEntry,
} from './types';
import type { GameIntroState, IntroPlan } from './content/intro';
import type { NightDuration } from './config';

export type Ack<T = unknown> = (res: AckResult<T>) => void;
export type AckResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

/** Actions de jeu envoyées par le client. Toutes validées par le serveur. */
export type GameAction =
  | { type: 'take'; objectId: string }
  | { type: 'drop'; objectId: string }
  | { type: 'hide'; objectId: string; furnitureId: string }
  | { type: 'give'; objectId: string; targetId: string }
  | { type: 'use'; objectId: string; targetId?: string }
  | { type: 'examine'; objectId: string }
  | { type: 'search'; furnitureId: string }
  | { type: 'clean'; toolId: string; targetKind: 'object' | 'trace'; targetId: string }
  | { type: 'destroy'; objectId: string }
  | { type: 'wash' }
  /** meurtrier uniquement : éliminer un opposant officiel, seul à seul */
  | { type: 'act'; targetId: string; objectId: string }
  /** saisir un code (téléphone, ordinateur, coffret) */
  | { type: 'unlock'; objectId: string; code: string }
  /** ouvrir un contenant avec une clé détenue / lire un support dans un appareil */
  | { type: 'open'; objectId: string }
  | { type: 'insert'; mediaId: string; deviceId: string }
  /** fouiller le corps de la victime */
  | { type: 'search_body'; bodyId: string }
  /** verser une pièce lue au dossier commun, éventuellement CONTRE un joueur (dénonciation formelle) */
  | { type: 'present'; objectId: string; againstId?: string }
  /** déclaration publique d'alibi pour la fenêtre du crime (21h00–22h00) */
  | { type: 'alibi'; place: string; text: string }
  /** accusation formelle : déclenche un vote, exige au moins une pièce lue */
  | { type: 'accuse'; targetId: string; evidenceIds: string[]; text: string }
  /** défense de l'accusé pendant le vote */
  | { type: 'defend'; text: string }
  | { type: 'ballot'; choice: string }
  | {
      type: 'relation';
      op: 'propose' | 'accept' | 'decline' | 'break';
      relType?: RelationType;
      targetId?: string;
      relationId?: string;
    }
  | { type: 'share'; knowledgeId: string; to: 'board' | 'player' | 'allies'; targetId?: string }
  | { type: 'claim'; text: string }
  | { type: 'tool'; toolId: string; targetId?: string }
  | { type: 'testimony'; requestId: string; roomId: string; text: string };

export interface ClientToServerEvents {
  // Amis & notifications
  'friends:list': (ack: Ack<FriendEntry[]>) => void;
  'friends:search': (q: string, ack: Ack<{ userId: string; username: string; alreadyLinked?: boolean }[]>) => void;
  'friends:request': (username: string, ack: Ack<null>) => void;
  'friends:respond': (p: { userId: string; accept: boolean }, ack: Ack<null>) => void;
  'friends:remove': (userId: string, ack: Ack<null>) => void;
  'notifications:list': (ack: Ack<AppNotification[]>) => void;
  'notifications:read': (ids: string[], ack: Ack<null>) => void;
  'invite:respond': (p: { notificationId: string; accept: boolean }, ack: Ack<LobbyView | null>) => void;

  // Serveurs & lobby
  'servers:list': (filters: ServerFilters, ack: Ack<ServerListEntry[]>) => void;
  'lobby:create': (
    p: { name: string; maxPlayers: number; visibility: LobbyVisibility; duration?: NightDuration },
    ack: Ack<LobbyView>,
  ) => void;
  'lobby:join': (p: { lobbyId?: string; code?: string }, ack: Ack<LobbyView>) => void;
  'lobby:leave': (ack: Ack<null>) => void;
  'lobby:ready': (ready: boolean, ack: Ack<null>) => void;
  /** réserve un personnage du catalogue (null = libérer) ; refusé s'il est déjà pris dans ce salon */
  'lobby:pick': (castId: string | null, ack: Ack<LobbyView>) => void;
  'lobby:kick': (userId: string, ack: Ack<null>) => void;
  'lobby:settings': (
    p: { name?: string; maxPlayers?: number; visibility?: LobbyVisibility; duration?: NightDuration },
    ack: Ack<null>,
  ) => void;
  'lobby:close': (ack: Ack<null>) => void;
  'lobby:start': (ack: Ack<null>) => void;
  'lobby:invite': (userId: string, ack: Ack<null>) => void;
  'lobby:chat': (text: string, ack: Ack<null>) => void;

  // Jeu
  'game:input': (p: { dx: number; dy: number; run?: boolean }) => void;
  'game:action': (a: GameAction, ack: Ack<{ message?: string }>) => void;
  'game:chat': (p: { channel: ChatChannel; text: string }, ack: Ack<null>) => void;
  'game:leave': (ack: Ack<null>) => void;

  // Chat vocal (WebRTC pair-à-pair, le serveur ne fait que relayer la signalisation)
  /** fin du chargement (villa, personnages, partie) : la cinématique attend tous les joueurs */
  'lobby:intro-ready': (p: { planId: string }) => void;
  'voice:join': (ack: Ack<{ peers: string[] }>) => void;
  'voice:leave': () => void;
  'voice:signal': (p: { to: string; data: VoiceSignal }) => void;
}

export type VoiceSignal = { sdp: { type: 'offer' | 'answer'; sdp: string } } | { candidate: { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null } };

export interface ServerToClientEvents {
  'session:state': (s: { lobby: LobbyView | null; inGame: boolean }) => void;
  'lobby:state': (l: LobbyView | null) => void;
  /** début de la cinématique d'arrivée (aussi renvoyé à un joueur qui se reconnecte pendant celle-ci) */
  'lobby:intro': (p: { plan: IntroPlan; serverNow: number; loading: boolean }) => void;
  /** changement d'état de la cinématique, cadencé par le serveur */
  'lobby:intro-state': (p: { planId: string; state: GameIntroState; serverNow: number }) => void;
  notification: (n: AppNotification) => void;
  'friends:changed': () => void;
  'game:full': (v: GameSelfView) => void;
  'game:snapshot': (s: GameSnapshot) => void;
  'game:ended': () => void;
  'voice:peer-joined': (userId: string) => void;
  'voice:peer-left': (userId: string) => void;
  'voice:signal': (p: { from: string; data: VoiceSignal }) => void;
}

export interface AuthResponse {
  token: string;
  user: { id: string; username: string };
}

export interface MeResponse {
  user: { id: string; username: string };
  profile: { gamesPlayed: number; gamesWon: number; createdAt: number };
}

/** Compte Supabase authentifié mais sans profil de jeu : il doit choisir un pseudo. */
export interface PendingProfileResponse {
  needsUsername: true;
  email?: string;
  suggested?: string;
}

/** Configuration publique : mode d'authentification (et clés publiques Supabase le cas échéant). */
export type PublicConfig = { auth: 'local' } | { auth: 'supabase'; supabaseUrl: string; supabaseAnonKey: string };
