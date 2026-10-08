import { useState, type FormEvent } from 'react';
import { META_CONFIG } from '@shared/config';
import { call } from '../../net/socket';
import { attempt, useStore } from '../../store';
import { MenuScreen } from '../common/Screen';

export function JoinGame() {
  const [code, setCode] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const lobby = await attempt(call('lobby:join', { code }));
    if (lobby) useStore.setState({ lobby, screen: 'lobby' });
  };
  return (
    <MenuScreen title="JOIN GAME" back="play">
      <form className="panel form-panel join-panel" onSubmit={submit}>
        <div className="field-label">ENTER CODE</div>
        <input
          className="code-input"
          value={code}
          autoFocus
          maxLength={META_CONFIG.lobbyCodeLength}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
          placeholder="X7K4P2"
          name="code"
        />
        <button className="btn btn-primary btn-lg" disabled={code.length !== META_CONFIG.lobbyCodeLength}>
          JOIN
        </button>
      </form>
    </MenuScreen>
  );
}
