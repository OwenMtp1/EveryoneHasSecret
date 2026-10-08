import { useStore, type Screen } from '../../store';
import { Logo } from '../common/Logo';
import { Portrait } from '../common/Avatar';
import { audio } from '../../audio';
import { GAME_VERSION } from '@shared/config';

const ITEMS: { id: Screen; label: string }[] = [
  { id: 'play', label: 'JOUER' },
  { id: 'servers', label: 'SERVEURS' },
  { id: 'friends', label: 'AMIS' },
  { id: 'profile', label: 'PROFIL' },
  { id: 'settings', label: 'PARAMÈTRES' },
];

export function MainMenu() {
  const go = useStore((s) => s.go);
  const user = useStore((s) => s.user);
  const character = useStore((s) => s.character);
  const connected = useStore((s) => s.connected);
  const lobby = useStore((s) => s.lobby);
  const pending = useStore((s) => s.friends.filter((f) => f.relation === 'incoming').length);

  return (
    <div className="main-menu fade-in" onPointerDown={() => audio.unlock()}>
      <div className="main-menu-left">
        <Logo />
        <nav className="menu-list">
          {lobby && (
            <button className="menu-item menu-item-accent" onClick={() => go('lobby')}>
              <span className="menu-arrow">▶</span> RETOURNER AU LOBBY
            </button>
          )}
          {ITEMS.map((it, i) => (
            <button key={it.id} className={`menu-item ${i === 0 ? 'menu-item-play' : ''}`} onClick={() => go(it.id)} style={{ animationDelay: `${0.15 + i * 0.07}s` }}>
              <span className="menu-arrow">▶</span> {it.label}
              {it.id === 'friends' && pending > 0 && <span className="badge">{pending}</span>}
            </button>
          ))}
        </nav>
      </div>
      <button className="player-chip" onClick={() => go('profile')}>
        <Portrait character={character} size={52} />
        <div>
          <div className="player-chip-name">{character ? `${character.firstName} ${character.lastName}` : user?.username}</div>
          <div className="player-chip-status">
            <span className={`dot ${connected ? 'dot-online' : 'dot-offline'}`} /> {connected ? 'En ligne' : 'Connexion…'} · @{user?.username}
          </div>
        </div>
      </button>
      <div className="version">{GAME_VERSION}</div>
    </div>
  );
}
