import { useState, type FormEvent } from 'react';
import { META_CONFIG, GAME_TAGLINE } from '@shared/config';
import { api } from '../../net/api';
import { useStore } from '../../store';
import { Logo } from '../common/Logo';
import { audio } from '../../audio';

export function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const onAuthenticated = useStore((s) => s.onAuthenticated);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    audio.unlock();
    setError(null);
    if (mode === 'register') {
      if (username.trim().length < META_CONFIG.username.min) return setError(`Pseudo : ${META_CONFIG.username.min} caractères minimum.`);
      if (!META_CONFIG.username.pattern.test(username.trim())) return setError('Pseudo : lettres, chiffres, « _ », « . », « - » uniquement.');
      if (password.length < META_CONFIG.password.min) return setError(`Mot de passe : ${META_CONFIG.password.min} caractères minimum.`);
      if (password !== confirm) return setError('Les mots de passe ne correspondent pas.');
    }
    setBusy(true);
    try {
      const r = mode === 'login' ? await api.login(username, password) : await api.register(username, password);
      await onAuthenticated(r.token);
    } catch (err) {
      setError((err as Error).message);
      audio.error();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-screen fade-in">
      <Logo />
      <p className="tagline">{GAME_TAGLINE}</p>
      <form className="panel auth-panel" onSubmit={submit}>
        <div className="tabs">
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Connexion</button>
          <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>Créer un compte</button>
        </div>
        <label>
          Pseudo
          <input autoFocus value={username} onChange={(e) => setUsername(e.target.value)} maxLength={META_CONFIG.username.max} autoComplete="username" name="username" />
        </label>
        <label>
          Mot de passe
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} name="password" />
        </label>
        {mode === 'register' && (
          <label>
            Confirmer le mot de passe
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" name="confirm" />
          </label>
        )}
        {error && <div className="form-error">{error}</div>}
        <button className="btn btn-primary btn-lg" disabled={busy}>
          {busy ? '…' : mode === 'login' ? 'ENTRER' : 'CRÉER MON COMPTE'}
        </button>
      </form>
    </div>
  );
}
