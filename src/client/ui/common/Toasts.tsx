import { useEffect } from 'react';
import { useStore } from '../../store';
import { call } from '../../net/socket';

/** Notifications animées globales (amis, invitations…). */
export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);

  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      for (const x of useStore.getState().toasts) if (x.expiresAt < now) dismiss(x.id);
    }, 500);
    return () => clearInterval(t);
  }, [dismiss]);

  const respondInvite = async (id: string, accept: boolean) => {
    dismiss(id);
    try {
      const lobby = await call('invite:respond', { notificationId: id, accept });
      if (lobby) useStore.setState({ lobby, screen: 'lobby' });
    } catch (e) {
      useStore.getState().flash((e as Error).message, true);
    }
  };

  const respondFriend = async (id: string, userId: string, accept: boolean) => {
    dismiss(id);
    try {
      await call('friends:respond', { userId, accept });
    } catch (e) {
      useStore.getState().flash((e as Error).message, true);
    }
  };

  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type.toLowerCase()}`}>
          <div className="toast-title">{t.title}</div>
          <div className="toast-body">{t.body}</div>
          {t.type === 'GAME_INVITE' && (
            <div className="toast-actions">
              <button className="btn btn-primary btn-sm" onClick={() => respondInvite(t.id, true)}>ACCEPT</button>
              <button className="btn btn-ghost btn-sm" onClick={() => respondInvite(t.id, false)}>DECLINE</button>
            </div>
          )}
          {t.type === 'FRIEND_REQUEST' && typeof t.payload?.userId === 'string' && (
            <div className="toast-actions">
              <button className="btn btn-primary btn-sm" onClick={() => respondFriend(t.id, t.payload!.userId as string, true)}>Accepter</button>
              <button className="btn btn-ghost btn-sm" onClick={() => respondFriend(t.id, t.payload!.userId as string, false)}>Refuser</button>
            </div>
          )}
          <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="Fermer">×</button>
        </div>
      ))}
    </div>
  );
}

/** Message de retour d'action (succès/erreur), discret et éphémère. */
export function ActionFlash() {
  const msg = useStore((s) => s.actionMessage);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => {
      if (useStore.getState().actionMessage === msg) useStore.setState({ actionMessage: null });
    }, msg.error ? 4000 : 3200);
    return () => clearTimeout(t);
  }, [msg]);
  if (!msg) return null;
  return (
    <div key={msg.at} className={`action-flash ${msg.error ? 'error' : ''}`}>
      {msg.text}
    </div>
  );
}
