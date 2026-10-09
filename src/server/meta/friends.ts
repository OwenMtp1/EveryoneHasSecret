/**
 * Système d'amis : recherche, demandes, acceptation/refus, suppression, statuts.
 */
import type { FriendEntry } from '@shared/types';
import type { MetaStore } from './store';
import type { AuthService } from './auth';
import type { PresenceService } from './presence';
import type { NotificationService } from './notifications';
import { UserError } from '../util';

const pair = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);

export class FriendService {
  /** appelé quand la liste d'amis d'un utilisateur change */
  onChanged: (userId: string) => void = () => {};
  lobbyOf: (userId: string) => string | null = () => null;

  constructor(
    private store: MetaStore,
    private auth: AuthService,
    private presence: PresenceService,
    private notifications: NotificationService,
  ) {}

  private row(a: string, b: string) {
    const [x, y] = pair(a, b);
    return this.store.getFriendship(x, y);
  }

  async list(userId: string): Promise<FriendEntry[]> {
    const rows = await this.store.listFriendships(userId);
    const users = await this.store.getUsers(rows.map((r) => (r.userA === userId ? r.userB : r.userA)));
    const out: FriendEntry[] = [];
    for (const r of rows) {
      const other = r.userA === userId ? r.userB : r.userA;
      const u = users.get(other);
      if (!u) continue;
      const relation = r.status === 'accepted' ? 'accepted' : r.requestedBy === userId ? 'outgoing' : 'incoming';
      out.push({
        userId: other,
        username: u.username,
        character: null,
        status: relation === 'accepted' ? this.presence.status(other) : 'OFFLINE',
        relation,
        lobbyId: relation === 'accepted' ? this.lobbyOf(other) : null,
      });
    }
    const order = { IN_GAME: 0, IN_LOBBY: 1, ONLINE: 2, OFFLINE: 3 } as const;
    return out.sort((a, b) => order[a.status] - order[b.status] || a.username.localeCompare(b.username));
  }

  async friendIds(userId: string): Promise<string[]> {
    return (await this.store.listFriendships(userId)).filter((r) => r.status === 'accepted').map((r) => (r.userA === userId ? r.userB : r.userA));
  }

  async areFriends(a: string, b: string) {
    return (await this.row(a, b))?.status === 'accepted';
  }

  async request(fromId: string, username: string) {
    const target = await this.auth.findByUsername(username);
    if (!target) throw new UserError('Joueur introuvable.');
    if (target.id === fromId) throw new UserError('Vous ne pouvez pas vous ajouter vous-même.');
    const existing = await this.row(fromId, target.id);
    if (existing?.status === 'accepted') throw new UserError('Vous êtes déjà amis.');
    if (existing?.status === 'pending') {
      if (existing.requestedBy === fromId) throw new UserError('Demande déjà envoyée.');
      return this.respond(fromId, target.id, true); // demande croisée = acceptation
    }
    const [a, b] = pair(fromId, target.id);
    try {
      await this.store.insertFriendship(a, b, fromId, Date.now());
    } catch {
      throw new UserError('Demande déjà envoyée.'); // course entre deux demandes simultanées
    }
    const from = await this.auth.getUser(fromId);
    this.notifications.notify(target.id, 'FRIEND_REQUEST', 'Demande d’ami', `${from?.username ?? 'Quelqu’un'} veut devenir votre ami.`, { userId: fromId });
    this.onChanged(fromId);
    this.onChanged(target.id);
  }

  async respond(userId: string, otherId: string, accept: boolean) {
    const r = await this.row(userId, otherId);
    if (!r || r.status !== 'pending' || r.requestedBy === userId) throw new UserError('Aucune demande en attente.');
    const [a, b] = pair(userId, otherId);
    if (accept) {
      await this.store.acceptFriendship(a, b);
      const me = await this.auth.getUser(userId);
      this.notifications.notify(otherId, 'FRIEND_ACCEPTED', 'Demande acceptée', `${me?.username ?? 'Quelqu’un'} a accepté votre demande d’ami.`, { userId });
    } else {
      await this.store.deleteFriendship(a, b);
    }
    this.onChanged(userId);
    this.onChanged(otherId);
  }

  async remove(userId: string, otherId: string) {
    const [a, b] = pair(userId, otherId);
    await this.store.deleteFriendship(a, b);
    this.onChanged(userId);
    this.onChanged(otherId);
  }
}
