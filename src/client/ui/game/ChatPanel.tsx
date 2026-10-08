import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { META_CONFIG, formatClock } from '@shared/config';
import type { ChatChannel } from '@shared/types';
import { call } from '../../net/socket';
import { attempt, useStore } from '../../store';
import { useChatFocus } from './helpers';

export function ChatPanel() {
  const game = useStore((s) => s.game)!;
  const channel = useChatFocus((s) => s.channel);
  const setChannel = useChatFocus((s) => s.setChannel);
  const [text, setText] = useState('');
  const logRef = useRef<HTMLDivElement>(null);

  const channels = useMemo(() => {
    const list: { id: string; label: string }[] = [{ id: 'general', label: 'Général' }];
    for (const r of game.relations)
      if (r.status === 'active' && (r.type === 'ALLY' || r.type === 'PACT')) {
        const other = r.from === game.you ? r.to : r.from;
        list.push({ id: `ally:${r.id}`, label: `${r.type === 'PACT' ? '🤝' : '🛡️'} ${game.players.find((p) => p.id === other)?.name.split(' ')[0]}` });
      }
    const dms = new Set(game.chat.filter((m) => m.channel.startsWith('dm:')).map((m) => m.channel));
    if (channel.startsWith('dm:')) dms.add(channel as ChatChannel);
    for (const d of dms) list.push({ id: d, label: `✉ ${game.players.find((p) => p.id === d.slice(3))?.name.split(' ')[0] ?? '?'}` });
    if (!game.alive) list.push({ id: 'dead', label: '👻 Morts' });
    return list;
  }, [game.relations, game.chat, game.players, game.you, game.alive, channel]);

  const messages = game.chat.filter((m) => m.channel === channel);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages.length, channel]);
  useEffect(() => {
    if (!channels.some((c) => c.id === channel)) setChannel('general');
  }, [channels, channel, setChannel]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    const ok = await attempt(call('game:chat', { channel: channel as ChatChannel, text }).then(() => true));
    if (ok) setText('');
    (document.activeElement as HTMLElement | null)?.blur();
  };

  const disabled = !game.alive && channel !== 'dead' && !game.epilogue;
  return (
    <div className="panel chat-panel">
      <div className="chat-tabs">
        {channels.map((c) => (
          <button key={c.id} className={c.id === channel ? 'active' : ''} onClick={() => setChannel(c.id)}>
            {c.label}
          </button>
        ))}
      </div>
      <div className="chat-log" ref={logRef}>
        {messages.length === 0 && <div className="muted small">{channel.startsWith('dm:') ? 'Conversation privée. Personne d’autre ne la lira… mais on peut vous voir murmurer.' : 'Aucun message.'}</div>}
        {messages.map((m) => (
          <div key={m.id} className={`chat-line ${m.fromId === game.you ? 'mine' : ''}`}>
            <span className="feed-time">{formatClock(m.at)}</span> <strong>{m.fromName.split(' ')[0]}</strong> {m.text}
          </div>
        ))}
      </div>
      <form onSubmit={send} className="chat-form">
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={META_CONFIG.chatMaxLength} placeholder={disabled ? 'Les morts ne parlent pas…' : 'Entrée pour écrire'} disabled={disabled} name="gameChat" />
      </form>
    </div>
  );
}
