/**
 * Lobbies (salons d'avant-partie) et cycle de vie des parties.
 * Toutes les permissions (hôte, places, statut) sont vérifiées ici, côté serveur.
 */
import type { LobbyView, LobbyVisibility, ServerFilters, ServerListEntry, EpilogueView } from '@shared/types';
import { GAME_NAME, META_CONFIG, NIGHT_DURATIONS, isNightDuration, type NightDuration } from '@shared/config';
import { buildIntroPlan, introSchedule, type IntroPlan } from '@shared/content/intro';
import { CAST_IDS, castById } from '@shared/content/cast';
import { characterFromCast } from '@shared/content/character';
import { GameInstance } from '../game/GameInstance';
import type { ProfileService } from './profiles';
import type { FriendService } from './friends';
import type { NotificationService } from './notifications';
import type { PresenceService } from './presence';
import type { MetaStore } from './store';
import { lobbyCode, newId, pick, shortId, UserError } from '../util';

interface LobbyPlayer {
  userId: string;
  username: string;
  /** personnage réservé (unique dans le salon, garanti ici côté serveur) */
  castId: string | null;
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
  version: number;
  /** joueurs encore « dans » la partie (avant retour au lobby) */
  inGame: Set<string>;
  /** cinématique en cours : composition figée, états cadencés par le serveur */
  intro?: { plan: IntroPlan; timers: NodeJS.Timeout[]; loading: boolean; ready: Set<string> };
  duration: NightDuration;
}



export interface LobbyEmitter {
  toUser(userId: string, event: string, payload?: unknown): void;
}

export class LobbyManager {
  private lobbies = new Map<string, Lobby>();
  private userLobby = new Map<string, string>();
  private disconnectTimers = new Map<string, NodeJS.Timeout>();
  /** Accélération (tests) : durée de la nuit et de la cinématique d'arrivée (15–25 s en jeu réel). */
  timeScale = Number(process.env.EHAS_TIME_SCALE ?? 1);
  transitionMs = Number(process.env.EHAS_TRANSITION_MS ?? 20000);
  /** Attente maximale du chargement de tous les joueurs avant de lancer la cinématique quand même. */
  loadTimeoutMs = Number(process.env.EHAS_LOAD_TIMEOUT_MS ?? 30000);

  constructor(
    private store: MetaStore,
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

  private lobbyOfUser(userId: string): Lobby | undefined {
    const id = this.userLobby.get(userId);
    return id ? this.lobbies.get(id) : undefined;
  }

  /** Nom affiché : le personnage choisi, sinon le pseudo. */
  private nameOf(l: Lobby, userId: string) {
    const p = l.players.find((x) => x.userId === userId);
    const c = castById(p?.castId);
    return c ? `${c.firstName} ${c.lastName}` : (p?.username ?? '???');
  }

  view(l: Lobby, forUser?: string): LobbyView {
    const readyCount = l.players.filter((p) => p.ready || p.userId === l.hostId).length;
    return {
      id: l.id,
      version: l.version,
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
        readyCount === l.players.length &&
        l.players.every((p) => p.castId),
      players: l.players.map((p) => ({
        userId: p.userId,
        username: p.username,
        castId: p.castId,
        character: p.castId ? characterFromCast(castById(p.castId)!) : null,
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

  /** Plan de la cinématique en cours si ce joueur en fait partie. */
  introOf(userId: string): { plan: IntroPlan; loading: boolean } | null {
    const intro = this.lobbyOfUser(userId)?.intro;
    return intro && intro.plan.occupants.some((o) => o.userId === userId) ? { plan: intro.plan, loading: intro.loading } : null;
  }

  gameOf(userId: string): GameInstance | null {
    const l = this.lobbyOfUser(userId);
    return l?.game && l.inGame.has(userId) ? l.game : null;
  }

  async list(userId: string, filters: ServerFilters = {}): Promise<ServerListEntry[]> {
    const friendIds = new Set(await this.friends.friendIds(userId));
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
        hostName: this.nameOf(l, l.hostId),
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
    l.version++;
    for (const p of l.players) this.emitter.toUser(p.userId, 'lobby:state', this.view(l, p.userId));
  }

  private notifyFriendsOfPresence(userId: string) {
    this.friends
      .friendIds(userId)
      .then((ids) => ids.forEach((f) => this.emitter.toUser(f, 'friends:changed')))
      .catch(() => {});
  }

  private system(l: Lobby, text: string) {
    l.chat.push({ id: shortId('lc_'), userId: null, name: GAME_NAME, text, at: Date.now() });
  }

  // ───────────── actions ─────────────

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

  create(userId: string, username: string, p: { name: string; maxPlayers: number; visibility: LobbyVisibility; duration?: NightDuration }): LobbyView {
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
      players: [{ userId, username, castId: null, ready: false, joinedAt: Date.now(), connected: true }],
      chat: [],
      game: null,
      version: 1,
      inGame: new Set(),
      duration: isNightDuration(p.duration) ? p.duration : 'normal',
    };
    this.system(l, `${username} a ouvert les portes de « ${l.name} ».`);
    this.lobbies.set(l.id, l);
    this.userLobby.set(userId, l.id);
    this.notifyFriendsOfPresence(userId);
    return this.view(l, userId);
  }

  join(userId: string, username: string, p: { lobbyId?: string; code?: string }): LobbyView {
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
    l.players.push({ userId, username, castId: null, ready: false, joinedAt: Date.now(), connected: true });
    this.userLobby.set(userId, l.id);
    this.system(l, `${username} est arrivé·e.`);
    this.broadcast(l);
    // Amis prévenus (et listes d'amis rafraîchies)
    const lobby = l;
    this.friends
      .friendIds(userId)
      .then((ids) => {
        for (const f of ids) {
          this.emitter.toUser(f, 'friends:changed');
          if (!this.presence.isOnline(f) || lobby.players.some((x) => x.userId === f)) continue;
          this.notifications.notify(f, 'FRIEND_JOINED_GAME', 'Un ami rejoint une partie', `${username} a rejoint « ${lobby.name} ».`, lobby.visibility === 'PUBLIC' ? { lobbyId: lobby.id } : {}, { ephemeral: true });
        }
      })
      .catch(() => {});
    return this.view(l, userId);
  }

  private leaveCurrent(userId: string) {
    if (this.userLobby.has(userId)) this.leave(userId);
  }

  leave(userId: string) {
    const l = this.lobbyOfUser(userId);
    if (!l) return;
    const name = this.nameOf(l, userId);
    this.userLobby.delete(userId);
    l.players = l.players.filter((p) => p.userId !== userId);
    if (l.game && l.inGame.has(userId)) {
      l.inGame.delete(userId);
      l.game.setConnected(userId, false);
      this.maybeDisposeGame(l);
    }
    this.emitter.toUser(userId, 'lobby:state', null);
    this.notifyFriendsOfPresence(userId);
    if (l.players.length === 0) {
      this.destroy(l);
      return;
    }
    if (l.hostId === userId) {
      l.hostId = l.players[0].userId;
      this.system(l, `${this.nameOf(l, l.hostId)} est maintenant l’hôte.`);
    }
    // Pendant la cinématique, la composition est figée : on ne l'interrompt pas pour un départ.
    if (l.intro?.loading) this.introReadyCheck(l);
    this.system(l, `${name} est parti·e.`);
    this.broadcast(l);
  }

  private destroy(l: Lobby) {
    this.clearIntro(l);
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
    if (ready && !p.castId) throw new UserError('Choisissez d’abord votre personnage.');
    p.ready = !!ready;
    this.broadcast(l);
  }

  /**
   * Réservation d'un personnage. Atomique : le serveur traite les messages un par un, la vérification
   * et l'attribution se font sans interruption — deux joueurs ne peuvent jamais obtenir le même.
   * castId = null libère la réservation.
   */
  pickCharacter(userId: string, castId: string | null): LobbyView {
    const l = this.lobbyOfUser(userId);
    if (!l) throw new UserError('Vous n’êtes dans aucune partie.');
    if (l.status !== 'WAITING' || l.game) throw new UserError('La sélection est close : la partie a commencé.');
    const p = l.players.find((x) => x.userId === userId)!;
    if (castId !== null) {
      if (typeof castId !== 'string' || !castById(castId)) throw new UserError('Personnage inconnu.');
      if (p.castId === castId) return this.view(l, userId);
      const holder = l.players.find((x) => x.castId === castId && x.userId !== userId);
      if (holder) throw new UserError(`Ce personnage vient d’être choisi par ${holder.username}.`);
    }
    p.castId = castId;
    if (!castId) p.ready = false;
    this.broadcast(l);
    return this.view(l, userId);
  }

  kick(hostId: string, targetId: string) {
    const l = this.requireHost(hostId);
    if (targetId === hostId) throw new UserError('Vous ne pouvez pas vous expulser.');
    if (l.game || l.status !== 'WAITING') throw new UserError('Impossible pendant une partie.');
    if (!l.players.some((p) => p.userId === targetId)) throw new UserError('Joueur absent.');
    this.leave(targetId);
    this.notifications.notify(targetId, 'KICKED', 'Expulsé·e', `L’hôte vous a retiré·e de « ${l.name} ».`, {}, { ephemeral: true });
  }

  updateSettings(hostId: string, p: { name?: string; maxPlayers?: number; visibility?: LobbyVisibility; duration?: NightDuration }) {
    const l = this.requireHost(hostId);
    if (l.status !== 'WAITING') throw new UserError('Impossible maintenant.');
    Object.assign(l, this.validateSettings(p, l));
    if (isNightDuration(p.duration)) l.duration = p.duration;
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

  async invite(fromId: string, targetId: string) {
    const l = this.lobbyOfUser(fromId);
    if (!l) throw new UserError('Vous n’êtes dans aucune partie.');
    if (!(await this.friends.areFriends(fromId, targetId))) throw new UserError('Vous ne pouvez inviter que vos amis.');
    if (l.players.some((p) => p.userId === targetId)) throw new UserError('Déjà dans la partie.');
    if (l.players.length >= l.maxPlayers) throw new UserError('La partie est complète.');
    const from = l.players.find((p) => p.userId === fromId)?.username ?? '???';
    this.notifications.notify(targetId, 'GAME_INVITE', 'Invitation', `${from} vous invite à rejoindre « ${l.name} ».`, { lobbyId: l.id, code: l.code, fromId });
  }

  async respondInvite(userId: string, username: string, notificationId: string, accept: boolean): Promise<LobbyView | null> {
    const n = await this.notifications.get(userId, notificationId);
    if (!n || n.type !== 'GAME_INVITE') throw new UserError('Invitation introuvable.');
    await this.notifications.markRead(userId, [notificationId]);
    if (!accept) return null;
    return this.join(userId, username, { code: String(n.payload?.code ?? '') });
  }

  chat(userId: string, text: string) {
    const l = this.lobbyOfUser(userId);
    if (!l) throw new UserError('Vous n’êtes dans aucune partie.');
    const t = String(text ?? '').trim().slice(0, META_CONFIG.chatMaxLength);
    if (!t) throw new UserError('Message vide.');
    l.chat.push({ id: shortId('lc_'), userId, name: this.nameOf(l, userId), text: t, at: Date.now() });
    if (l.chat.length > 100) l.chat.splice(0, l.chat.length - 100);
    this.broadcast(l);
  }

  // ───────────── lancement ─────────────

  start(hostId: string) {
    const l = this.requireHost(hostId);
    const v = this.view(l, hostId);
    if (l.game) throw new UserError('Une partie est déjà en cours.');
    if (l.players.length < META_CONFIG.minPlayersToStart) throw new UserError(`Il faut au moins ${META_CONFIG.minPlayersToStart} joueurs.`);
    if (l.players.some((p) => !p.castId)) throw new UserError('Chaque joueur doit choisir son personnage.');
    if (!v.canStart) throw new UserError('Tous les joueurs doivent être prêts.');
    l.status = 'STARTING';
    this.system(l, 'En route pour la villa…');
    this.broadcast(l);
    // Composition FIGÉE : ces joueurs (et eux seuls) sont dans le véhicule et dans la partie
    const plan = buildIntroPlan(
      l.players.map((p) => ({ userId: p.userId, name: this.nameOf(l, p.userId), character: characterFromCast(castById(p.castId)!) })),
      {
        id: shortId('intro_'),
        seed: Math.floor(Math.random() * 2 ** 31),
        startedAt: 0,
        durationMs: this.transitionMs,
        // la victime : un membre du catalogue que personne n'incarne dans ce salon
        victimCastId: pick(CAST_IDS.filter((id) => !l.players.some((p) => p.castId === id)), Math.random),
      },
    );
    // 1) Chargement : chaque client charge la villa, les personnages et la partie, puis le signale.
    l.intro = { plan, timers: [], loading: true, ready: new Set() };
    for (const p of l.players) this.emitter.toUser(p.userId, 'lobby:intro', { plan, serverNow: Date.now(), loading: true });
    l.intro.timers.push(setTimeout(() => this.beginIntro(l, plan.id), this.loadTimeoutMs));
  }

  /** Un client a fini de charger ; la cinématique démarre quand tous les joueurs connectés sont prêts. */
  introReady(userId: string, planId: string) {
    const l = this.lobbyOfUser(userId);
    if (!l?.intro || l.intro.plan.id !== planId || !l.intro.loading) return;
    l.intro.ready.add(userId);
    const waiting = l.players.filter((p) => p.connected && !l.intro!.ready.has(p.userId));
    if (!waiting.length) this.beginIntro(l, planId);
  }

  /** 2) Cinématique : même horloge pour tous, états cadencés par le serveur, puis la partie. */
  private beginIntro(l: Lobby, planId: string) {
    const intro = l.intro;
    if (!intro || intro.plan.id !== planId || !intro.loading || !this.lobbies.has(l.id)) return;
    for (const t of intro.timers) clearTimeout(t);
    intro.timers = [];
    intro.loading = false;
    const plan = intro.plan;
    plan.startedAt = Date.now();
    for (const p of l.players) this.emitter.toUser(p.userId, 'lobby:intro', { plan, serverNow: Date.now(), loading: false });
    for (const step of introSchedule(plan.durationMs)) {
      if (step.at === 0) continue;
      intro.timers.push(
        setTimeout(() => {
          if (l.intro?.plan.id !== plan.id) return;
          for (const id of plan.occupants.map((o) => o.userId))
            if (l.players.some((p) => p.userId === id)) this.emitter.toUser(id, 'lobby:intro-state', { planId: plan.id, state: step.state, serverNow: Date.now() });
          if (step.state === 'GAME_START') this.launch(l);
        }, step.at),
      );
    }
  }

  private introReadyCheck(l: Lobby) {
    const intro = l.intro;
    if (!intro?.loading) return;
    if (!l.players.some((p) => p.connected && !intro.ready.has(p.userId))) this.beginIntro(l, intro.plan.id);
  }

  private clearIntro(l: Lobby) {
    for (const t of l.intro?.timers ?? []) clearTimeout(t);
    l.intro = undefined;
  }

  private launch(l: Lobby) {
    const plan = l.intro?.plan;
    this.clearIntro(l);
    if (!plan || !this.lobbies.has(l.id) || l.status !== 'STARTING') return;
    // Exactement les joueurs de la cinématique ; ceux partis entre-temps restent dans
    // l'histoire (personnage présent, considéré déconnecté) mais ne sont plus suivis par le salon.
    const players = plan.occupants.map((o) => ({ userId: o.userId, name: o.name, character: o.character }));
    const present = new Set(l.players.map((p) => p.userId));
    for (const p of players) {
      // une déconnexion pendant la partie ne fait pas quitter le salon (délai de grâce du salon annulé)
      const t = this.disconnectTimers.get(p.userId);
      if (t) clearTimeout(t);
      this.disconnectTimers.delete(p.userId);
    }
    l.inGame = new Set(players.filter((p) => present.has(p.userId)).map((p) => p.userId));
    l.game = new GameInstance({
      id: newId(),
      lobbyId: l.id,
      title: l.name,
      players,
      timeScale: this.timeScale * NIGHT_DURATIONS[l.duration].scale,
      voteScale: this.timeScale,
      victimCastId: plan.victimCastId,
      emit: (userId, event, payload) => {
        if (l.inGame.has(userId)) this.emitter.toUser(userId, event, payload);
      },
      onFinished: (epi) => this.onGameFinished(l, epi),
    });
    l.status = 'IN_GAME';
    for (const p of players) if (!present.has(p.userId)) l.game.setConnected(p.userId, false);
    for (const p of l.players) {
      if (!p.connected) l.game.setConnected(p.userId, false);
      this.emitter.toUser(p.userId, 'session:state', this.sessionState(p.userId));
      this.notifyFriendsOfPresence(p.userId);
    }
    this.broadcast(l);
  }

  private onGameFinished(l: Lobby, epi: EpilogueView) {
    const g = l.game!;
    for (const p of g.players.values()) {
      const won = epi.outcomes.find((o) => o.playerId === p.id)?.won ?? false;
      this.profiles.recordGame(p.id, won).catch(() => {});
    }
    this.store
      .insertGame(
        { id: g.id, lobbyName: l.name, caseType: epi.scenarioTitle, summary: epi.headline, players: [...g.players.values()].map((p) => p.name), endedAt: Date.now() },
        [...g.players.keys()],
      )
      .catch((e) => console.error('historique non enregistré', e));
    // Le salon redevient disponible ; nouvelle partie = nouvelle sélection des personnages
    l.status = 'WAITING';
    for (const p of l.players) {
      p.ready = false;
      p.castId = null;
    }
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
    if (l.intro?.loading) this.introReadyCheck(l);
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
