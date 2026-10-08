import { useEffect, useState } from 'react';
import { call } from '../../net/socket';
import { attempt, useStore } from '../../store';
import { MenuScreen } from '../common/Screen';
import { Portrait } from '../common/Avatar';

const STATUS_LABEL = { OFFLINE: 'Hors ligne', ONLINE: 'En ligne', IN_LOBBY: 'Dans un lobby', IN_GAME: 'En partie' } as const;

export function FriendsScreen() {
  const friends = useStore((s) => s.friends);
  const refresh = useStore((s) => s.refreshFriends);
  const lobby = useStore((s) => s.lobby);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<{ userId: string; username: string; alreadyLinked?: boolean }[]>([]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (q.trim().length < 2) return setResults([]);
    const t = setTimeout(async () => {
      try {
        setResults(await call('friends:search', q));
      } catch {
        /* ignoré */
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const incoming = friends.filter((f) => f.relation === 'incoming');
  const outgoing = friends.filter((f) => f.relation === 'outgoing');
  const accepted = friends.filter((f) => f.relation === 'accepted');
  const online = accepted.filter((f) => f.status !== 'OFFLINE').length;

  return (
    <MenuScreen title="AMIS" wide>
      <div className="friends-layout">
        <div className="panel">
          <div className="field-label">Rechercher un joueur</div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pseudo…" name="friendSearch" />
          <div className="search-results">
            {results.map((r) => (
              <div key={r.userId} className="row-item">
                <span>@{r.username}</span>
                <button
                  className="btn btn-primary btn-sm"
                  disabled={r.alreadyLinked}
                  onClick={async () => {
                    if (await attempt(call('friends:request', r.username).then(() => true), 'Demande envoyée.')) setResults(results.map((x) => (x.userId === r.userId ? { ...x, alreadyLinked: true } : x)));
                  }}
                >
                  {r.alreadyLinked ? 'Déjà lié' : '+ Ajouter'}
                </button>
              </div>
            ))}
          </div>
          {incoming.length > 0 && (
            <>
              <div className="field-label">Demandes reçues</div>
              {incoming.map((f) => (
                <div key={f.userId} className="row-item">
                  <Portrait character={f.character} size={36} />
                  <span className="grow">@{f.username}</span>
                  <button className="btn btn-primary btn-sm" onClick={() => attempt(call('friends:respond', { userId: f.userId, accept: true }), 'Ami ajouté.')}>Accepter</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => attempt(call('friends:respond', { userId: f.userId, accept: false }))}>Refuser</button>
                </div>
              ))}
            </>
          )}
          {outgoing.length > 0 && (
            <>
              <div className="field-label">Demandes envoyées</div>
              {outgoing.map((f) => (
                <div key={f.userId} className="row-item muted">
                  <span className="grow">@{f.username} — en attente</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => attempt(call('friends:remove', f.userId))}>Annuler</button>
                </div>
              ))}
            </>
          )}
        </div>
        <div className="panel">
          <div className="field-label">
            Mes amis — {online} en ligne / {accepted.length}
          </div>
          {accepted.length === 0 && <div className="empty">Personne pour l’instant. Les secrets se partagent mieux à plusieurs.</div>}
          {accepted.map((f) => (
            <div key={f.userId} className="row-item friend-row">
              <Portrait character={f.character} size={44} online={f.status} />
              <div className="grow">
                <div>{f.character ? `${f.character.firstName} ${f.character.lastName}` : f.username}</div>
                <div className="muted small">@{f.username} · {STATUS_LABEL[f.status]}</div>
              </div>
              {lobby && f.status !== 'OFFLINE' && f.lobbyId !== lobby.id && (
                <button className="btn btn-primary btn-sm" onClick={() => attempt(call('lobby:invite', f.userId), 'Invitation envoyée.')}>Inviter</button>
              )}
              {f.lobbyId && f.lobbyId !== lobby?.id && f.status === 'IN_LOBBY' && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={async () => {
                    const l = await attempt(call('lobby:join', { lobbyId: f.lobbyId! }));
                    if (l) useStore.setState({ lobby: l, screen: 'lobby' });
                  }}
                >
                  Rejoindre
                </button>
              )}
              <button className="btn btn-ghost btn-sm" title="Supprimer" onClick={() => confirm(`Retirer ${f.username} de vos amis ?`) && attempt(call('friends:remove', f.userId))}>✕</button>
            </div>
          ))}
        </div>
      </div>
    </MenuScreen>
  );
}
