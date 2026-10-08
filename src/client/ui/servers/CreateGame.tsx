import { useState } from 'react';
import type { LobbyVisibility } from '@shared/types';
import { META_CONFIG } from '@shared/config';
import { call } from '../../net/socket';
import { attempt, useStore } from '../../store';
import { MenuScreen } from '../common/Screen';

export function CreateGame() {
  const character = useStore((s) => s.character);
  const [name, setName] = useState(`Villa ${character?.lastName ?? 'Beaumont'}`);
  const [maxPlayers, setMax] = useState<number>(META_CONFIG.defaultMaxPlayers);
  const [visibility, setVis] = useState<LobbyVisibility>('PUBLIC');
  const [busy, setBusy] = useState(false);
  const [duration, setDuration] = useState<'short' | 'normal'>('normal');

  const create = async () => {
    setBusy(true);
    const lobby = await attempt(call('lobby:create', { name, maxPlayers, visibility, duration }));
    setBusy(false);
    if (lobby) useStore.setState({ lobby, screen: 'lobby' });
  };

  return (
    <MenuScreen title="CREATE GAME" back="play">
      <div className="panel form-panel">
        <label>
          Nom de la partie
          <input value={name} maxLength={META_CONFIG.lobbyName.max} onChange={(e) => setName(e.target.value)} name="lobbyName" />
        </label>
        <div className="field-label">Nombre maximum de joueurs</div>
        <div className="seg seg-wrap">
          {META_CONFIG.maxPlayersOptions.map((n) => (
            <button key={n} className={maxPlayers === n ? 'active' : ''} onClick={() => setMax(n)}>
              {n}
            </button>
          ))}
        </div>
        <p className="hint">Idéal : 4 à 6 joueurs. Minimum pour lancer : {META_CONFIG.minPlayersToStart}.</p>
        <div className="field-label">Visibilité</div>
        <div className="seg">
          <button className={visibility === 'PUBLIC' ? 'active' : ''} onClick={() => setVis('PUBLIC')}>PUBLIC</button>
          <button className={visibility === 'PRIVATE' ? 'active' : ''} onClick={() => setVis('PRIVATE')}>PRIVATE</button>
        </div>
        <p className="hint">{visibility === 'PRIVATE' ? 'Seules les personnes ayant le code pourront entrer.' : 'Visible dans la liste des serveurs.'}</p>
        <div className="field-label">Durée de la nuit</div>
        <div className="seg">
          <button className={duration === 'short' ? 'active' : ''} onClick={() => setDuration('short')}>Courte (~8 min)</button>
          <button className={duration === 'normal' ? 'active' : ''} onClick={() => setDuration('normal')}>Normale (~15 min)</button>
        </div>
        <p className="hint">Dans le lobby, l’hôte peut compléter la table avec des invités IA.</p>
        <button className="btn btn-primary btn-lg" onClick={create} disabled={busy}>
          OUVRIR LES PORTES
        </button>
      </div>
    </MenuScreen>
  );
}
