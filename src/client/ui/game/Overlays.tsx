import { useEffect, useState, type FormEvent } from 'react';
import { formatClock } from '@shared/config';
import { useStore, attempt } from '../../store';
import { call } from '../../net/socket';
import { CastPortrait } from '../common/CastPortrait';
import { EvidenceCard } from './DossierTab';
import { act, useChatFocus, usePicker } from './helpers';

/** Occasion d'élimination : meurtrier uniquement, contre un opposant officiel, seul à seul. */
export function OpportunityPrompt() {
  const opp = useStore((s) => s.game?.opportunity);
  const [armed, setArmed] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);
  useEffect(() => setArmed(false), [opp?.targetId]);
  if (!opp) return null;
  const key = `${opp.targetId}|${opp.objectId}`;
  if (dismissed === key) return null;
  return (
    <div className="opportunity">
      <div className="opportunity-text">{opp.text}</div>
      <div className="row-actions">
        {!armed ? (
          <button className="btn btn-sm btn-blood" onClick={() => setArmed(true)}>Saisir l’occasion…</button>
        ) : (
          <button className="btn btn-sm btn-blood armed" onClick={() => act({ type: 'act', targetId: opp.targetId, objectId: opp.objectId })}>
            Éliminer {opp.targetName.split(' ')[0]}
          </button>
        )}
        <button className="btn btn-sm btn-ghost" onClick={() => setDismissed(key)}>Renoncer</button>
      </div>
    </div>
  );
}

function useNow(ms = 500) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** Vote en cours : déclencheur, pièces, défense, règles, échéance. */
export function VoteModal() {
  const game = useStore((s) => s.game);
  const now = useNow();
  const [defense, setDefense] = useState('');
  const [hidden, setHidden] = useState<string | null>(null);
  const v = game?.vote;
  if (!game || !v || game.epilogue) return null;
  if (hidden === v.id) return <button className="vote-reopen btn btn-blood btn-sm" onClick={() => setHidden(null)}>🗳 Vote en cours — rouvrir</button>;
  const left = Math.max(0, Math.ceil((v.endsAt - now) / 1000));
  const accused = v.accusedId ? game.players.find((p) => p.id === v.accusedId) : undefined;
  const submitDefense = async (e: FormEvent) => {
    e.preventDefault();
    if (await act({ type: 'defend', text: defense })) setDefense('');
  };
  return (
    <div className="modal-backdrop">
      <div className="modal vote-modal">
        <div className="field-label">{v.trigger}</div>
        {accused ? (
          <div className="vote-accused">
            <CastPortrait castId={accused.character.castId} size={72} />
            <div>
              <h3>{accused.name} est-{accused.character.appearance === 'feminine' ? 'elle' : 'il'} coupable ?</h3>
              {v.accusationText && <p className="small">« {v.accusationText} » — {v.accuserName}</p>}
            </div>
          </div>
        ) : (
          <h3>Qui livrer à la police ?</h3>
        )}
        <p className="small muted">
          {v.votesCast}/{v.votesNeeded} votes · {left} s · {v.rules}
        </p>
        {v.evidence.length > 0 && (
          <div className="vote-evidence">
            {v.evidence.map((e, i) => (
              <EvidenceCard key={i} e={e} />
            ))}
          </div>
        )}
        {v.defense && <p className="defense">Défense : « {v.defense} »</p>}
        {v.accusedId === game.you && !v.defense && (
          <form onSubmit={submitDefense} className="row-actions">
            <input value={defense} onChange={(e) => setDefense(e.target.value)} maxLength={400} placeholder="Votre défense (publique)" name="defense" />
            <button className="btn btn-sm">Se défendre</button>
          </form>
        )}
        {!v.eligible && <p className="muted small">Vous ne votez pas ({v.accusedId === game.you ? 'vous êtes accusé·e' : 'hors jeu'}).</p>}
        <div className="vote-grid">
          {v.options.map((o) => {
            const p = game.players.find((x) => x.id === o.id);
            return (
              <button
                key={o.id}
                className={`vote-card ${v.myChoice === o.id ? 'active' : ''} ${o.id === 'guilty' ? 'guilty' : ''}`}
                disabled={!v.eligible || !!v.myChoice}
                onClick={() => confirm(`Voter « ${o.label} » ? Ce vote est définitif.${o.id === 'guilty' ? ' Il vous oppose officiellement à la personne accusée.' : ''}`) && act({ type: 'ballot', choice: o.id })}
              >
                {p && <CastPortrait castId={p.character.castId} size={56} />}
                <span>{o.label}</span>
              </button>
            );
          })}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => setHidden(v.id)}>Masquer (le vote continue)</button>
      </div>
    </div>
  );
}

/** Un enquêteur exige votre alibi : déclaration publique. */
export function TestimonyModal() {
  const game = useStore((s) => s.game);
  const [place, setPlace] = useState('');
  const [text, setText] = useState('');
  const req = game?.testimonyRequest;
  if (!game || !req || !game.caseInfo) return null;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!place) return;
    if (await act({ type: 'alibi', place, text })) setText('');
  };
  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={submit}>
        <h3>Interrogatoire</h3>
        <p>
          <strong>{req.fromName}</strong> vous demande : « {req.question} »
        </p>
        <p className="small muted">Votre réponse sera publique et pourra être recoupée par les pièces du dossier.</p>
        <select value={place} onChange={(e) => setPlace(e.target.value)} name="place">
          <option value="">— J’étais à… —</option>
          {game.caseInfo.places.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={200} rows={2} placeholder="Avec qui ? Pourquoi ?" name="text" />
        <button className="btn btn-primary" disabled={!place}>Déclarer</button>
      </form>
    </div>
  );
}

export function Picker() {
  const open = usePicker((s) => s.open);
  const close = usePicker((s) => s.close);
  const [text, setText] = useState('');
  useEffect(() => setText(''), [open]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal picker" onClick={(e) => e.stopPropagation()}>
        <h3>{open.title}</h3>
        {open.kind === 'choice' ? (
          <div className="picker-list">
            {open.options.length === 0 && <div className="muted">Aucune option disponible.</div>}
            {open.options.map((o) => (
              <button
                key={o.id}
                className="picker-option"
                onClick={() => {
                  close();
                  open.onPick(o.id);
                }}
              >
                {o.label}
                {o.hint && <span className="muted small"> — {o.hint}</span>}
              </button>
            ))}
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              close();
              open.onSubmit(text.trim());
            }}
          >
            <div className="small muted">{open.hint}</div>
            <input autoFocus value={text} onChange={(e) => setText(e.target.value)} maxLength={40} placeholder={open.placeholder ?? 'Code'} name="code" autoComplete="off" />
            <button className="btn btn-primary btn-sm">Valider</button>
          </form>
        )}
        <button className="btn btn-ghost btn-sm" onClick={close}>Annuler</button>
      </div>
    </div>
  );
}

/** Menu pause (Échap) : reprendre, dossier, réglages audio, quitter. La partie continue pour les autres. */
export function PauseMenu() {
  const paused = useChatFocus((s) => s.paused);
  const setPaused = useChatFocus((s) => s.setPaused);
  const settings = useStore((s) => s.settings);
  const update = useStore((s) => s.updateSettings);
  const game = useStore((s) => s.game);
  if (!paused || !game) return null;
  const leave = async () => {
    setPaused(false);
    if (game.epilogue) return void attempt(call('game:leave'));
    if (!confirm('Quitter la partie ? Votre personnage restera immobile dans la villa.')) return;
    await attempt(call('lobby:leave'));
    useStore.setState({ game: null, inGame: false, lobby: null, screen: 'menu' });
  };
  return (
    <div className="modal-backdrop" onClick={() => setPaused(false)}>
      <div className="modal pause-menu" onClick={(e) => e.stopPropagation()}>
        <h3>Pause</h3>
        <p className="small muted">La nuit continue pour les autres joueurs.</p>
        <button className="btn btn-primary" onClick={() => setPaused(false)}>Reprendre</button>
        <button className="btn" onClick={() => (setPaused(false), useChatFocus.getState().setTab(0))}>Mon dossier</button>
        <label>
          Musique — {Math.round(settings.music * 100)} %
          <input type="range" min={0} max={1} step={0.05} value={settings.music} onChange={(e) => update({ music: Number(e.target.value) })} />
        </label>
        <label>
          Effets sonores — {Math.round(settings.sfx * 100)} %
          <input type="range" min={0} max={1} step={0.05} value={settings.sfx} onChange={(e) => update({ sfx: Number(e.target.value) })} />
        </label>
        <label className="check-line">
          <input type="checkbox" checked={settings.reducedMotion} onChange={(e) => update({ reducedMotion: e.target.checked })} /> Réduire les animations
        </label>
        <div className="small muted">
          <kbd>ZQSD</kbd> se déplacer · <kbd>Maj</kbd> courir · <kbd>E</kbd> interagir · <kbd>F</kbd> autres actions · <kbd>V</kbd> vue · <kbd>1</kbd>–<kbd>4</kbd> panneaux · <kbd>Entrée</kbd> chat · <kbd>M</kbd> plan
        </div>
        <button className="btn btn-ghost danger" onClick={leave}>{game.epilogue ? 'Retour au salon' : 'Quitter la partie'}</button>
      </div>
    </div>
  );
}

/** Épilogue : toute la vérité, enfin visible. */
export function Epilogue() {
  const game = useStore((s) => s.game);
  const [step, setStep] = useState(0);
  const e = game?.epilogue;
  useEffect(() => {
    if (!e) return;
    setStep(0);
    const ts = [1, 2, 3, 4].map((i) => setTimeout(() => setStep(i), i * 1200));
    return () => ts.forEach(clearTimeout);
  }, [e?.headline]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!game || !e) return null;
  const murderer = game.players.find((p) => p.id === e.murdererId);
  const won = e.outcomes.find((o) => o.playerId === game.you)?.won;
  const leave = () => attempt(call('game:leave'));
  return (
    <div className="epilogue">
      <div className="epilogue-inner">
        <div className="epilogue-kicker">ÉPILOGUE — {e.scenarioTitle}</div>
        <h2 className="epilogue-headline">{e.headline}</h2>
        <div className={won ? 'ok' : 'bad'}>{won ? 'Vous avez gagné.' : 'Vous avez perdu.'} {e.winner === 'innocents' ? 'Victoire des innocents.' : 'Victoire du meurtrier.'}</div>
        {step >= 1 && murderer && (
          <div className="epilogue-culprit fade-in">
            <CastPortrait castId={murderer.character.castId} size={110} variant="card" />
            <div>
              <div className="muted">{murderer.character.appearance === 'feminine' ? 'La meurtrière' : 'Le meurtrier'}</div>
              <div className="culprit-name">{e.murdererName}</div>
              <p>{e.motive}</p>
              {e.protectorNames.length > 0 && <p className="small">Protégé·e par : {e.protectorNames.join(', ')}</p>}
              {e.arrested.length > 0 && <p className="small">Arrestations : {e.arrested.map((a) => `${a.name}${a.guilty ? ' (coupable)' : ' (innocent·e)'}`).join(', ')}</p>}
            </div>
          </div>
        )}
        {step >= 2 && (
          <div className="epilogue-cols fade-in">
            <div>
              <div className="field-label">Ce qui s’est vraiment passé</div>
              <ol className="truth">
                {e.truthTimeline.map((l, i) => (
                  <li key={i}>
                    {l.at >= 0 && <span className="feed-time">{formatClock(l.at)}</span>} {l.text}
                  </li>
                ))}
              </ol>
            </div>
            <div>
              {step >= 3 && (
                <>
                  <div className="field-label">Les secrets</div>
                  <ul className="secrets">
                    {e.secrets.map((s) => (
                      <li key={s.playerId}>
                        🤫 <strong>{s.camp}</strong> — {s.secret}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {step >= 4 && (
                <>
                  <div className="field-label">Les votes</div>
                  <ul className="secrets">
                    {e.votes.length === 0 && <li className="muted">Aucun vote.</li>}
                    {e.votes.map((v, i) => (
                      <li key={i}>
                        {v.trigger}
                        {v.accusedName && ` → ${v.accusedName}`} : {v.result}
                      </li>
                    ))}
                  </ul>
                  {e.oppositions.length > 0 && <div className="small muted">Oppositions : {e.oppositions.map((o) => `${o.fromName} → ${o.toName}`).join(' · ')}</div>}
                  {e.roles.length > 0 && <div className="small muted">Spécialités : {e.roles.map((r) => `${r.name} : ${r.role}`).join(' · ')}</div>}
                </>
              )}
            </div>
          </div>
        )}
        <div className="epilogue-actions">
          <button className="btn btn-primary btn-lg" onClick={leave}>RETOUR AU SALON — REJOUER</button>
        </div>
      </div>
    </div>
  );
}
