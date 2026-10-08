/**
 * Présence : un utilisateur est ONLINE tant qu'au moins une socket est connectée.
 * IN_LOBBY / IN_GAME sont dérivés de l'état des lobbies (source unique de vérité).
 */
import type { PresenceStatus } from '@shared/types';

export class PresenceService {
  private sockets = new Map<string, Set<string>>();
  /** Résolveur fourni par le LobbyManager. */
  resolveActivity: (userId: string) => 'IN_LOBBY' | 'IN_GAME' | null = () => null;

  /** @returns true si c'est la première connexion de l'utilisateur */
  connect(userId: string, socketId: string): boolean {
    let set = this.sockets.get(userId);
    const first = !set || set.size === 0;
    if (!set) this.sockets.set(userId, (set = new Set()));
    set.add(socketId);
    return first;
  }

  /** @returns true si l'utilisateur n'a plus aucune socket */
  disconnect(userId: string, socketId: string): boolean {
    const set = this.sockets.get(userId);
    if (!set) return true;
    set.delete(socketId);
    if (set.size === 0) {
      this.sockets.delete(userId);
      return true;
    }
    return false;
  }

  isOnline(userId: string) {
    return (this.sockets.get(userId)?.size ?? 0) > 0;
  }

  status(userId: string): PresenceStatus {
    if (!this.isOnline(userId)) return 'OFFLINE';
    return this.resolveActivity(userId) ?? 'ONLINE';
  }
}
