/**
 * État client. Le client ne détient AUCUNE vérité : il affiche ce que le serveur lui envoie.
 */
import { create } from 'zustand';
import type { AppNotification, FriendEntry, GameSelfView, GameSnapshot, LobbyView } from '@shared/types';
import { api, ApiError } from './net/api';
import { authMode, getAccessToken, loadAuthConfig, refreshAccessToken, supabaseAuth, tokenStore } from './net/auth';
import { call, connectSocket, disconnectSocket } from './net/socket';
import { audio } from './audio';
import { introStateAt, type GameIntroState, type IntroPlan } from '@shared/content/intro';
/**
 * Vue de partie « temps réel », hors React : la vue 3D s'y abonne et reçoit chaque mise à jour
 * réseau sans faire re-rendre l'interface.
 */
export const liveGame = {
  current: null as GameSelfView | null,
  listeners: new Set<(v: GameSelfView) => void>(),
  subscribe(fn: (v: GameSelfView) => void) {
    liveGame.listeners.add(fn);
    return () => void liveGame.listeners.delete(fn);
  },
};


export type Screen =
  | 'boot'
  | 'auth'
  | 'username'
  | 'reset'
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
  /** message de l'écran de démarrage (serveur qui se réveille…) */
  bootMessage: string | null;
  /** compte Supabase sans pseudo de jeu */
  pendingProfile: { email?: string; suggested?: string } | null;
  stats: { gamesPlayed: number; gamesWon: number; createdAt: number } | null;
  connected: boolean;
  lobby: LobbyView | null;
  inGame: boolean;
  game: GameSelfView | null;
  /** cinématique d'arrivée : plan serveur, décalage d'horloge (serveur − local), état courant */
  intro: { plan: IntroPlan; offset: number; state: GameIntroState; loading: boolean } | null;
  endIntro: () => void;
  /** la vue 3D de la partie a rendu sa première image (fin du fondu de la cinématique) */
  gameViewReady: boolean;
  notifications: AppNotification[];
  toasts: Toast[];
  friends: FriendEntry[];
  settings: Settings;
  /** dernier message d'action (retour serveur) */
  actionMessage: { text: string; error: boolean; at: number } | null;

  go: (s: Screen) => void;
  boot: () => Promise<void>;
  /** session établie (jeton local déjà enregistré, ou session Supabase active) */
  onAuthenticated: () => Promise<void>;
  logout: (reason?: string) => Promise<void>;
  authNotice: string | null;
  refreshFriends: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
  dismissToast: (id: string) => void;
  updateSettings: (s: Partial<Settings>) => void;
  flash: (text: string, error?: boolean) => void;
}

export const useStore = create<AppState>((set, get) => ({
  screen: 'boot',
  user: null,
  bootMessage: null,
  pendingProfile: null,
  authNotice: null,
  stats: null,
  connected: false,
  lobby: null,
  inGame: false,
  game: null,
  intro: null,
  gameViewReady: false,
  endIntro: () => set({ intro: null }),
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
    await loadAuthConfig((n) => set({ bootMessage: n > 1 ? 'Le serveur se réveille… (jusqu’à une minute)' : 'Connexion au serveur…' }));
    set({ bootMessage: null });
    if (authMode() === 'supabase') {
      // Lien « mot de passe oublié » : Supabase ouvre une session de récupération
      supabaseAuth.onChange((event) => {
        if (event === 'PASSWORD_RECOVERY') set({ screen: 'reset' });
        if (event === 'SIGNED_OUT' && get().user) get().logout('Vous avez été déconnecté·e.');
      });
      if (/[?&](code|type=recovery)/.test(location.search) || location.hash.includes('type=recovery')) {
        // la session de récupération est échangée par supabase-js ; l'évènement ci-dessus suit
        await new Promise((r) => setTimeout(r, 300));
        history.replaceState(null, '', location.pathname);
        if (get().screen === 'reset') return;
      }
    }
    await get().onAuthenticated();
  },

  onAuthenticated: async () => {
    if (!(await getAccessToken())) return set({ screen: 'auth', bootMessage: null });
    // Restauration de session : on ne déconnecte QUE sur un refus explicite (401), jamais sur une panne réseau.
    let me: Awaited<ReturnType<typeof api.me>> | null = null;
    for (let attempt = 0; !me; attempt++) {
      try {
        me = await api.me();
      } catch (e) {
        const status = e instanceof ApiError ? e.status : 0;
        if (status === 401) {
          tokenStore.set(null);
          await supabaseAuth.signOut();
          return set({ screen: 'auth', user: null });
        }
        if (status >= 400 && status < 500) return set({ screen: 'auth', user: null, authNotice: (e as Error).message });
        set({ screen: 'boot', bootMessage: 'Le serveur se réveille… (jusqu’à une minute)' });
        await new Promise((r) => setTimeout(r, Math.min(8000, 1000 * 2 ** Math.min(attempt, 3))));
      }
    }
    if ('needsUsername' in me) return set({ screen: 'username', pendingProfile: { email: me.email, suggested: me.suggested }, bootMessage: null });
    set({ user: me.user, stats: me.profile, screen: 'menu', bootMessage: null, pendingProfile: null, authNotice: null });
    const s = connectSocket();
    s.on('connect', () => {
      set({ connected: true });
      get().refreshFriends();
      get().refreshNotifications();
    });
    s.on('disconnect', () => set({ connected: false }));
    let refreshTried = false;
    s.on('connect', () => (refreshTried = false));
    s.on('connect_error', async (err) => {
      if (err.message !== 'unauthorized') return;
      // Jeton expiré pendant une coupure : un renouvellement, puis reconnexion ; sinon retour à l'accueil
      if (!refreshTried && authMode() === 'supabase' && (await refreshAccessToken())) {
        refreshTried = true;
        s.connect();
        return;
      }
      get().logout('Session expirée. Reconnectez-vous.');
    });
    s.on('session:state', ({ lobby, inGame }) => {
      const cur = get().screen;
      set({ lobby, inGame });
      if (inGame) set({ screen: 'game' });
      else if (lobby && (cur === 'game' || cur === 'menu' || cur === 'play' || cur === 'servers' || cur === 'join' || cur === 'create')) set({ screen: 'lobby' });
      else if (!lobby && cur === 'game') set({ screen: 'menu', game: null });
    });
    s.on('lobby:state', (lobby) => {
      const st = get();
      // états reçus dans le désordre (réponse tardive) : on garde le plus récent
      if (lobby && st.lobby && lobby.id === st.lobby.id && lobby.version < st.lobby.version) return;
      set({ lobby });
      if (!lobby && st.screen === 'lobby') set({ screen: 'menu' });
      if (!lobby && st.intro) set({ intro: null });
    });
    s.on('lobby:intro', ({ plan, serverNow, loading }) => {
      const offset = serverNow - Date.now();
      set({ intro: { plan, offset, loading, state: loading ? 'INTRO_START' : introStateAt(plan.durationMs, serverNow - plan.startedAt) } });
    });
    s.on('lobby:intro-state', ({ planId, state, serverNow }) => {
      const cur = get().intro;
      if (!cur || cur.plan.id !== planId) return;
      // l'horloge se recale à chaque état reçu : tous les clients restent alignés sur le serveur
      set({ intro: { ...cur, state, offset: serverNow - Date.now() } });
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
    let lastUiAt = 0;
    const flush = () => {
      scheduled = false;
      const st = get();
      let next = pendingFull ?? liveGame.current ?? st.game;
      if (pendingSnap && next) next = { ...next, ...pendingSnap };
      const hadFull = !!pendingFull;
      pendingFull = null;
      pendingSnap = null;
      if (!next) return;
      // La 3D reçoit TOUTES les mises à jour…
      liveGame.current = next;
      for (const fn of liveGame.listeners) fn(next);
      // …l'interface React seulement quand c'est utile : vue complète (événement, inventaire, relations…),
      // changement d'heure/phase/coupure/opportunité, ou au plus 4 fois par seconde pour les positions.
      const prev = st.game;
      const now = performance.now();
      const important =
        hadFull || !prev || prev.clock !== next.clock || prev.phase !== next.phase || prev.blackout !== next.blackout || !!prev.opportunity !== !!next.opportunity;
      if (!important && now - lastUiAt < 250) return;
      lastUiAt = now;
      if (prev && next.feed.length && prev.feed[prev.feed.length - 1]?.id !== next.feed[next.feed.length - 1]?.id) {
        if (next.feed[next.feed.length - 1].style === 'danger') audio.danger();
      }
      if (hadFull && (st.screen !== 'game' || !st.inGame)) set({ game: next, inGame: true, screen: 'game', intro: st.intro ? { ...st.intro, state: 'GAME_START' } : null });
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
      liveGame.current = null;
      set({ game: null, inGame: false });
    });
  },

  logout: async (reason) => {
    if (authMode() === 'local') {
      try {
        await api.logout();
      } catch {
        /* hors-ligne */
      }
    }
    disconnectSocket();
    tokenStore.set(null);
    await supabaseAuth.signOut();
    liveGame.current = null;
    set({ user: null, lobby: null, game: null, inGame: false, intro: null, screen: 'auth', friends: [], notifications: [], authNotice: reason ?? null });
  },

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
