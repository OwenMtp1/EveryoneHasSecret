import { useEffect, useState, type FormEvent } from 'react';
import { META_CONFIG, GAME_TAGLINE } from '@shared/config';
import { api } from '../../net/api';
import { authMode, supabaseAuth, tokenStore } from '../../net/auth';
import { useStore } from '../../store';
import { Logo } from '../common/Logo';
import { audio } from '../../audio';

type Mode = 'login' | 'register' | 'forgot';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function checkUsername(u: string): string | null {
  if (u.trim().length < META_CONFIG.username.min) return `Pseudo : ${META_CONFIG.username.min} caractères minimum.`;
  if (u.trim().length > META_CONFIG.username.max) return `Pseudo : ${META_CONFIG.username.max} caractères maximum.`;
  if (!META_CONFIG.username.pattern.test(u.trim())) return 'Pseudo : lettres, chiffres, « _ », « . », « - » uniquement.';
  return null;
}

/** Connexion / inscription / mot de passe oublié. Par e-mail (Supabase) ou par pseudo (serveur local). */
export function AuthScreen() {
  const supabase = authMode() === 'supabase';
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const onAuthenticated = useStore((s) => s.onAuthenticated);
  const notice = useStore((s) => s.authNotice);

  useEffect(() => {
    setError(null);
    setInfo(null);
  }, [mode]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    audio.unlock();
    setError(null);
    setInfo(null);
    if (supabase && !EMAIL.test(email.trim())) return setError('Adresse e-mail invalide.');
    if (mode === 'register') {
      const bad = checkUsername(username);
      if (bad) return setError(bad);
      if (password.length < META_CONFIG.password.min) return setError(`Mot de passe : ${META_CONFIG.password.min} caractères minimum.`);
      if (password !== confirm) return setError('Les mots de passe ne correspondent pas.');
    }
    setBusy(true);
    try {
      if (!supabase) {
        if (mode === 'forgot') throw new Error('Ce serveur local ne gère pas la récupération par e-mail.');
        const r = mode === 'login' ? await api.login(username, password) : await api.register(username, password);
        tokenStore.set(r.token);
        await onAuthenticated();
      } else if (mode === 'forgot') {
        await supabaseAuth.requestReset(email.trim());
        setInfo('Si un compte existe pour cette adresse, un e-mail de réinitialisation vient d’être envoyé.');
      } else if (mode === 'register') {
        const { available } = await api.usernameAvailable(username.trim());
        if (!available) throw new Error('Ce pseudo est déjà pris.');
        const { needsConfirmation } = await supabaseAuth.signUp(email.trim(), password, username.trim());
        if (needsConfirmation) {
          setInfo('Compte créé. Ouvrez le lien de confirmation reçu par e-mail, puis connectez-vous.');
          setMode('login');
          setPassword('');
          setConfirm('');
          setTimeout(() => setInfo('Compte créé. Ouvrez le lien de confirmation reçu par e-mail, puis connectez-vous.'), 0);
        } else await onAuthenticated();
      } else {
        await supabaseAuth.signIn(email.trim(), password);
        await onAuthenticated();
      }
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
        {notice && mode === 'login' && !error && !info && <div className="form-info">{notice}</div>}
        {supabase && (
          <label>
            E-mail
            <input autoFocus type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" name="email" maxLength={254} />
          </label>
        )}
        {(!supabase || mode === 'register') && (
          <label>
            Pseudo{supabase && <span className="muted small"> — visible des autres joueurs</span>}
            <input autoFocus={!supabase} value={username} onChange={(e) => setUsername(e.target.value)} maxLength={META_CONFIG.username.max} autoComplete="username" name="username" />
          </label>
        )}
        {mode !== 'forgot' && (
          <label>
            Mot de passe
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} name="password" maxLength={META_CONFIG.password.max} />
          </label>
        )}
        {mode === 'register' && (
          <label>
            Confirmer le mot de passe
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" name="confirm" />
          </label>
        )}
        {error && <div className="form-error">{error}</div>}
        {info && <div className="form-info">{info}</div>}
        <button className="btn btn-primary btn-lg" disabled={busy}>
          {busy ? '…' : mode === 'login' ? 'ENTRER' : mode === 'register' ? 'CRÉER MON COMPTE' : 'ENVOYER LE LIEN'}
        </button>
        {supabase && mode === 'login' && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode('forgot')}>Mot de passe oublié ?</button>
        )}
        {mode === 'forgot' && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode('login')}>Retour à la connexion</button>
        )}
        <p className="muted small">Votre session reste ouverte sur cet appareil jusqu’à ce que vous vous déconnectiez.</p>
      </form>
    </div>
  );
}

/** Première connexion d'un compte Supabase dont le pseudo n'a pas pu être réservé à l'inscription. */
export function UsernameScreen() {
  const pending = useStore((s) => s.pendingProfile);
  const onAuthenticated = useStore((s) => s.onAuthenticated);
  const logout = useStore((s) => s.logout);
  const [username, setUsername] = useState(pending?.suggested ?? '');
  const [error, setError] = useState<string | null>(pending?.suggested ? 'Ce pseudo a été pris entre-temps : choisissez-en un autre.' : null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const bad = checkUsername(username);
    if (bad) return setError(bad);
    setBusy(true);
    try {
      await api.claimUsername(username.trim());
      await onAuthenticated();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-screen fade-in">
      <Logo />
      <form className="panel auth-panel" onSubmit={submit}>
        <h3>Choisissez votre pseudo</h3>
        {pending?.email && <div className="muted small">Compte : {pending.email}</div>}
        <label>
          Pseudo
          <input autoFocus value={username} onChange={(e) => setUsername(e.target.value)} maxLength={META_CONFIG.username.max} name="username" />
        </label>
        {error && <div className="form-error">{error}</div>}
        <button className="btn btn-primary btn-lg" disabled={busy}>{busy ? '…' : 'CONTINUER'}</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => logout()}>Se déconnecter</button>
      </form>
    </div>
  );
}

/** Lien « mot de passe oublié » ouvert : définition du nouveau mot de passe. */
export function ResetPasswordScreen() {
  const onAuthenticated = useStore((s) => s.onAuthenticated);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < META_CONFIG.password.min) return setError(`Mot de passe : ${META_CONFIG.password.min} caractères minimum.`);
    if (password !== confirm) return setError('Les mots de passe ne correspondent pas.');
    setBusy(true);
    try {
      await supabaseAuth.updatePassword(password);
      useStore.setState({ authNotice: null });
      await onAuthenticated();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-screen fade-in">
      <Logo />
      <form className="panel auth-panel" onSubmit={submit}>
        <h3>Nouveau mot de passe</h3>
        <label>
          Mot de passe
          <input autoFocus type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" name="password" />
        </label>
        <label>
          Confirmer
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" name="confirm" />
        </label>
        {error && <div className="form-error">{error}</div>}
        <button className="btn btn-primary btn-lg" disabled={busy}>{busy ? '…' : 'ENREGISTRER'}</button>
      </form>
    </div>
  );
}
