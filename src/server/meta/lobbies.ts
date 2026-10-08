/**
 * Lobbies (salons d'avant-partie) et cycle de vie des parties.
 * Toutes les permissions (hôte, places, statut) sont vérifiées ici, côté serveur.
 */
import type { LobbyView, LobbyVisibility, ServerFilters, ServerListEntry, EpilogueView } from '@shared/types';
import { GAME_NAME, META_CONFIG, GAME_CONFIG } from '@shared/config';
import { GameInstance } from '../game/GameInstance';
import type { AuthService } from './auth';
import type { ProfileService } from './profiles';
import type { FriendService } from './friends';
import type { NotificationService } from './notifications';
import type { PresenceService } from './presence';
import type { DB } from './db';
import { lobbyCode, newId, shortId, UserError } from '../util';
import { randomCharacter } from '@shared/content/character';
import type { Character } from '@shared/types';

interface LobbyPlayer {
  userId: string;
  ready: boolean;
  joinedAt: number;
  connected: boolean;
}

interface Lobby {
  id: string;
  name: string;
  code: string;
  hostId: string;
  maxPlayers: number;
  visibility: LobbyVisibility;
  status: 'WAITING' | 'STARTING' | 'IN_GAME';
  players: LobbyPlayer[];
  chat: { id: string; userId: string | null; name: string; text: string; at: number }[];
  game: GameInstance | null;
  /** joueurs encore « dans » la partie (avant retour au lobby) */
  inGame: Set<string>;
  startTimer?: NodeJS.Timeout;
  /** invités IA : identité propre au salon */
  bots: Map<string, { name: string; character: Character }>;
  duration: NightDuration;
}

export type NightDuration = 'short' | 'normal';
const DURATION_SCALE: Record<NightDuration, number> = { short: 0.55, normal: 1 };
const isBot = (id: string) => id.startsWith('bot:');

export interface LobbyEmitter {
  toUser(userId: string, event: string, payload?: unknown): void;
}

export class LobbyManager {
  private lobbies = new Map<string, Lobby>();
  private userLobby = new Map<string, string>();
  private disconnectTimers = new Map<string, NodeJS.Timeout>();
  /** Accélération (tests) : durée de la nuit et de la transition. */
  timeScale = Number(process.env.EHAS_TIME_SCALE ?? 1);
  transitionMs = Number(process.env.EHAS_TRANSITION_MS ?? 6500);

  constructor(
    private db: DB,
    private auth: AuthService,
    private profiles: ProfileService,
    private friends: FriendService,
    private notifications: NotificationService,
    private presence: PresenceService,
    private emitter: LobbyEmitter,
  ) {
    presence.resolveActivity = (userId) => {
      const l = this.lobbyOfUser(userId);
      if (!l) return null;
      return l.game && l.inGame.has(userId) ? 'IN_GAME' : 'IN_LOBBY';
    };
    friends.lobbyOf = (userId) => this.lobbyOfUser(userId)?.id ?? null;
  }

  // ───────────── lecture ─────────────

  private lobbyOfBot(botId: string): Lobby | undefined {
    for (const l of this.lobbies.values()) if (l.bots.has(botId)) return l;
    return undefined;
  }

  private lobbyOfUser(userId: string): Lobby | undefined {
    const id = this.userLobby.get(userId);
    return id ? this.lobbies.get(id) : undefined;
  }

  private nameOf(userId: string, l?: Lobby) {
    const bot = l?.bots.get(userId) ?? (isBot(userId) ? this.lobbyOfBot(userId)?.bots.get(userId) : undefined);
    if (bot) return bot.name;
    const u = this.auth.getUser(userId);
    return this.profiles.displayName(userId, u?.username ?? '???');
  }

  view(l: Lobby, forUser?: string): LobbyView {
    const readyCount = l.players.filter((p) => p.ready || p.userId === l.hostId).length;
    return {
      id: l.id,
      name: l.name,
      code: l.code,
      hostId: l.hostId,
      maxPlayers: l.maxPlayers,
      visibility: l.visibility,
      status: l.status,
      minPlayers: META_CONFIG.minPlayersToStart,
      duration: l.duration,
      canStart:
        forUser === l.hostId &&
        l.status === 'WAITING' &&
        !l.game &&
        l.players.length >= META_CONFIG.minPlayersToStart &&
        readyCount === l.players.length,
      players: l.players.map((p) => ({
        userId: p.userId,
        bot: isBot(p.userId),
        username: l.bots.get(p.userId) ? 'Invité IA' : (this.auth.getUser(p.userId)?.username ?? '???'),
        character: l.bots.get(p.userId)?.character ?? this.profiles.getCharacter(p.userId),
        ready: p.ready,
        isHost: p.userId === l.hostId,
        connected: p.connected,
      })),
      chat: l.chat.slice(-60),
    };
  }

  sessionState(userId: string) {
    const l = this.lobbyOfUser(userId);
    return { lobby: l ? this.view(l, userId) : null, inGame: !!(l?.game && l.inGame.has(userId)) };
  }

  gameOf(userId: string): GameInstance | null {
    const l = this.lobbyOfUser(userId);
    return l?.game && l.inGame.has(userId) ? l.game : null;
  }

  list(userId: string, filters: ServerFilters = {}): ServerListEntry[] {
    const friendIds = new Set(this.friends.friendIds(userId));
    const out: ServerListEntry[] = [];
    for (const l of this.lobbies.values()) {
      if (l.visibility !== 'PUBLIC') continue;
      const available = l.status === 'WAITING' && !l.game && l.players.length < l.maxPlayers;
      const friendsInside = l.players.filter((p) => friendIds.has(p.userId)).length;
      if (filters.availability === 'available' && !available) continue;
      if (filters.minPlayers && l.players.length < filters.minPlayers) continue;
      if (filters.withFriends && friendsInside === 0) continue;
      out.push({
        id: l.id,
        name: l.name,
        hostName: this.nameOf(l.hostId),
        playerCount: l.players.length,
        maxPlayers: l.maxPlayers,
        status: l.game ? 'IN_GAME' : l.status,
        friendsInside,
      });
    }
    return out.sort((a, b) => Number(b.status === 'WAITING') - Number(a.status === 'WAITING') || b.playerCount - a.playerCount);
  }

  // ───────────── diffusion ─────────────

  private broadcast(l: Lobby) {
    for (const p of l.players) if (!isBot(p.userId)) this.emitter.toUser(p.userId, 'lobby:state', this.view(l, p.userId));
  }

  private notifyFriendsOfPresence(userId: string) {
    for (const f of this.friends.friendIds(userId)) this.emitter.toUser(f, 'friends:changed');
  }

  private system(l: Lobby, text: string) {
    l.chat.push({ id: shortId('lc_'), userId: null, name: GAME_NAME, text, at: Date.now() });
  }

  // ───────────── actions ─────────────

  private requireCharacter(userId: string) {
    if (!this.profiles.getCharacter(userId)) throw new UserError('Créez d’abord votre personnage.');
  }

  private validateSettings(p: { name?: unknown; maxPlayers?: unknown; visibility?: unknown }, current?: Lobby) {
    const out: { name?: string; maxPlayers?: number; visibility?: LobbyVisibility } = {};
    if (p.name !== undefined) {
      const name = String(p.name).trim().replace(/\s+/g, ' ');
      if (name.length < META_CONFIG.lobbyName.min || name.length > META_CONFIG.lobbyName.max)
        throw new UserError(`Le nom doit faire entre ${META_CONFIG.lobbyName.min} et ${META_CONFIG.lobbyName.max} caractères.`);
      out.name = name;
    }
    if (p.maxPlayers !== undefined) {
      const n = Number(p.maxPlayers);
      if (!(META_CONFIG.maxPlayersOptions as readonly number[]).includes(n)) throw new UserError('Nombre de joueurs invalide.');
      if (current && n < current.players.length) throw new UserError('Il y a déjà plus de joueurs que ça.');
      out.maxPlayers = n;
    }
    if (p.visibility !== undefined) {
      if (p.visibility !== 'PUBLIC' && p.visibility !== 'PRIVATE') throw new UserError('Visibilité invalide.');
      out.visibility = p.visibility;
    }
    return out;
  }

  create(userId: string, p: { name: string; maxPlayers: number; visibility: LobbyVisibility; duration?: NightDuration }): LobbyView {
    this.requireCharacter(userId);
    const s = this.validateSettings(p);
    if (!s.name || !s.maxPlayers || !s.visibility) throw new UserError('Paramètres incomplets.');
    this.leaveCurrent(userId);
    let code: string;
    do code = lobbyCode(META_CONFIG.lobbyCodeLength);
    while ([...this.lobbies.values()].some((l) => l.code === code));
    const l: Lobby = {
      id: newId(),
      name: s.name,
      code,
      hostId: userId,
      maxPlayers: s.maxPlayers,
      visibility: s.visibility,
      status: 'WAITING',
      players: [{ userId, ready: false, joinedAt: Date.now(), connected: true }],
      chat: [],
      game: null,
      inGame: new Set(),
      bots: new Map(),
      duration: p.duration === 'short' ? 'short' : 'normal',
    };
    this.system(l, `${this.nameOf(userId)} a ouvert les portes de « ${l.name} ».`);
    this.lobbies.set(l.id, l);
    this.userLobby.set(userId, l.id);
    this.notifyFriendsOfPresence(userId);
    return this.view(l, userId);
  }

  join(userId: string, p: { lobbyId?: string; code?: string }): LobbyView {
    this.requireCharacter(userId);
    let l: Lobby | undefined;
    if (p.code) {
      const code = String(p.code).trim().toUpperCase();
      l = [...this.lobbies.values()].find((x) => x.code === code);
      if (!l) throw new UserError('Aucune partie ne correspond à ce code.');
    } else if (p.lobbyId) {
      l = this.lobbies.get(p.lobbyId);
      if (!l) throw new UserError('Cette partie n’existe plus.');
      if (l.visibility === 'PRIVATE' && !l.players.some((x) => x.userId === userId)) throw new UserError('Partie privée : utilisez son code.');
    } else throw new UserError('Partie introuvable.');

    if (l.players.some((x) => x.userId === userId)) return this.view(l, userId);
    if (l.status !== 'WAITING' || l.game) throw new UserError('La partie a déjà commencé.');
    if (l.players.length >= l.maxPlayers) throw new UserError('La partie est complète.');
    this.leaveCurrent(userId);
    l.players.push({ userId, ready: false, joinedAt: Date.now(), connected: true });
    this.userLobby.set(userId, l.id);
    this.system(l, `${this.nameOf(userId)} est arrivé·e.`);
    this.broadcast(l);
    // Amis prévenus
    for (const f of this.friends.friendIds(userId)) {
      if (!this.presence.isOnline(f) || l.players.some((x) => x.userId === f)) continue;
      this.notifications.notify(f, 'FRIEND_JOINED_GAME', 'Un ami rejoint une partie', `${this.auth.getUser(userId)?.username} a rejoint « ${l.name} ».`, l.visibility === 'PUBLIC' ? { lobbyId: l.id } : {}, { ephemeral: true });
    }
    this.notifyFriendsOfPresence(userId);
    return this.view(l, userId);
  }

  private leaveCurrent(userId: string) {
    if (this.userLobby.has(userId)) this.leave(userId);
  }

  leave(userId: string) {
    const l = this.lobbyOfUser(userId);
    if (!l) return;
    this.userLobby.delete(userId);
    l.players = l.players.filter((p) => p.userId !== userId);
    if (l.game && l.inGame.has(userId)) {
      l.inGame.delete(userId);
      l.game.setConnected(userId, false);
      this.maybeDisposeGame(l);
    }
    this.emitter.toUser(userId, 'lobby:state', null);
    this.notifyFriendsOfPresence(userId);
    const humans = l.players.filter((p) => !isBot(p.userId));
    if (humans.length === 0) {
      l.players = [];
      this.destroy(l);
      return;
    }
    if (l.hostId === userId) {
      l.hostId = humans[0].userId;
      this.system(l, `${this.nameOf(l.hostId)} est maintenant l’hôte.`);
    }
    if (l.status === 'STARTING') this.cancelStart(l, 'Un joueur est parti : lancement annulé.');
    this.system(l, `${this.nameOf(userId)} est parti·e.`);
    this.broadcast(l);
  }

  private destroy(l: Lobby) {
    if (l.startTimer) clearTimeout(l.startTimer);
    l.game?.stop();
    for (const p of l.players) this.userLobby.delete(p.userId);
    this.lobbies.delete(l.id);
  }

  private requireHost(userId: string): Lobby {
    const l = this.lobbyOfUser(userId);
    if (!l) throw new UserError('Vous n’êtes dans aucune partie.');
    if (l.hostId !== userId) throw new UserError('Seul l’hôte peut faire cela.');
    return l;
  }

  setReady(userId: string, ready: boolean) {
    const l = this.lobbyOfUser(userId);
    if (!l) throw new UserError('Vous n’êtes dans aucune partie.');
    if (l.status !== 'WAITING') throw new UserError('Trop tard pour changer d’avis.');
    const p = l.players.find((x) => x.userId === userId)!;
    p.ready = !!ready;
    this.broadcast(l);
  }

  kick(hostId: string, targetId: string) {
    const l = this.requireHost(hostId);
    if (targetId === hostId) throw new UserError('Vous ne pouvez pas vous expulser.');
    if (l.game) throw new UserError('Impossible pendant une partie.');
    if (!l.players.some((p) => p.userId === targetId)) throw new UserError('Joueur absent.');
    if (isBot(targetId)) {
      const name = this.nameOf(targetId, l);
      l.players = l.players.filter((p) => p.userId !== targetId);
      l.bots.delete(targetId);
      this.system(l, `${name} quitte la villa.`);
      this.broadcast(l);
      return;
    }
    this.leave(targetId);
    this.notifications.notify(targetId, 'KICKED', 'Expulsé·e', `L’hôte vous a retiré·e de « ${l.name} ».`, {}, { ephemeral: true });
  }

  updateSettings(hostId: string, p: { name?: string; maxPlayers?: number; visibility?: LobbyVisibility; duration?: NightDuration }) {
    const l = this.requireHost(hostId);
    if (l.status !== 'WAITING') throw new UserError('Impossible maintenant.');
    Object.assign(l, this.validateSettings(p, l));
    if (p.duration === 'short' || p.duration === 'normal') l.duration = p.duration;
    this.system(l, 'L’hôte a modifié les paramètres.');
    this.broadcast(l);
  }

  close(hostId: string) {
    const l = this.requireHost(hostId);
    for (const p of [...l.players]) {
      this.userLobby.delete(p.userId);
      this.emitter.toUser(p.userId, 'lobby:state', null);
      if (p.userId !== hostId) this.notifications.notify(p.userId, 'LOBBY_CLOSED', 'Partie fermée', `L’hôte a fermé « ${l.name} ».`, {}, { ephemeral: true });
      this.notifyFriendsOfPresence(p.userId);
    }
    l.players = [];
    if (l.game) for (const id of l.inGame) this.emitter.toUser(id, 'game:ended');
    this.destroy(l);
  }

  invite(fromId: string, targetId: string) {
    const l = this.lobbyOfUser(fromId);
    if (!l) throw new UserError('Vous n’êtes dans aucune partie.');
    if (!this.friends.areFriends(fromId, targetId)) throw new UserError('Vous ne pouvez inviter que vos amis.');
    if (l.players.some((p) => p.userId === targetId)) throw new UserError('Déjà dans la partie.');
    if (l.players.length >= l.maxPlayers) throw new UserError('La partie est complète.');
    const from = this.nameOf(fromId);
    this.notifications.notify(targetId, 'GAME_INVITE', 'Invitation', `${from} vous invite à rejoindre « ${l.name} ».`, { lobbyId: l.id, code: l.code, fromId });
  }

  respondInvite(userId: string, notificationId: string, accept: boolean): LobbyView | null {
    const n = this.notifications.get(userId, notificationId);
    if (!n || n.type !== 'GAME_INVITE') throw new UserError('Invitation introuvable.');
    this.notifications.markRead(userId, [notificationId]);
    if (!accept) return null;
    return this.join(userId, { code: String(n.payload?.code ?? '') });
  }

  chat(userId: string, text: string) {
    const l = this.lobbyOfUser(userId);
    if (!l) throw new UserError('Vous n’êtes dans aucune partie.');
    const t = String(text ?? '').trim().slice(0, META_CONFIG.chatMaxLength);
    if (!t) throw new UserError('Message vide.');
    l.chat.push({ id: shortId('lc_'), userId, name: this.nameOf(userId), text: t, at: Date.now() });
    if (l.chat.length > 100) l.chat.splice(0, l.chat.length - 100);
    this.broadcast(l);
  }

  // ───────────── invités IA ─────────────

  addBot(hostId: string) {
    const l = this.requireHost(hostId);
    if (l.status !== 'WAITING' || l.game) throw new UserError('Impossible maintenant.');
    if (l.players.length >= l.maxPlayers) throw new UserError('La partie est complète.');
    const taken = new Set(l.players.map((p) => this.nameOf(p.userId, l)));
    let character = randomCharacter();
    for (let i = 0; i < 20 && taken.has(`${character.firstName} ${character.lastName}`); i++) character = randomCharacter();
    const id = `bot:${shortId()}`;
    const name = `${character.firstName} ${character.lastName}`;
    l.bots.set(id, { name, character });
    l.players.push({ userId: id, ready: true, joinedAt: Date.now(), connected: true });
    this.system(l, `${name} (invité IA) est arrivé·e.`);
    this.broadcast(l);
  }

  /** Partie rapide : un salon privé, des invités IA, nuit courte, lancement immédiat. */
  quickPlay(userId: string, bots = 4): LobbyView {
    const view = this.create(userId, { name: 'Partie rapide', maxPlayers: bots + 1, visibility: 'PRIVATE', duration: 'short' });
    for (let i = 0; i < bots; i++) this.addBot(userId);
    this.start(userId);
    return this.view(this.lobbies.get(view.id)!, userId);
  }

  // ───────────── lancement ─────────────

  start(hostId: string) {
    const l = this.requireHost(hostId);
    const v = this.view(l, hostId);
    if (l.game) throw new UserError('Une partie est déjà en cours.');
    if (l.players.length < META_CONFIG.minPlayersToStart) throw new UserError(`Il faut au moins ${META_CONFIG.minPlayersToStart} joueurs.`);
    if (!v.canStart) throw new UserError('Tous les joueurs doivent être prêts.');
    l.status = 'STARTING';
    this.system(l, 'Les portes de la villa se referment derrière vous…');
    this.broadcast(l);
    for (const p of l.players)
      this.emitter.toUser(p.userId, 'lobby:transition', { title: l.name, clock: GAME_CONFIG.startClockMinutes, durationMs: this.transitionMs });
    l.startTimer = setTimeout(() => this.launch(l), this.transitionMs);
  }

  private cancelStart(l: Lobby, reason: string) {
    if (l.startTimer) clearTimeout(l.startTimer);
    l.status = 'WAITING';
    for (const p of l.players) p.ready = isBot(p.userId);
    this.system(l, reason);
  }

  private launch(l: Lobby) {
    l.startTimer = undefined;
    if (!this.lobbies.has(l.id) || l.status !== 'STARTING') return;
    const players = l.players.map((p) => ({
      userId: p.userId,
      name: this.nameOf(p.userId, l),
      character: l.bots.get(p.userId)?.character ?? this.profiles.getCharacter(p.userId)!,
      bot: isBot(p.userId),
    }));
    l.inGame = new Set(players.filter((p) => !p.bot).map((p) => p.userId));
    l.game = new GameInstance({
      id: newId(),
      lobbyId: l.id,
      title: l.name,
      players,
      timeScale: this.timeScale * DURATION_SCALE[l.duration],
      emit: (userId, event, payload) => {
        if (l.inGame.has(userId)) this.emitter.toUser(userId, event, payload);
      },
      onFinished: (epi) => this.onGameFinished(l, epi),
    });
    l.status = 'IN_GAME';
    for (const p of l.players) {
      if (isBot(p.userId)) continue;
      if (!p.connected) l.game.setConnected(p.userId, false);
      this.emitter.toUser(p.userId, 'session:state', this.sessionState(p.userId));
      this.notifyFriendsOfPresence(p.userId);
    }
    this.broadcast(l);
  }

  private onGameFinished(l: Lobby, epi: EpilogueView) {
    const g = l.game!;
    for (const p of g.players.values()) {
      if (p.bot) continue;
      const won = epi.caseType === 'quiet' ? false : p.id === epi.culpritId ? !epi.culpritCaught : epi.culpritCaught;
      try {
        this.profiles.recordGame(p.id, won);
      } catch {
        /* utilisateur supprimé */
      }
    }
    this.db
      .prepare('INSERT INTO game_history (id, lobby_name, case_type, summary, players, ended_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(g.id, l.name, epi.caseType, epi.headline, JSON.stringify([...g.players.values()].map((p) => p.name)), Date.now());
    // Le salon redevient disponible ; chacun y revient quand il a fini de lire l'épilogue
    l.status = 'WAITING';
    for (const p of l.players) p.ready = isBot(p.userId);
    this.system(l, `Fin de la nuit : ${epi.headline}`);
    this.broadcast(l);
    // filet de sécurité : libère la partie au bout de 15 minutes
    setTimeout(() => {
      if (l.game === g) {
        for (const id of [...l.inGame]) this.returnToLobby(id);
      }
    }, 15 * 60_000).unref?.();
  }

  /** Après l'épilogue : retour au salon (même groupe, prêt à rejouer). */
  returnToLobby(userId: string) {
    const l = this.lobbyOfUser(userId);
    if (!l?.game || !l.inGame.has(userId)) throw new UserError('Aucune partie en cours.');
    if (!l.game.ended) throw new UserError('La partie n’est pas terminée. Quitter le lobby pour abandonner.');
    l.inGame.delete(userId);
    this.emitter.toUser(userId, 'game:ended');
    this.emitter.toUser(userId, 'session:state', this.sessionState(userId));
    this.maybeDisposeGame(l);
    this.notifyFriendsOfPresence(userId);
  }

  private maybeDisposeGame(l: Lobby) {
    if (l.game && l.inGame.size === 0) {
      l.game.stop();
      l.game = null;
      l.status = 'WAITING';
      this.broadcast(l);
    }
  }

  /** Arrêt propre du serveur : stoppe les parties et les minuteries. */
  shutdown() {
    for (const t of this.disconnectTimers.values()) clearTimeout(t);
    this.disconnectTimers.clear();
    for (const l of [...this.lobbies.values()]) this.destroy(l);
  }

  // ───────────── connexion ─────────────

  onConnect(userId: string) {
    const t = this.disconnectTimers.get(userId);
    if (t) clearTimeout(t);
    this.disconnectTimers.delete(userId);
    const l = this.lobbyOfUser(userId);
    if (!l) return;
    const p = l.players.find((x) => x.userId === userId);
    if (p && !p.connected) {
      p.connected = true;
      this.broadcast(l);
    }
    if (l.game && l.inGame.has(userId)) l.game.setConnected(userId, true);
  }

  onDisconnect(userId: string) {
    const l = this.lobbyOfUser(userId);
    if (!l) return;
    const p = l.players.find((x) => x.userId === userId);
    if (p) p.connected = false;
    if (l.game && l.inGame.has(userId)) {
      l.game.setConnected(userId, false);
    } else {
      // Dans le salon : délai de grâce pour une reconnexion (rafraîchissement de page…)
      this.disconnectTimers.set(
        userId,
        setTimeout(() => {
          this.disconnectTimers.delete(userId);
          if (!this.presence.isOnline(userId)) this.leave(userId);
        }, 45_000),
      );
    }
    this.broadcast(l);
  }
}
