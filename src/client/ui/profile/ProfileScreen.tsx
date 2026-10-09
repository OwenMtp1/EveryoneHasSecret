import { useEffect, useState } from 'react';
import { api } from '../../net/api';
import { useStore } from '../../store';
import { MenuScreen } from '../common/Screen';

export function ProfileScreen() {
  const user = useStore((s) => s.user);
  const stats = useStore((s) => s.stats);
  const logout = useStore((s) => s.logout);
  const [history, setHistory] = useState<Awaited<ReturnType<typeof api.history>>>([]);

  useEffect(() => {
    api
      .me()
      .then((m) => 'profile' in m && useStore.setState({ stats: m.profile }))
      .catch(() => {});
    api.history().then(setHistory).catch(() => {});
  }, []);

  return (
    <MenuScreen title="PROFIL" wide>
      <div className="profile-layout profile-layout-single">
        <div className="panel">
          <h3 className="profile-name">{user?.username}</h3>
          <div className="muted">@{user?.username} · membre depuis {stats ? new Date(stats.createdAt).toLocaleDateString('fr-FR') : '…'}</div>
          <div className="muted small">Votre personnage se choisit dans le salon de chaque partie, parmi 40 invités.</div>
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
            <button className="btn btn-ghost" onClick={() => logout()}>Se déconnecter</button>
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
