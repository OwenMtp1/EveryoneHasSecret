import { attempt, useStore } from '../../store';
import { call } from '../../net/socket';
import { MenuScreen } from '../common/Screen';

export function PlayScreen() {
  const go = useStore((s) => s.go);
  return (
    <MenuScreen title="JOUER">
      <div className="play-cards">
        <button
          className="play-card play-card-hero"
          onClick={async () => {
            const lobby = await attempt(call('lobby:quickplay', { bots: 4 }));
            if (lobby) useStore.setState({ lobby, screen: 'lobby' });
          }}
        >
          <span className="play-card-icon">⚡</span>
          <strong>PARTIE RAPIDE</strong>
          <span>Vous + 4 invités IA, nuit courte (~8 min). Idéal pour découvrir le jeu seul.</span>
        </button>
        <button className="play-card" onClick={() => go('create')}>
          <span className="play-card-icon">🕯️</span>
          <strong>CRÉER UNE PARTIE</strong>
          <span>Ouvrez les portes de votre villa, publique ou privée.</span>
        </button>
        <button className="play-card" onClick={() => go('join')}>
          <span className="play-card-icon">🗝️</span>
          <strong>REJOINDRE AVEC UN CODE</strong>
          <span>Un ami vous a donné un code ? Entrez.</span>
        </button>
        <button className="play-card" onClick={() => go('servers')}>
          <span className="play-card-icon">🏚️</span>
          <strong>PARTIES PUBLIQUES</strong>
          <span>Rejoignez des inconnus. Ils ont tous un secret.</span>
        </button>
      </div>
    </MenuScreen>
  );
}
