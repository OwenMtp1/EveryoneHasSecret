/**
 * Assemblage du serveur : HTTP (auth, personnage, profil) + Socket.IO (temps réel).
 */
import express from 'express';
import { createServer, type Server as HttpServer } from 'node:http';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents, AckResult } from '@shared/protocol';
import { GAME_NAME, GAME_VERSION } from '@shared/config';
import { PostgresStore, SqliteStore, type MetaStore } from './meta/store';
import { AuthService, authConfigFromEnv, type AuthConfig } from './meta/auth';
import { ProfileService } from './meta/profiles';
import { PresenceService } from './meta/presence';
import { NotificationService } from './meta/notifications';
import { FriendService } from './meta/friends';
import { LobbyManager } from './meta/lobbies';
import { UserError } from './util';

export interface AppContext {
  http: HttpServer;
  io: Server<ClientToServerEvents, ServerToClientEvents>;
  store: MetaStore;
  auth: AuthService;
  profiles: ProfileService;
  friends: FriendService;
  lobbies: LobbyManager;
  close: () => Promise<void>;
}

function errorMessage(e: unknown) {
  if (e instanceof UserError) return e.message;
  console.error(e);
  return 'Erreur serveur inattendue.';
}

/** Base META selon l'environnement : Postgres (Supabase) si DATABASE_URL, sinon SQLite. */
export function storeFromEnv(env = process.env, dbPath?: string): MetaStore {
  if (env.DATABASE_URL && !dbPath) {
    const pool = new pg.Pool({
      connectionString: env.DATABASE_URL,
      max: Number(env.DATABASE_POOL_MAX ?? 5),
      ssl: env.DATABASE_SSL === 'false' ? undefined : { rejectUnauthorized: env.DATABASE_SSL_STRICT === 'true' },
    });
    pool.on('error', (e) => console.error('Postgres :', e.message));
    return new PostgresStore(pool);
  }
  return new SqliteStore(dbPath ?? env.EHAS_DB ?? 'data/ehas.sqlite');
}

/** Limiteur simple par clé (IP) : n requêtes par fenêtre. */
function rateLimiter(max: number, windowMs: number) {
  const hits = new Map<string, { n: number; until: number }>();
  return (key: string) => {
    const now = Date.now();
    const h = hits.get(key);
    if (!h || h.until < now) {
      hits.set(key, { n: 1, until: now + windowMs });
      if (hits.size > 20_000) for (const [k, v] of hits) if (v.until < now) hits.delete(k);
      return;
    }
    if (++h.n > max) throw new UserError('Trop de requêtes. Patientez un instant.');
  };
}

export function createApp(opts: { dbPath?: string; store?: MetaStore; auth?: AuthConfig } = {}): AppContext {
  const store = opts.store ?? storeFromEnv(process.env, opts.dbPath);
  const authConfig = opts.auth ?? (opts.dbPath ? { mode: 'local' as const } : authConfigFromEnv());
  if (authConfig.mode === 'supabase' && store.kind !== 'postgres')
    throw new Error('Supabase Auth exige DATABASE_URL (Postgres Supabase) pour les profils.');
  if (authConfig.mode === 'local' && store.kind !== 'sqlite') throw new Error('DATABASE_URL exige Supabase Auth (SUPABASE_URL, SUPABASE_ANON_KEY).');
  const auth = new AuthService(store, authConfig);
  const profiles = new ProfileService(store);
  const presence = new PresenceService();

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=(self)');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    if (process.env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=15552000');
    next();
  });
  app.use(express.json({ limit: '32kb' }));
  const http = createServer(app);
  const allowed = (process.env.EHAS_ALLOWED_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean);
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(http, {
    // Même origine par défaut (pages servies par ce serveur) ; origines supplémentaires explicites seulement.
    cors: allowed.length ? { origin: allowed } : undefined,
    maxHttpBufferSize: 64_000,
  });

  const toUser = (userId: string, event: string, payload?: unknown) => {
    (io.to(`user:${userId}`) as unknown as { emit: (e: string, p?: unknown) => void }).emit(event, payload);
  };
  const notifications = new NotificationService(store, (userId, n) => toUser(userId, 'notification', n));
  const friends = new FriendService(store, auth, presence, notifications);
  friends.onChanged = (userId) => toUser(userId, 'friends:changed');
  const lobbies = new LobbyManager(store, profiles, friends, notifications, presence, { toUser });

  // ───────────── HTTP ─────────────
  const bearer = (req: express.Request) => (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  const requireUser = async (req: express.Request) => {
    const u = await auth.resolveUser(bearer(req));
    if (!u) throw new UserError('Session expirée. Reconnectez-vous.');
    return u;
  };
  const authLimit = rateLimiter(Number(process.env.EHAS_AUTH_RATE_PER_MIN ?? 20), 60_000);
  const route =
    (fn: (req: express.Request) => unknown) =>
    async (req: express.Request, res: express.Response) => {
      try {
        res.setHeader('Cache-Control', 'no-store');
        res.json(await fn(req));
      } catch (e) {
        const msg = errorMessage(e);
        res.status(e instanceof UserError ? (msg.startsWith('Session') ? 401 : msg.startsWith('Trop') ? 429 : 400) : 500).json({ error: msg });
      }
    };

  app.get('/api/health', route(() => ({ ok: true, name: GAME_NAME, version: GAME_VERSION, storage: store.kind, auth: auth.mode })));
  app.get('/api/config', route(() => auth.publicConfig()));
  app.post('/api/auth/register', route(async (req) => {
    authLimit(`auth:${req.ip}`);
    const r = await auth.register(req.body?.username, req.body?.password);
    return { token: r.token, user: { id: r.user.id, username: r.user.username } };
  }));
  app.post('/api/auth/login', route(async (req) => {
    authLimit(`auth:${req.ip}`);
    const r = await auth.login(req.body?.username, req.body?.password);
    return { token: r.token, user: { id: r.user.id, username: r.user.username } };
  }));
  app.post('/api/auth/logout', route(async (req) => {
    await auth.logout(bearer(req));
    return { ok: true };
  }));
  app.get('/api/auth/username-available', route(async (req) => {
    authLimit(`auth:${req.ip}`);
    return { available: await auth.usernameAvailable(String(req.query.u ?? '')) };
  }));
  app.get('/api/me', route(async (req) => {
    const r = await auth.resolve(bearer(req));
    if (!r) throw new UserError('Session expirée. Reconnectez-vous.');
    if ('pending' in r) return { needsUsername: true, email: r.pending.email, suggested: r.pending.suggested };
    const u = r.user;
    return { user: { id: u.id, username: u.username }, profile: { ...(await profiles.getStats(u.id)), createdAt: u.createdAt } };
  }));
  app.post('/api/profile/username', route(async (req) => {
    authLimit(`auth:${req.ip}`);
    const r = await auth.resolve(bearer(req));
    if (!r) throw new UserError('Session expirée. Reconnectez-vous.');
    if ('user' in r) throw new UserError('Votre pseudo est déjà défini.');
    const u = await auth.claimUsername(r.pending.id, req.body?.username);
    return { user: { id: u.id, username: u.username } };
  }));
  app.get('/api/profile/:id', route(async (req) => {
    await requireUser(req);
    const u = await auth.getUser(String(req.params.id));
    if (!u) throw new UserError('Profil introuvable.');
    return { userId: u.id, username: u.username, createdAt: u.createdAt, ...(await profiles.getStats(u.id)), character: null };
  }));
  app.get('/api/history', route(async (req) => {
    const u = await requireUser(req);
    return (await store.listHistory(u.id, 20)).map((h) => ({ lobby_name: h.lobbyName, case_type: h.caseType, summary: h.summary, players: JSON.stringify(h.players), ended_at: h.endedAt }));
  }));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Introuvable.' }));

  const clientDir = resolve('dist/client');
  if (existsSync(clientDir)) {
    app.use(express.static(clientDir, { index: false, maxAge: '1h', setHeaders: (res, path) => {
      if (/\/assets\//.test(path)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } }));
    app.get(/^\/(?!api|socket\.io).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(resolve(clientDir, 'index.html'));
    });
  }

  // ───────────── Socket.IO ─────────────
  io.use((socket, next) => {
    auth
      .resolveUser(socket.handshake.auth?.token)
      .then((u) => {
        if (!u) return next(new Error('unauthorized'));
        socket.data.userId = u.id;
        socket.data.username = u.username;
        next();
      })
      .catch(() => next(new Error('unavailable')));
  });

  /** Membres du vocal par partie (pair-à-pair : le serveur ne voit jamais l'audio). */
  const voiceMembers = new Map<string, Set<string>>();

  io.on('connection', (socket) => {
    const userId: string = socket.data.userId;
    socket.join(`user:${userId}`);
    const first = presence.connect(userId, socket.id);
    lobbies.onConnect(userId);
    socket.emit('session:state', lobbies.sessionState(userId));
    // Reconnexion pendant la cinématique : on reprend au bon moment
    const intro = lobbies.introOf(userId);
    if (intro) socket.emit('lobby:intro', { plan: intro.plan, serverNow: Date.now(), loading: intro.loading });
    const username: string = socket.data.username;
    if (first) {
      friends
        .friendIds(userId)
        .then((ids) => {
          for (const f of ids) {
            toUser(f, 'friends:changed');
            if (presence.isOnline(f))
              notifications.notify(f, 'FRIEND_ONLINE', 'Ami connecté', `${username} est en ligne.`, { userId }, { ephemeral: true });
          }
        })
        .catch(() => {});
    }

    /** Débit maximal d'événements par connexion (protection contre l'inondation). */
    let budget = 40;
    const refill = setInterval(() => (budget = Math.min(40, budget + 20)), 1000);
    socket.on('disconnect', () => clearInterval(refill));

    /** Enveloppe : exécute (synchrone ou non), capture les erreurs utilisateur, répond via ack. */
    const handle =
      <A extends unknown[], R>(fn: (...args: A) => R | Promise<R>) =>
      (...args: [...A, (r: AckResult<R>) => void]) => {
        const ack = args[args.length - 1];
        const params = args.slice(0, -1) as A;
        if (typeof ack !== 'function') return;
        if (--budget < 0) return ack({ ok: false, error: 'Trop de requêtes. Patientez un instant.' });
        Promise.resolve()
          .then(() => fn(...params))
          .then((data) => ack({ ok: true, data }))
          .catch((e) => ack({ ok: false, error: errorMessage(e) }));
      };

    let lastChat = 0;
    const throttleChat = () => {
      const now = Date.now();
      if (now - lastChat < 300) throw new UserError('Doucement…');
      lastChat = now;
    };

    socket.on('friends:list', handle(() => friends.list(userId)));
    socket.on('friends:search', handle(async (q: string) => {
      const ids = new Set((await friends.list(userId)).map((f) => f.userId));
      return (await auth.search(String(q ?? ''), userId)).map((u) => ({ userId: u.id, username: u.username, alreadyLinked: ids.has(u.id) }));
    }));
    socket.on('friends:request', handle(async (name: string) => {
      await friends.request(userId, String(name ?? ''));
      return null;
    }));
    socket.on('friends:respond', handle(async (p: { userId: string; accept: boolean }) => {
      await friends.respond(userId, String(p?.userId), !!p?.accept);
      return null;
    }));
    socket.on('friends:remove', handle(async (other: string) => {
      await friends.remove(userId, String(other));
      return null;
    }));
    socket.on('notifications:list', handle(() => notifications.list(userId)));
    socket.on('notifications:read', handle(async (ids: string[]) => {
      await notifications.markRead(userId, Array.isArray(ids) ? ids.map(String) : []);
      return null;
    }));
    socket.on('invite:respond', handle((p: { notificationId: string; accept: boolean }) => lobbies.respondInvite(userId, username, String(p?.notificationId), !!p?.accept)));

    socket.on('servers:list', handle((f) => lobbies.list(userId, f ?? {})));
    socket.on('lobby:create', handle((p) => lobbies.create(userId, username, p)));
    socket.on('lobby:join', handle((p) => lobbies.join(userId, username, p ?? {})));
    socket.on('lobby:pick', handle((castId) => lobbies.pickCharacter(userId, castId === null ? null : String(castId))));
    socket.on('lobby:leave', handle(() => {
      lobbies.leave(userId);
      return null;
    }));
    socket.on('lobby:ready', handle((r: boolean) => {
      lobbies.setReady(userId, r);
      return null;
    }));
    socket.on('lobby:kick', handle((t: string) => {
      lobbies.kick(userId, String(t));
      return null;
    }));
    socket.on('lobby:settings', handle((p) => {
      lobbies.updateSettings(userId, p ?? {});
      return null;
    }));
    socket.on('lobby:close', handle(() => {
      lobbies.close(userId);
      return null;
    }));
    socket.on('lobby:start', handle(() => {
      lobbies.start(userId);
      return null;
    }));
    socket.on('lobby:intro-ready', (p) => streamOk() && lobbies.introReady(userId, String(p?.planId ?? '')));
    socket.on('lobby:invite', handle(async (t: string) => {
      await lobbies.invite(userId, String(t));
      return null;
    }));
    socket.on('lobby:chat', handle((text: string) => {
      throttleChat();
      lobbies.chat(userId, text);
      return null;
    }));

    // flux sans accusé (déplacements, signalisation vocale) : au plus ~60 messages/s, le reste est ignoré
    let streamBudget = 60;
    const streamRefill = setInterval(() => (streamBudget = 60), 1000);
    socket.on('disconnect', () => clearInterval(streamRefill));
    const streamOk = () => --streamBudget >= 0;

    socket.on('game:input', (p) => {
      if (!streamOk()) return;
      lobbies.gameOf(userId)?.setInput(userId, Number(p?.dx), Number(p?.dy), !!p?.run);
    });
    socket.on('game:action', handle((a) => {
      const g = lobbies.gameOf(userId);
      if (!g) throw new UserError('Aucune partie en cours.');
      return { message: g.action(userId, a) };
    }));
    socket.on('game:chat', handle((p) => {
      throttleChat();
      const g = lobbies.gameOf(userId);
      if (!g) throw new UserError('Aucune partie en cours.');
      g.sendChat(userId, p?.channel, p?.text);
      return null;
    }));
    socket.on('game:leave', handle(() => {
      lobbies.returnToLobby(userId);
      return null;
    }));

    // ───────────── chat vocal : relais de signalisation entre joueurs d'une même partie ─────────────
    const voiceRoom = (gameId: string) => `voice:${gameId}`;
    let voiceGame: string | null = null;
    const leaveVoice = () => {
      if (!voiceGame) return;
      const members = voiceMembers.get(voiceGame);
      members?.delete(userId);
      socket.to(voiceRoom(voiceGame)).emit('voice:peer-left', userId);
      socket.leave(voiceRoom(voiceGame));
      if (members && members.size === 0) voiceMembers.delete(voiceGame);
      voiceGame = null;
    };
    socket.on('voice:join', handle(() => {
      const g = lobbies.gameOf(userId);
      if (!g) throw new UserError('Aucune partie en cours.');
      leaveVoice();
      voiceGame = g.id;
      let members = voiceMembers.get(g.id);
      if (!members) voiceMembers.set(g.id, (members = new Set()));
      const peers = [...members].filter((id) => id !== userId);
      members.add(userId);
      socket.join(voiceRoom(g.id));
      socket.to(voiceRoom(g.id)).emit('voice:peer-joined', userId);
      return { peers };
    }));
    socket.on('voice:leave', leaveVoice);
    socket.on('voice:signal', (p) => {
      if (!streamOk() || !voiceGame || typeof p?.to !== 'string' || !voiceMembers.get(voiceGame)?.has(p.to)) return;
      const size = JSON.stringify(p.data ?? '').length;
      if (size > 20_000) return;
      toUser(p.to, 'voice:signal', { from: userId, data: p.data });
    });

    socket.on('disconnect', () => {
      leaveVoice();
      const last = presence.disconnect(userId, socket.id);
      if (last) {
        lobbies.onDisconnect(userId);
        friends
          .friendIds(userId)
          .then((ids) => ids.forEach((f) => toUser(f, 'friends:changed')))
          .catch(() => {});
      }
    });
  });

  return {
    http,
    io,
    store,
    auth,
    profiles,
    friends,
    lobbies,
    close: () =>
      new Promise<void>((res) => {
        lobbies.shutdown();
        io.close();
        http.close(() => res());
        // connexions encore ouvertes (keep-alive, clients qui se reconnectent) : fermées net
        http.closeAllConnections();
        store.close().catch(() => {});
      }),
  };
}
