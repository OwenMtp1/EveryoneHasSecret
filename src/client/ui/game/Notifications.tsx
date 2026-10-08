import { useEffect, useRef, useState } from 'react';
import { formatClock } from '@shared/config';
import { useStore } from '../../store';
import { useChatFocus } from './helpers';

interface Notif {
  id: string;
  kind: 'feed' | 'chat';
  style: string;
  title?: string;
  text: string;
  at: number;
  expires: number;
}

const LIFETIME = 7000;

/**
 * Notifications de jeu (remplacent les panneaux latéraux) : ce que vous voyez, entendez,
 * les annonces et les messages du chat apparaissent quelques secondes puis s'effacent.
 * Tout reste consultable dans le Carnet (3) et le chat (Entrée).
 */
export function Notifications() {
  const game = useStore((s) => s.game);
  const chatOpen = useChatFocus((s) => s.chatOpen);
  const [items, setItems] = useState<Notif[]>([]);
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!game) return;
    const all = [
      ...game.feed.map((f) => ({ id: f.id, kind: 'feed' as const, style: f.style, text: f.text, at: f.at })),
      ...game.chat
        .filter((m) => m.fromId !== game.you)
        .map((m) => ({
          id: m.id,
          kind: 'chat' as const,
          style: m.channel === 'general' ? 'chat' : 'private',
          title: `${m.fromName.split(' ')[0]}${m.channel === 'general' ? '' : m.channel.startsWith('dm:') ? ' (privé)' : m.channel === 'dead' ? ' (morts)' : ' (alliance)'}`,
          text: m.text,
          at: m.at,
        })),
    ];
    if (!seen.current) {
      // Première vue (ou reconnexion) : on ne rejoue pas l'historique
      seen.current = new Set(all.map((x) => x.id));
      return;
    }
    const fresh = all.filter((x) => !seen.current!.has(x.id));
    if (!fresh.length) return;
    for (const f of fresh) seen.current.add(f.id);
    const now = Date.now();
    setItems((cur) => [...cur, ...fresh.map((f) => ({ ...f, expires: now + LIFETIME + (f.style === 'danger' ? 3000 : 0) }))].slice(-6));
  }, [game]);

  useEffect(() => {
    const t = setInterval(() => setItems((cur) => (cur.some((n) => n.expires < Date.now()) ? cur.filter((n) => n.expires >= Date.now()) : cur)), 500);
    return () => clearInterval(t);
  }, []);

  if (!items.length) return null;
  return (
    <div className={`notifs ${chatOpen ? 'with-chat' : ''}`}>
      {items.map((n) => (
        <div key={n.id} className={`notif notif-${n.style} ${n.expires - Date.now() < 900 ? 'leaving' : ''}`}>
          {n.title && <strong>{n.title} </strong>}
          <span className="notif-time">{formatClock(n.at)}</span> {n.text}
        </div>
      ))}
    </div>
  );
}
