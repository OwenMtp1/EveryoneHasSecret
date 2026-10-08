import { useEffect, useRef, useState, type FormEvent } from 'react';
import { META_CONFIG } from '@shared/config';
import { call } from '../../net/socket';
import { attempt, useStore } from '../../store';
import { Portrait } from '../common/Avatar';
import { Stage3D } from '../common/Stage3D';

export function LobbyScreen() {
  const lobby = useStore((s) => s.lobby);
  const user = useStore((s) => s.user);
  const friends = useStore((s) => s.friends);
  const inGame = useStore((s) => s.inGame);
  const go = useStore((s) => s.go);
  const [msg, setMsg] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight });
  }, [lobby?.chat.length]);

  if (!lobby || !user) return null;
  const me = lobby.players.find((p) => p.userId === user.id);
  const isHost = lobby.hostId === user.id;
  const ready = lobby.players.filter((p) => p.ready || p.isHost).length;

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!msg.trim()) return;
    const ok = await attempt(call('lobby:chat', msg));
    if (ok !== undefined) setMsg('');
  };
  const leave = async () => {
    await attempt(call('lobby:leave'));
    useStore.setState({ lobby: null });
    go('menu');
  };

  const slots = Array.from({ length: lobby.maxPlayers }, (_, i) => lobby.players[i]);
  const invitable = friends.filter((f) => f.relation === 'accepted' && f.status !== 'OFFLINE' && !lobby.players.some((p) => p.userId === f.userId));

  return (
    <div className="lobby fade-in">
      <header className="lobby-head">
        <div>
          <div className="lobby-kicker">{lobby.visibility === 'PRIVATE' ? 'PARTIE PRIVÉE' : 'PARTIE PUBLIQUE'}</div>
          <h2 className="screen-title">{lobby.name.toUpperCase()}</h2>
        </div>
        <div className="lobby-code" title="Code à partager">
          CODE <strong>{lobby.code}</strong>
          <button className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard?.writeText(lobby.code).then(() => useStore.getState().flash('Code copié.'))}>Copier</button>
        </div>
      </header>

      <div className="lobby-stage">
        <Stage3D
          actors={lobby.players
            .filter((p) => p.character)
            .map((p) => ({
              key: p.userId,
              character: p.character!,
              label: `${p.isHost ? '♛ ' : ''}${p.character!.firstName}${p.isHost || p.ready ? ' ✓' : ''}`,
              highlight: p.isHost || p.ready,
            }))}
        />
      </div>
      <div className="lobby-roster">
        {slots.map((p, i) =>
          p ? (
            <div key={p.userId} className={`roster-item ${p.ready || p.isHost ? 'is-ready' : ''} ${!p.connected ? 'is-away' : ''}`}>
              <Portrait character={p.character} size={34} />
              <span className="grow">
                {p.character ? `${p.character.firstName} ${p.character.lastName}` : p.username}
              </span>
              <span className={`lobby-ready ${p.ready || p.isHost ? 'ok' : ''}`}>{p.isHost ? 'HÔTE' : p.ready ? 'READY ✓' : 'NOT READY'}</span>
              {isHost && !p.isHost && lobby.status === 'WAITING' && (
                <button className="kick" title="Expulser" onClick={() => confirm(`Expulser ${p.username} ?`) && attempt(call('lobby:kick', p.userId))}>✕</button>
              )}
            </div>
          ) : (
            <div key={`empty-${i}`} className="roster-item empty">Place libre</div>
          ),
        )}
      </div>

      <div className="lobby-bottom">
        <div className="panel lobby-chat">
          <div className="lobby-chat-log" ref={chatRef}>
            {lobby.chat.map((m) => (
              <div key={m.id} className={m.userId ? 'chat-line' : 'chat-line system'}>
                {m.userId && <strong>{m.name} : </strong>}
                {m.text}
              </div>
            ))}
          </div>
          <form onSubmit={send} className="chat-form">
            <input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Message…" maxLength={META_CONFIG.chatMaxLength} name="lobbyChat" />
          </form>
        </div>
        <div className="panel lobby-actions">
          <div className="muted">
            {lobby.players.length} / {lobby.maxPlayers} joueurs · {ready} prêts · minimum {lobby.minPlayers} · nuit {lobby.duration === 'short' ? 'courte' : 'normale'}
          </div>
          {inGame && (
            <button className="btn btn-primary btn-lg" onClick={() => go('game')}>REVENIR À LA PARTIE</button>
          )}
          {!isHost && me && lobby.status === 'WAITING' && (
            <button className={`btn btn-lg ${me.ready ? 'btn-ghost' : 'btn-primary'}`} onClick={() => attempt(call('lobby:ready', !me.ready))}>
              {me.ready ? 'PAS ENCORE' : "I'M READY"}
            </button>
          )}
          {isHost && (
            <button className="btn btn-primary btn-lg" disabled={!lobby.canStart} onClick={() => attempt(call('lobby:start'))} title={lobby.canStart ? '' : 'Tous les joueurs doivent être prêts'}>
              {lobby.status === 'STARTING' ? 'LANCEMENT…' : 'LANCER LA PARTIE'}
            </button>
          )}
          <div className="row-actions">
            <button className="btn btn-ghost btn-sm" onClick={() => setShowInvite(!showInvite)}>INVITE FRIENDS</button>
            {isHost && <button className="btn btn-ghost btn-sm" onClick={() => setShowSettings(!showSettings)}>Paramètres</button>}
            {isHost && <button className="btn btn-ghost btn-sm danger" onClick={() => confirm('Fermer la partie pour tout le monde ?') && attempt(call('lobby:close'))}>Fermer</button>}
            <button className="btn btn-ghost btn-sm" onClick={leave}>Quitter</button>
          </div>
          {showInvite && (
            <div className="invite-list">
              {invitable.length === 0 && <div className="muted small">Aucun ami en ligne disponible.</div>}
              {invitable.map((f) => (
                <div key={f.userId} className="row-item">
                  <Portrait character={f.character} size={30} online={f.status} />
                  <span className="grow">{f.username}</span>
                  <button className="btn btn-primary btn-sm" onClick={() => attempt(call('lobby:invite', f.userId), `Invitation envoyée à ${f.username}.`)}>Inviter</button>
                </div>
              ))}
            </div>
          )}
          {showSettings && isHost && <LobbySettings />}
        </div>
      </div>
    </div>
  );
}

function LobbySettings() {
  const lobby = useStore((s) => s.lobby)!;
  const [name, setName] = useState(lobby.name);
  return (
    <div className="lobby-settings">
      <input value={name} onChange={(e) => setName(e.target.value)} maxLength={META_CONFIG.lobbyName.max} name="lobbyName" />
      <div className="seg seg-wrap">
        {META_CONFIG.maxPlayersOptions.map((n) => (
          <button key={n} className={lobby.maxPlayers === n ? 'active' : ''} onClick={() => attempt(call('lobby:settings', { maxPlayers: n }))}>{n}</button>
        ))}
      </div>
      <div className="seg">
        {(['short', 'normal'] as const).map((d) => (
          <button key={d} className={lobby.duration === d ? 'active' : ''} onClick={() => attempt(call('lobby:settings', { duration: d }))}>{d === 'short' ? 'Nuit courte' : 'Nuit normale'}</button>
        ))}
      </div>
      <div className="seg">
        {(['PUBLIC', 'PRIVATE'] as const).map((v) => (
          <button key={v} className={lobby.visibility === v ? 'active' : ''} onClick={() => attempt(call('lobby:settings', { visibility: v }))}>{v}</button>
        ))}
      </div>
      <button className="btn btn-primary btn-sm" onClick={() => attempt(call('lobby:settings', { name }), 'Paramètres enregistrés.')}>Renommer</button>
    </div>
  );
}
