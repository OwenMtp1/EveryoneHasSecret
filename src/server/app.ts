/**
 * Assemblage du serveur : HTTP (auth, personnage, profil) + Socket.IO (temps réel).
 */
import express from 'express';
import { createServer, type Server as HttpServer } from 'node:http';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents, AckResult } from '@shared/protocol';
import { GAME_NAME, GAME_VERSION } from '@shared/config';
import { openDatabase, type DB } from './meta/db';
import { AuthService } from './meta/auth';
import { ProfileService } from './meta/profiles';
import { PresenceService } from './meta/presence';
import { NotificationService } from './meta/notifications';
import { FriendService } from './meta/friends';
import { LobbyManager } from './meta/lobbies';
import { UserError } from './util';

export interface AppContext {
  http: HttpServer;
  io: Server<ClientToServerEvents, ServerToClientEvents>;
  db: DB;
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

export function createApp(opts: { dbPath?: string } = {}): AppContext {
  const db = openDatabase(opts.dbPath);
  const auth = new AuthService(db);
  const profiles = new ProfileService(db);
  const presence = new PresenceService();

  const app = express();
  app.use(express.json({ limit: '32kb' }));
  const http = createServer(app);
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(http, { cors: { origin: true } });

  const toUser = (userId: string, event: string, payload?: unknown) => {
    (io.to(`user:${userId}`) as unknown as { emit: (e: string, p?: unknown) => void }).emit(event, payload);
  };
  const notifications = new NotificationService(db, (userId, n) => toUser(userId, 'notification', n));
  const friends = new FriendService(db, auth, profiles, presence, notifications);
  friends.onChanged = (userId) => toUser(userId, 'friends:changed');
  const lobbies = new LobbyManager(db, auth, profiles, friends, notifications, presence, { toUser });

  // ───────────── HTTP ─────────────
  const bearer = (req: express.Request) => (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  const requireUser = (req: express.Request) => {
    const u = auth.resolveToken(bearer(req));
    if (!u) throw new UserError('Session expirée. Reconnectez-vous.');
    return u;
  };
  const route =
    (fn: (req: express.Request) => unknown) =>
    (req: express.Request, res: express.Response) => {
      try {
        res.json(fn(req));
      } catch (e) {
        const msg = errorMessage(e);
        res.status(e instanceof UserError ? (msg.startsWith('Session') ? 401 : 400) : 500).json({ error: msg });
      }
    };

  app.get('/api/health', route(() => ({ ok: true, name: GAME_NAME, version: GAME_VERSION })));
  app.post('/api/auth/register', route((req) => {
    const r = auth.register(req.body?.username, req.body?.password);
    return { token: r.token, user: { id: r.user.id, username: r.user.username } };
  }));
  app.post('/api/auth/login', route((req) => {
    const r = auth.login(req.body?.username, req.body?.password);
    return { token: r.token, user: { id: r.user.id, username: r.user.username } };
  }));
  app.post('/api/auth/logout', route((req) => {
    auth.logout(bearer(req));
    return { ok: true };
  }));
  app.get('/api/me', route((req) => {
    const u = requireUser(req);
    return {
      user: { id: u.id, username: u.username },
      character: profiles.getCharacter(u.id),
      profile: { ...profiles.getStats(u.id), createdAt: u.created_at },
    };
  }));
  app.put('/api/character', route((req) => {
    const u = requireUser(req);
    if (lobbies.gameOf(u.id)) throw new UserError('Impossible de changer d’apparence pendant une partie.');
    return { character: profiles.saveCharacter(u.id, req.body) };
  }));
  app.get('/api/profile/:id', route((req) => {
    requireUser(req);
    const u = auth.getUser(String(req.params.id));
    if (!u) throw new UserError('Profil introuvable.');
    return { userId: u.id, username: u.username, createdAt: u.created_at, ...profiles.getStats(u.id), character: profiles.getCharacter(u.id) };
  }));
  app.get('/api/history', route((req) => {
    requireUser(req);
    return db.prepare('SELECT lobby_name, case_type, summary, players, ended_at FROM game_history ORDER BY ended_at DESC LIMIT 20').all();
  }));

  const clientDir = resolve('dist/client');
  if (existsSync(clientDir)) {
    app.use(express.static(clientDir));
    app.get(/^\/(?!api|socket\.io).*/, (_req, res) => res.sendFile(resolve(clientDir, 'index.html')));
  }

  // ───────────── Socket.IO ─────────────
  io.use((socket, next) => {
    const u = auth.resolveToken(socket.handshake.auth?.token);
    if (!u) return next(new Error('unauthorized'));
    socket.data.userId = u.id;
    socket.data.username = u.username;
    next();
  });

  io.on('connection', (socket) => {
    const userId: string = socket.data.userId;
    socket.join(`user:${userId}`);
    const first = presence.connect(userId, socket.id);
    lobbies.onConnect(userId);
    socket.emit('session:state', lobbies.sessionState(userId));
    if (first) {
      for (const f of friends.friendIds(userId)) {
        toUser(f, 'friends:changed');
        if (presence.isOnline(f))
          notifications.notify(f, 'FRIEND_ONLINE', 'Ami connecté', `${socket.data.username} est en ligne.`, { userId }, { ephemeral: true });
      }
    }

    /** Enveloppe : exécute, capture les erreurs utilisateur, répond via ack. */
    const handle =
      <A extends unknown[], R>(fn: (...args: A) => R) =>
      (...args: [...A, (r: AckResult<R>) => void]) => {
        const ack = args[args.length - 1];
        const params = args.slice(0, -1) as A;
        if (typeof ack !== 'function') return;
        try {
          const data = fn(...params);
          ack({ ok: true, data });
        } catch (e) {
          ack({ ok: false, error: errorMessage(e) });
        }
      };

    let lastChat = 0;
    const throttleChat = () => {
      const now = Date.now();
      if (now - lastChat < 300) throw new UserError('Doucement…');
      lastChat = now;
    };

    socket.on('friends:list', handle(() => friends.list(userId)));
    socket.on('friends:search', handle((q: string) => {
      const ids = new Set(friends.list(userId).map((f) => f.userId));
      return auth.search(String(q ?? ''), userId).map((u) => ({ userId: u.id, username: u.username, alreadyLinked: ids.has(u.id) }));
    }));
    socket.on('friends:request', handle((username: string) => {
      friends.request(userId, String(username ?? ''));
      return null;
    }));
    socket.on('friends:respond', handle((p: { userId: string; accept: boolean }) => {
      friends.respond(userId, String(p?.userId), !!p?.accept);
      return null;
    }));
    socket.on('friends:remove', handle((other: string) => {
      friends.remove(userId, String(other));
      return null;
    }));
    socket.on('notifications:list', handle(() => notifications.list(userId)));
    socket.on('notifications:read', handle((ids: string[]) => {
      notifications.markRead(userId, Array.isArray(ids) ? ids.map(String) : []);
      return null;
    }));
    socket.on('invite:respond', handle((p: { notificationId: string; accept: boolean }) => lobbies.respondInvite(userId, String(p?.notificationId), !!p?.accept)));

    socket.on('servers:list', handle((f) => lobbies.list(userId, f ?? {})));
    socket.on('lobby:create', handle((p) => lobbies.create(userId, p)));
    socket.on('lobby:join', handle((p) => lobbies.join(userId, p ?? {})));
    socket.on('lobby:addBot', handle(() => {
      lobbies.addBot(userId);
      return null;
    }));
    socket.on('lobby:quickplay', handle((p) => lobbies.quickPlay(userId, Math.max(1, Math.min(5, Number(p?.bots ?? 4) || 4)))));
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
    socket.on('lobby:invite', handle((t: string) => {
      lobbies.invite(userId, String(t));
      return null;
    }));
    socket.on('lobby:chat', handle((text: string) => {
      throttleChat();
      lobbies.chat(userId, text);
      return null;
    }));

    socket.on('game:input', (p) => {
      lobbies.gameOf(userId)?.setInput(userId, Number(p?.dx), Number(p?.dy));
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

    socket.on('disconnect', () => {
      const last = presence.disconnect(userId, socket.id);
      if (last) {
        lobbies.onDisconnect(userId);
        for (const f of friends.friendIds(userId)) toUser(f, 'friends:changed');
      }
    });
  });

  return {
    http,
    io,
    db,
    auth,
    profiles,
    friends,
    lobbies,
    close: () =>
      new Promise<void>((res) => {
        lobbies.shutdown();
        io.close();
        http.close(() => res());
        try {
          db.close();
        } catch {
          /* déjà fermée */
        }
      }),
  };
}
