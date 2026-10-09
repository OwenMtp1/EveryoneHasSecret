/**
 * Notifications globales : poussées en temps réel et persistées (sauf éphémères).
 */
import type { AppNotification, NotificationType } from '@shared/types';
import type { MetaStore } from './store';
import { newId } from '../util';

export class NotificationService {
  constructor(
    private store: MetaStore,
    private push: (userId: string, n: AppNotification) => void,
  ) {}

  /** Pousse immédiatement ; la persistance se fait en arrière-plan (une panne de base n'empêche pas l'envoi). */
  notify(
    userId: string,
    type: NotificationType,
    title: string,
    body: string,
    payload?: Record<string, unknown>,
    opts: { ephemeral?: boolean } = {},
  ): AppNotification {
    const n: AppNotification = { id: newId(), type, title, body, payload, read: false, createdAt: Date.now() };
    if (!opts.ephemeral) this.store.insertNotification(userId, n).catch((e) => console.error('notification non persistée', e));
    this.push(userId, n);
    return n;
  }

  list(userId: string, limit = 40): Promise<AppNotification[]> {
    return this.store.listNotifications(userId, limit);
  }

  async get(userId: string, id: string): Promise<AppNotification | null> {
    return (await this.list(userId, 200)).find((n) => n.id === id) ?? null;
  }

  markRead(userId: string, ids: string[]) {
    return this.store.markRead(userId, ids.slice(0, 200));
  }
}
