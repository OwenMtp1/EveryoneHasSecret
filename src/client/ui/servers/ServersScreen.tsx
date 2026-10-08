import { useCallback, useEffect, useState } from 'react';
import type { ServerFilters, ServerListEntry } from '@shared/types';
import { call } from '../../net/socket';
import { attempt, useStore } from '../../store';
import { MenuScreen } from '../common/Screen';

const STATUS: Record<string, string> = { WAITING: '🟢 EN ATTENTE', STARTING: '🟠 LANCEMENT', IN_GAME: '🔴 EN COURS' };

export function ServersScreen() {
  const [list, setList] = useState<ServerListEntry[] | null>(null);
  const [filters, setFilters] = useState<ServerFilters>({ availability: 'all', minPlayers: 0, withFriends: false });
  const go = useStore((s) => s.go);
  const connected = useStore((s) => s.connected);

  const refresh = useCallback(async () => {
    const r = await attempt(call('servers:list', filters));
    if (r) setList(r);
  }, [filters]);

  useEffect(() => {
    if (!connected) return;
    refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [refresh, connected]);

  const join = async (lobbyId: string) => {
    const lobby = await attempt(call('lobby:join', { lobbyId }));
    if (lobby) useStore.setState({ lobby, screen: 'lobby' });
  };

  return (
    <MenuScreen title="SERVERS" back="menu" wide>
      <div className="filters">
        <div className="seg">
          <button className={filters.availability === 'all' ? 'active' : ''} onClick={() => setFilters({ ...filters, availability: 'all' })}>Toutes</button>
          <button className={filters.availability === 'available' ? 'active' : ''} onClick={() => setFilters({ ...filters, availability: 'available' })}>Disponibles</button>
        </div>
        <label className="inline">
          Joueurs min.
          <select value={filters.minPlayers} onChange={(e) => setFilters({ ...filters, minPlayers: Number(e.target.value) })}>
            {[0, 1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>{n === 0 ? 'Tous' : `${n}+`}</option>
            ))}
          </select>
        </label>
        <label className="inline check">
          <input type="checkbox" checked={!!filters.withFriends} onChange={(e) => setFilters({ ...filters, withFriends: e.target.checked })} />
          Avec des amis
        </label>
        <div className="spacer" />
        <button className="btn btn-ghost" onClick={refresh}>↻ Actualiser</button>
        <button className="btn btn-primary" onClick={() => go('create')}>+ CRÉER UNE PARTIE</button>
      </div>
      <div className="server-list">
        {list === null && <div className="empty">Recherche des villas…</div>}
        {list?.length === 0 && (
          <div className="empty">
            Aucune partie publique pour l’instant.
            <br />
            <button className="btn btn-primary" onClick={() => go('create')}>Ouvrir la vôtre</button>
          </div>
        )}
        {list?.map((s) => (
          <div key={s.id} className="server-row">
            <div className="server-name">{s.name.toUpperCase()}</div>
            <div className="server-host">{s.hostName}</div>
            <div className="server-count">
              {s.playerCount} / {s.maxPlayers} joueurs
              {s.friendsInside > 0 && <span className="friend-tag"> · {s.friendsInside} ami{s.friendsInside > 1 ? 's' : ''}</span>}
            </div>
            <div className="server-status">{STATUS[s.status]}</div>
            <button className="btn btn-primary btn-sm" disabled={s.status !== 'WAITING' || s.playerCount >= s.maxPlayers} onClick={() => join(s.id)}>
              REJOINDRE
            </button>
          </div>
        ))}
      </div>
    </MenuScreen>
  );
}
