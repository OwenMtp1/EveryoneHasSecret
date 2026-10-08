/**
 * État client. Le client ne détient AUCUNE vérité : il affiche ce que le serveur lui envoie.
 */
import { create } from 'zustand';
import type { AppNotification, Character, FriendEntry, GameSelfView, GameSnapshot, LobbyView } from '@shared/types';
import { api, tokenStore } from './net/api';
import { call, connectSocket, disconnectSocket } from './net/socket';
import { audio } from './audio';

export type Screen =
  | 'boot'
  | 'auth'
  | 'character'
  | 'menu'
  | 'play'
  | 'servers'
  | 'create'
  | 'join'
  | 'friends'
  | 'profile'
  | 'settings'
  | 'lobby'
  | 'game';

export interface Settings {
  music: number;
  sfx: number;
  reducedMotion: boolean;
}

const SETTINGS_KEY = 'ehas.settings';
function loadSettings(): Settings {
  try {
    return { music: 0.4, sfx: 0.6, reducedMotion: false, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') };
  } catch {
    return { music: 0.4, sfx: 0.6, reducedMotion: false };
  }
}

interface Toast extends AppNotification {
  expiresAt: number;
}

interface AppState {
  screen: Screen;
  user: { id: string; username: string } | null;
  character: Character | null;
  stats: { gamesPlayed: number; gamesWon: number; createdAt: number } | null;
  connected: boolean;
  lobby: LobbyView | null;
  inGame: boolean;
  game: GameSelfView | null;
  transition: { title: string; clock: number; durationMs: number; startedAt: number } | null;
  notifications: AppNotification[];
  toasts: Toast[];
  friends: FriendEntry[];
  settings: Settings;
  /** dernier message d'action (retour serveur) */
  actionMessage: { text: string; error: boolean; at: number } | null;

  go: (s: Screen) => void;
  boot: () => Promise<void>;
  onAuthenticated: (token: string) => Promise<void>;
  logout: () => Promise<void>;
  setCharacter: (c: Character) => void;
  refreshFriends: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
  dismissToast: (id: string) => void;
  updateSettings: (s: Partial<Settings>) => void;
  flash: (text: string, error?: boolean) => void;
}

export const useStore = create<AppState>((set, get) => ({
  screen: 'boot',
  user: null,
  character: null,
  stats: null,
  connected: false,
  lobby: null,
  inGame: false,
  game: null,
  transition: null,
  notifications: [],
  toasts: [],
  friends: [],
  settings: loadSettings(),
  actionMessage: null,

  go: (screen) => {
    audio.click();
    set({ screen });
  },

  boot: async () => {
    const token = tokenStore.get();
    if (!token) return set({ screen: 'auth' });
    try {
      await get().onAuthenticated(token);
    } catch {
      tokenStore.set(null);
      set({ screen: 'auth' });
    }
  },

  onAuthenticated: async (token) => {
    tokenStore.set(token);
    const me = await api.me();
    set({ user: me.user, character: me.character, stats: me.profile, screen: me.character ? 'menu' : 'character' });
    const s = connectSocket(token);
    s.on('connect', () => {
      set({ connected: true });
      get().refreshFriends();
      get().refreshNotifications();
    });
    s.on('disconnect', () => set({ connected: false }));
    s.on('connect_error', (err) => {
      if (err.message === 'unauthorized') get().logout();
    });
    s.on('session:state', ({ lobby, inGame }) => {
      const cur = get().screen;
      set({ lobby, inGame });
      if (inGame) set({ screen: 'game', transition: null });
      else if (lobby && (cur === 'game' || cur === 'menu' || cur === 'play' || cur === 'servers' || cur === 'join' || cur === 'create')) set({ screen: 'lobby' });
      else if (!lobby && cur === 'game') set({ screen: 'menu', game: null });
    });
    s.on('lobby:state', (lobby) => {
      const st = get();
      set({ lobby });
      if (!lobby && st.screen === 'lobby') set({ screen: 'menu' });
    });
    s.on('lobby:transition', (t) => {
      audio.sting();
      set({ transition: { ...t, startedAt: Date.now() } });
    });
    s.on('notification', (n) => {
      audio.notify();
      set((st) => ({
        notifications: [n, ...st.notifications.filter((x) => x.id !== n.id)].slice(0, 60),
        toasts: [...st.toasts, { ...n, expiresAt: Date.now() + (n.type === 'GAME_INVITE' ? 20000 : 6000) }].slice(-4),
      }));
      if (n.type.startsWith('FRIEND')) get().refreshFriends();
    });
    s.on('friends:changed', () => get().refreshFriends());
    // Les vues de partie arrivent jusqu'à 12 fois/s : on les regroupe en UNE mise à jour par image
    // (évite les rafales de rendus quand l'onglet ou le GPU est lent).
    let pendingFull: GameSelfView | null = null;
    let pendingSnap: GameSnapshot | null = null;
    let scheduled = false;
    const flush = () => {
      scheduled = false;
      const st = get();
      let next = pendingFull ?? st.game;
      if (pendingSnap && next) next = { ...next, ...pendingSnap };
      const hadFull = !!pendingFull;
      pendingFull = null;
      pendingSnap = null;
      if (!next) return;
      const prev = st.game;
      if (prev && next.feed.length && prev.feed[prev.feed.length - 1]?.id !== next.feed[next.feed.length - 1]?.id) {
        if (next.feed[next.feed.length - 1].style === 'danger') audio.danger();
      }
      if (hadFull && (st.screen !== 'game' || st.transition || !st.inGame)) set({ game: next, inGame: true, screen: 'game', transition: null });
      else set({ game: next });
    };
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      if (document.hidden) setTimeout(flush, 60);
      else requestAnimationFrame(flush);
    };
    s.on('game:full', (view) => {
      pendingFull = view;
      pendingSnap = null;
      schedule();
    });
    s.on('game:snapshot', (snap: GameSnapshot) => {
      pendingSnap = snap;
      schedule();
    });
    s.on('game:ended', () => {
      pendingFull = null;
      pendingSnap = null;
      set({ game: null, inGame: false });
    });
  },

  logout: async () => {
    try {
      await api.logout();
    } catch {
      /* hors-ligne */
    }
    disconnectSocket();
    tokenStore.set(null);
    set({ user: null, character: null, lobby: null, game: null, inGame: false, screen: 'auth', friends: [], notifications: [] });
  },

  setCharacter: (character) => set({ character }),

  refreshFriends: async () => {
    try {
      set({ friends: await call('friends:list') });
    } catch {
      /* ignoré */
    }
  },

  refreshNotifications: async () => {
    try {
      set({ notifications: await call('notifications:list') });
    } catch {
      /* ignoré */
    }
  },

  dismissToast: (id) => set((st) => ({ toasts: st.toasts.filter((t) => t.id !== id) })),

  updateSettings: (s) => {
    const settings = { ...get().settings, ...s };
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* ignoré */
    }
    audio.setVolumes(settings.music, settings.sfx);
    set({ settings });
  },

  flash: (text, error = false) => set({ actionMessage: { text, error, at: Date.now() } }),
}));

/** Exécute un appel serveur et affiche le résultat (ou l'erreur) dans l'interface. */
export async function attempt<T>(p: Promise<T>, success?: string | ((r: T) => string | undefined)): Promise<T | undefined> {
  try {
    const r = await p;
    const msg = typeof success === 'function' ? success(r) : success;
    if (msg) useStore.getState().flash(msg);
    return r;
  } catch (e) {
    audio.error();
    useStore.getState().flash((e as Error).message, true);
    return undefined;
  }
}
