import { useEffect, useState, type FormEvent } from 'react';
import { ROOMS } from '@shared/content/villa';
import { formatClock } from '@shared/config';
import { useStore, attempt } from '../../store';
import { call } from '../../net/socket';
import { Portrait } from '../common/Avatar';
import { Stage3D } from '../common/Stage3D';
import { act, usePicker } from './helpers';

/** L'opportunité n'apparaît que lorsque le monde l'a créée. Jamais de bouton « tuer » permanent. */
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
            Passer à l’acte contre {opp.targetName.split(' ')[0]}
          </button>
        )}
        <button className="btn btn-sm btn-ghost" onClick={() => setDismissed(key)}>Chasser cette pensée</button>
      </div>
    </div>
  );
}

export function VoteModal() {
  const game = useStore((s) => s.game);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const v = game?.vote;
  if (!game || !v || game.epilogue) return null;
  const left = Math.max(0, Math.ceil((v.endsAt - now) / 1000));
  return (
    <div className="modal-backdrop">
      <div className="modal vote-modal">
        <h3>Qui accusez-vous ?</h3>
        <p className="muted">
          {game.caseInfo?.summary} — {v.votesCast}/{v.votesNeeded} votes · {left}s
        </p>
        {!game.alive && <p className="muted">Les morts ne votent pas. Regardez-les se tromper.</p>}
        <div className="vote-grid">
          {v.candidates.map((c) => {
            const p = game.players.find((x) => x.id === c.id);
            return (
              <button key={c.id} className={`vote-card ${v.myVote === c.id ? 'active' : ''}`} disabled={!game.alive} onClick={() => act({ type: 'vote', suspectId: c.id })}>
                {p && <Portrait character={p.character} size={64} />}
                <span>{c.name}{c.id === game.you ? ' (vous)' : ''}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function TestimonyModal() {
  const req = useStore((s) => s.game?.testimonyRequest);
  const [room, setRoom] = useState(ROOMS[0].id);
  const [text, setText] = useState('');
  if (!req) return null;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (await act({ type: 'testimony', requestId: req.requestId, roomId: room, text })) setText('');
  };
  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={submit}>
        <h3>Interrogatoire</h3>
        <p>
          <strong>{req.fromName}</strong> vous demande : « {req.question} »
        </p>
        <p className="small muted">Votre réponse sera publique. Vous pouvez dire la vérité… ou non.</p>
        <label>
          J’étais —
          <select value={room} onChange={(e) => setRoom(e.target.value)}>
            {ROOMS.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </label>
        <label>
          Précisions
          <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={200} rows={2} placeholder="Avec qui ? Pourquoi ?" />
        </label>
        <button className="btn btn-primary">Témoigner</button>
      </form>
    </div>
  );
}

export function Picker() {
  const open = usePicker((s) => s.open);
  const close = usePicker((s) => s.close);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal picker" onClick={(e) => e.stopPropagation()}>
        <h3>{open.title}</h3>
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
        <button className="btn btn-ghost btn-sm" onClick={close}>Annuler</button>
      </div>
    </div>
  );
}

/** Révélation finale : la vérité du serveur, enfin visible. */
export function Epilogue() {
  const game = useStore((s) => s.game);
  const [step, setStep] = useState(0);
  const e = game?.epilogue;
  useEffect(() => {
    if (!e) return;
    setStep(0);
    const ts = [1, 2, 3, 4].map((i) => setTimeout(() => setStep(i), i * 1400));
    return () => ts.forEach(clearTimeout);
  }, [e?.headline]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!game || !e) return null;
  const culprit = game.players.find((p) => p.id === e.culpritId);
  const leave = () => attempt(call('game:leave'));
  return (
    <div className="epilogue">
      <div className="epilogue-inner">
        <div className="epilogue-kicker">ÉPILOGUE</div>
        <h2 className="epilogue-headline">{e.headline}</h2>
        {step >= 1 && culprit && (
          <div className="epilogue-culprit fade-in">
            <div className="epilogue-figure">
              <Stage3D actors={[{ key: culprit.id, character: culprit.character }]} rotatable angle={0.5} />
            </div>
            <div>
              <div className="muted">{e.caseType === 'murder' ? 'Le meurtrier' : 'Le voleur'}</div>
              <div className="culprit-name">{culprit.name}</div>
              <div className={e.culpritCaught ? 'ok' : 'bad'}>{e.culpritCaught ? 'Démasqué·e par le groupe' : e.accusedName ? `Le groupe a accusé à tort : ${e.accusedName}` : 'Le groupe n’a désigné personne'}</div>
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
                    <span className="feed-time">{formatClock(l.at)}</span> {l.text}
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
                      <li key={s.playerId}>🤫 {s.secret}</li>
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
                      <li key={i} className={v.correct ? 'ok' : 'bad'}>
                        {v.voterName} → {v.suspectName} {v.correct ? '✓' : '✗'}
                      </li>
                    ))}
                  </ul>
                  {e.roles.length > 0 && (
                    <>
                      <div className="field-label">Les rôles</div>
                      <div className="small muted">{e.roles.map((r) => `${r.name} : ${r.role}`).join(' · ')}</div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        )}
        <div className="epilogue-actions">
          <button className="btn btn-primary btn-lg" onClick={leave}>RETOUR AU LOBBY — REJOUER</button>
        </div>
      </div>
    </div>
  );
}
