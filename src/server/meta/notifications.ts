/**
 * Notifications globales : persistées (sauf éphémères) et poussées en temps réel.
 */
import type { AppNotification, NotificationType } from '@shared/types';
import type { DB } from './db';
import { newId } from '../util';

interface NotificationRow {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  payload: string | null;
  read: number;
  created_at: number;
}

export class NotificationService {
  constructor(
    private db: DB,
    private push: (userId: string, n: AppNotification) => void,
  ) {}

  notify(
    userId: string,
    type: NotificationType,
    title: string,
    body: string,
    payload?: Record<string, unknown>,
    opts: { ephemeral?: boolean } = {},
  ): AppNotification {
    const n: AppNotification = { id: newId(), type, title, body, payload, read: false, createdAt: Date.now() };
    if (!opts.ephemeral) {
      this.db
        .prepare('INSERT INTO notifications (id, user_id, type, title, body, payload, read, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)')
        .run(n.id, userId, type, title, body, payload ? JSON.stringify(payload) : null, n.createdAt);
    }
    this.push(userId, n);
    return n;
  }

  list(userId: string, limit = 40): AppNotification[] {
    const rows = this.db
      .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?')
      .all(userId, limit) as unknown as NotificationRow[];
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      body: r.body,
      payload: r.payload ? JSON.parse(r.payload) : undefined,
      read: !!r.read,
      createdAt: r.created_at,
    }));
  }

  get(userId: string, id: string): AppNotification | null {
    return this.list(userId, 200).find((n) => n.id === id) ?? null;
  }

  markRead(userId: string, ids: string[]) {
    const stmt = this.db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ? AND id = ?');
    for (const id of ids.slice(0, 200)) stmt.run(userId, id);
  }
}
