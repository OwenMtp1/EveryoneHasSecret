/**
 * Système d'amis : recherche, demandes, acceptation/refus, suppression, statuts.
 */
import type { FriendEntry } from '@shared/types';
import type { DB } from './db';
import type { AuthService } from './auth';
import type { ProfileService } from './profiles';
import type { PresenceService } from './presence';
import type { NotificationService } from './notifications';
import { UserError } from '../util';

interface FriendRow {
  user_a: string;
  user_b: string;
  status: 'pending' | 'accepted';
  requested_by: string;
}

const pair = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);

export class FriendService {
  /** appelé quand la liste d'amis d'un utilisateur change */
  onChanged: (userId: string) => void = () => {};
  lobbyOf: (userId: string) => string | null = () => null;

  constructor(
    private db: DB,
    private auth: AuthService,
    private profiles: ProfileService,
    private presence: PresenceService,
    private notifications: NotificationService,
  ) {}

  private row(a: string, b: string): FriendRow | undefined {
    const [x, y] = pair(a, b);
    return this.db.prepare('SELECT * FROM friendships WHERE user_a = ? AND user_b = ?').get(x, y) as FriendRow | undefined;
  }

  list(userId: string): FriendEntry[] {
    const rows = this.db.prepare('SELECT * FROM friendships WHERE user_a = ? OR user_b = ?').all(userId, userId) as unknown as FriendRow[];
    const out: FriendEntry[] = [];
    for (const r of rows) {
      const other = r.user_a === userId ? r.user_b : r.user_a;
      const u = this.auth.getUser(other);
      if (!u) continue;
      const relation = r.status === 'accepted' ? 'accepted' : r.requested_by === userId ? 'outgoing' : 'incoming';
      out.push({
        userId: other,
        username: u.username,
        character: this.profiles.getCharacter(other),
        status: relation === 'accepted' ? this.presence.status(other) : 'OFFLINE',
        relation,
        lobbyId: relation === 'accepted' ? this.lobbyOf(other) : null,
      });
    }
    const order = { IN_GAME: 0, IN_LOBBY: 1, ONLINE: 2, OFFLINE: 3 } as const;
    return out.sort((a, b) => order[a.status] - order[b.status] || a.username.localeCompare(b.username));
  }

  friendIds(userId: string): string[] {
    const rows = this.db
      .prepare("SELECT user_a, user_b FROM friendships WHERE status = 'accepted' AND (user_a = ? OR user_b = ?)")
      .all(userId, userId) as unknown as FriendRow[];
    return rows.map((r) => (r.user_a === userId ? r.user_b : r.user_a));
  }

  areFriends(a: string, b: string) {
    return this.row(a, b)?.status === 'accepted';
  }

  request(fromId: string, username: string) {
    const target = this.auth.findByUsername(username);
    if (!target) throw new UserError('Joueur introuvable.');
    if (target.id === fromId) throw new UserError('Vous ne pouvez pas vous ajouter vous-même.');
    const existing = this.row(fromId, target.id);
    if (existing?.status === 'accepted') throw new UserError('Vous êtes déjà amis.');
    if (existing?.status === 'pending') {
      if (existing.requested_by === fromId) throw new UserError('Demande déjà envoyée.');
      return this.respond(fromId, target.id, true); // demande croisée = acceptation
    }
    const [a, b] = pair(fromId, target.id);
    this.db
      .prepare("INSERT INTO friendships (user_a, user_b, status, requested_by, created_at) VALUES (?, ?, 'pending', ?, ?)")
      .run(a, b, fromId, Date.now());
    const from = this.auth.getUser(fromId)!;
    this.notifications.notify(target.id, 'FRIEND_REQUEST', 'Demande d’ami', `${from.username} veut devenir votre ami.`, { userId: fromId });
    this.onChanged(fromId);
    this.onChanged(target.id);
  }

  respond(userId: string, otherId: string, accept: boolean) {
    const r = this.row(userId, otherId);
    if (!r || r.status !== 'pending' || r.requested_by === userId) throw new UserError('Aucune demande en attente.');
    const [a, b] = pair(userId, otherId);
    if (accept) {
      this.db.prepare("UPDATE friendships SET status = 'accepted' WHERE user_a = ? AND user_b = ?").run(a, b);
      const me = this.auth.getUser(userId)!;
      this.notifications.notify(otherId, 'FRIEND_ACCEPTED', 'Demande acceptée', `${me.username} a accepté votre demande d’ami.`, { userId });
    } else {
      this.db.prepare('DELETE FROM friendships WHERE user_a = ? AND user_b = ?').run(a, b);
    }
    this.onChanged(userId);
    this.onChanged(otherId);
  }

  remove(userId: string, otherId: string) {
    const [a, b] = pair(userId, otherId);
    this.db.prepare('DELETE FROM friendships WHERE user_a = ? AND user_b = ?').run(a, b);
    this.onChanged(userId);
    this.onChanged(otherId);
  }
}
