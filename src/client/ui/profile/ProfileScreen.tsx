import { useEffect, useState } from 'react';
import { findOutfit, findHairStyle } from '@shared/content/character';
import { api } from '../../net/api';
import { useStore } from '../../store';
import { MenuScreen } from '../common/Screen';
import { Stage3D } from '../common/Stage3D';

export function ProfileScreen() {
  const user = useStore((s) => s.user);
  const c = useStore((s) => s.character);
  const stats = useStore((s) => s.stats);
  const go = useStore((s) => s.go);
  const logout = useStore((s) => s.logout);
  const [history, setHistory] = useState<Awaited<ReturnType<typeof api.history>>>([]);

  useEffect(() => {
    api.me().then((m) => useStore.setState({ stats: m.profile })).catch(() => {});
    api.history().then(setHistory).catch(() => {});
  }, []);

  return (
    <MenuScreen title="PROFIL" wide>
      <div className="profile-layout">
        <div className="profile-figure">{c && <Stage3D actors={[{ key: 'me', character: c }]} rotatable />}</div>
        <div className="panel">
          <h3 className="profile-name">{c ? `${c.firstName} ${c.lastName}` : user?.username}</h3>
          <div className="muted">@{user?.username} · membre depuis {stats ? new Date(stats.createdAt).toLocaleDateString('fr-FR') : '…'}</div>
          {c && (
            <div className="muted small">
              {findHairStyle(c.hairStyleId).name} · {findOutfit(c.outfitId).name}
            </div>
          )}
          <div className="stats">
            <div>
              <strong>{stats?.gamesPlayed ?? 0}</strong>
              <span>Nuits jouées</span>
            </div>
            <div>
              <strong>{stats?.gamesWon ?? 0}</strong>
              <span>Victoires</span>
            </div>
          </div>
          <div className="row-actions">
            <button className="btn btn-primary" onClick={() => go('character')}>Modifier mon personnage</button>
            <button className="btn btn-ghost" onClick={logout}>Se déconnecter</button>
          </div>
          {history.length > 0 && (
            <>
              <div className="field-label">Dernières nuits à la villa</div>
              <ul className="history">
                {history.slice(0, 6).map((h, i) => (
                  <li key={i}>
                    <strong>{h.lobby_name}</strong> — {h.summary} <span className="muted small">({new Date(h.ended_at).toLocaleDateString('fr-FR')})</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </MenuScreen>
  );
}
