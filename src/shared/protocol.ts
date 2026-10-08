/**
 * Protocole client ↔ serveur.
 * Le client DEMANDE (événement + ack), le serveur VALIDE, APPLIQUE puis DIFFUSE.
 */
import type {
  AppNotification,
  Character,
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
  | { type: 'act'; targetId: string; objectId: string }
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
  | { type: 'testimony'; requestId: string; roomId: string; text: string }
  | { type: 'vote'; suspectId: string };

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
    p: { name: string; maxPlayers: number; visibility: LobbyVisibility; duration?: 'short' | 'normal' },
    ack: Ack<LobbyView>,
  ) => void;
  'lobby:join': (p: { lobbyId?: string; code?: string }, ack: Ack<LobbyView>) => void;
  'lobby:leave': (ack: Ack<null>) => void;
  'lobby:ready': (ready: boolean, ack: Ack<null>) => void;
  'lobby:kick': (userId: string, ack: Ack<null>) => void;
  'lobby:settings': (
    p: { name?: string; maxPlayers?: number; visibility?: LobbyVisibility; duration?: 'short' | 'normal' },
    ack: Ack<null>,
  ) => void;
  'lobby:close': (ack: Ack<null>) => void;
  'lobby:start': (ack: Ack<null>) => void;
  'lobby:invite': (userId: string, ack: Ack<null>) => void;
  'lobby:chat': (text: string, ack: Ack<null>) => void;

  // Jeu
  'game:input': (p: { dx: number; dy: number }) => void;
  'game:action': (a: GameAction, ack: Ack<{ message?: string }>) => void;
  'game:chat': (p: { channel: ChatChannel; text: string }, ack: Ack<null>) => void;
  'game:leave': (ack: Ack<null>) => void;

  // Chat vocal (WebRTC pair-à-pair, le serveur ne fait que relayer la signalisation)
  'voice:join': (ack: Ack<{ peers: string[] }>) => void;
  'voice:leave': () => void;
  'voice:signal': (p: { to: string; data: VoiceSignal }) => void;
}

export type VoiceSignal = { sdp: { type: 'offer' | 'answer'; sdp: string } } | { candidate: { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null } };

export interface ServerToClientEvents {
  'session:state': (s: { lobby: LobbyView | null; inGame: boolean }) => void;
  'lobby:state': (l: LobbyView | null) => void;
  /** début de la cinématique d'arrivée (aussi renvoyé à un joueur qui se reconnecte pendant celle-ci) */
  'lobby:intro': (p: { plan: IntroPlan; serverNow: number }) => void;
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
  character: Character | null;
  profile: { gamesPlayed: number; gamesWon: number; createdAt: number };
}
