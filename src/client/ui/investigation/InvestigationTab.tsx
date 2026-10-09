import { useEffect, useState, type FormEvent } from 'react';
import { formatClock } from '@shared/config';
import { useStore } from '../../store';
import { CastPortrait } from '../common/CastPortrait';
import { EvidenceCard } from '../game/DossierTab';
import { act, usePicker } from '../game/helpers';

const TOOL_TARGET: Record<string, 'player' | 'object' | 'none' | 'alibi'> = {
  request_testimony: 'player',
  verify_testimony: 'alibi',
  examine_body: 'none',
  analyze_prints: 'object',
  take_prints: 'player',
  inspect_room: 'none',
  examine_shoes: 'player',
  bypass_lock: 'object',
  social_profile: 'none',
};

/** Enquête commune : l'affaire, le dossier commun, les alibis, les oppositions et l'accusation formelle. */
export function InvestigationTab() {
  const game = useStore((s) => s.game)!;
  const ask = usePicker((s) => s.ask);
  const [section, setSection] = useState<'case' | 'file' | 'alibis' | 'accuse'>('case');
  const [place, setPlace] = useState('');
  const [alibiText, setAlibiText] = useState('');
  const [target, setTarget] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [accText, setAccText] = useState('');
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const c = game.caseInfo;
  if (!c) return <div className="empty">L’affaire n’est pas encore ouverte.</div>;
  const free = game.alive && !game.arrested.includes(game.you) && !game.epilogue;
  const suspects = game.players.filter((p) => p.id !== game.you && p.alive && !game.arrested.includes(p.id));
  const evidence = game.dossier?.evidence ?? [];
  const mine = game.alibis.find((a) => a.playerId === game.you);
  const left = Math.max(0, Math.round((c.endsAt - now) / 1000));

  const useTool = (id: string) => {
    const kind = TOOL_TARGET[id] ?? 'none';
    if (kind === 'player') ask('Choisir un joueur', suspects.map((p) => ({ id: p.id, label: p.name })), (pid) => act({ type: 'tool', toolId: id, targetId: pid }));
    else if (kind === 'alibi') {
      if (!game.alibis.length) return useStore.getState().flash('Aucun alibi déclaré pour l’instant.', true);
      ask('Vérifier quel alibi ?', game.alibis.filter((a) => a.playerId !== game.you).map((a) => ({ id: a.playerId, label: `${a.playerName} — ${a.placeName}` })), (pid) => act({ type: 'tool', toolId: id, targetId: pid }));
    } else if (kind === 'object') {
      const opts = [...game.inventory, ...game.objects.filter((o) => o.pos)].map((o) => ({ id: o.id, label: `${o.icon} ${o.name}`, hint: o.inInventory ? 'dans vos poches' : 'à portée requise' }));
      ask('Quel objet ?', opts, (oid) => act({ type: 'tool', toolId: id, targetId: oid }));
    } else act({ type: 'tool', toolId: id });
  };

  const declare = async (e: FormEvent) => {
    e.preventDefault();
    if (!place) return useStore.getState().flash('Choisissez un lieu.', true);
    if (await act({ type: 'alibi', place, text: alibiText })) setAlibiText('');
  };

  const accuse = async (e: FormEvent) => {
    e.preventDefault();
    const name = suspects.find((p) => p.id === target)?.name;
    if (!name) return useStore.getState().flash('Choisissez la personne accusée.', true);
    if (!picked.length) return useStore.getState().flash('Joignez au moins une pièce que vous avez lue.', true);
    if (!confirm(`Accuser formellement ${name} ? C’est une opposition officielle et irrévocable : si ${name} est le meurtrier, vous devenez une cible.`)) return;
    if (await act({ type: 'accuse', targetId: target, evidenceIds: picked, text: accText })) {
      setPicked([]);
      setAccText('');
    }
  };

  return (
    <div className="investigation">
      <div className="chips-row">
        {(['case', 'file', 'alibis', 'accuse'] as const).map((s) => (
          <button key={s} className={`chip-btn ${section === s ? 'active' : ''}`} onClick={() => setSection(s)}>
            {{ case: 'L’affaire', file: `Dossier commun (${game.publicEvidence.length})`, alibis: `Alibis (${game.alibis.length})`, accuse: 'Accuser' }[s]}
          </button>
        ))}
      </div>

      {section === 'case' && (
        <>
          <div className="case-card">
            <div className="case-head">
              <CastPortrait castId={c.victimCastId} size={56} dead />
              <div>
                <div className="case-title">{c.scenarioTitle}</div>
                <div className="small">Victime : <strong>{c.victimName}</strong> — {c.roomName}</div>
              </div>
            </div>
            <p className="small">{c.victimBio}</p>
            <p className="small">{c.brief}</p>
            {game.phase === 'INVESTIGATION' || game.phase === 'ARRIVAL' ? <p className="small muted">La police arrive dans ≈ {Math.floor(left / 60)} min {left % 60} s.</p> : null}
          </div>
          {game.role && (
            <div className="role-card">
              <div className="field-label">Votre spécialité : {game.role.name}</div>
              <div className="small muted">{game.role.description}</div>
              <div className="row-actions">
                {game.role.tools.map((t) => (
                  <button key={t.id} className="btn btn-sm" disabled={!free || t.usesLeft === 0} title={t.description} onClick={() => useTool(t.id)}>
                    {t.name}
                    {t.usesLeft !== undefined && ` (${t.usesLeft})`}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="field-label">Oppositions officielles (irrévocables)</div>
          {game.oppositions.length === 0 && <div className="small muted">Aucune. Seules une accusation formelle, un vote « coupable » ou une pièce versée contre quelqu’un en créent.</div>}
          <ul className="small">
            {game.oppositions.map((o, i) => (
              <li key={i}>
                {formatClock(o.at)} — <strong>{o.fromName}</strong> contre <strong>{o.toName}</strong> ({o.cause})
              </li>
            ))}
          </ul>
        </>
      )}

      {section === 'file' && (
        <>
          {game.publicEvidence.length === 0 && <div className="empty small">Personne n’a encore versé de pièce. Depuis votre dossier (onglet 1), « Verser au dossier commun ».</div>}
          {[...game.publicEvidence].reverse().map((pe) => (
            <div key={`${pe.id}-${pe.at}`} className="public-evidence">
              <div className="small muted">
                {formatClock(pe.at)} — versée par <strong>{pe.authorName}</strong>
                {pe.againstName && <span className="bad"> · contre {pe.againstName}</span>}
              </div>
              <EvidenceCard e={pe} />
              {pe.checks.map((ck, i) => (
                <div key={i} className={`check ${ck.status === 'contradicts' ? 'bad' : 'ok'}`}>
                  {ck.status === 'contradicts' ? '⚠ Contredit' : '✓ Confirme'} l’alibi de {ck.playerName} : {ck.text}
                </div>
              ))}
            </div>
          ))}
        </>
      )}

      {section === 'alibis' && (
        <>
          {free && (
            <form className="alibi-form" onSubmit={declare}>
              <div className="field-label">{mine ? 'Modifier ma déclaration (visible de tous)' : 'Déclarer où j’étais entre 21h00 et 22h00 (publique)'}</div>
              <select value={place} onChange={(e) => setPlace(e.target.value)} name="place">
                <option value="">— lieu —</option>
                {c.places.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <input value={alibiText} onChange={(e) => setAlibiText(e.target.value)} maxLength={200} placeholder="Avec qui ? Qu’avez-vous fait ?" name="alibiText" />
              <button className="btn btn-sm btn-primary">Déclarer</button>
              <div className="small muted">Vous pouvez mentir. Les pièces versées au dossier commun confirmeront ou contrediront votre déclaration.</div>
            </form>
          )}
          {game.alibis.length === 0 && <div className="small muted">Aucune déclaration.</div>}
          {game.alibis.map((a) => (
            <div key={a.playerId} className={`alibi alibi-${a.status}`}>
              <strong>{a.playerName}</strong> : {a.placeName}
              {a.text && <span className="small"> — « {a.text} »</span>}
              <span className="small"> · {a.status === 'contradicted' ? '⚠ contredit par une pièce' : a.status === 'confirmed' ? '✓ confirmé par une pièce' : 'non vérifié'}</span>
            </div>
          ))}
        </>
      )}

      {section === 'accuse' && (
        <form className="accuse-form" onSubmit={accuse}>
          <p className="small">
            Une accusation formelle ouvre un vote « coupable / non coupable ». Il faut joindre au moins une pièce lue. L’arrestation exige la majorité absolue des votants possibles. Accuser vous oppose officiellement à
            la personne accusée. Accusations restantes : <strong>{c.accusationsLeft}</strong>.
          </p>
          {!c.canAccuse && <div className="form-error">{c.accuseBlockedReason}</div>}
          <div className="suspect-grid">
            {suspects.map((p) => (
              <button type="button" key={p.id} className={`suspect ${target === p.id ? 'active' : ''}`} onClick={() => setTarget(p.id)}>
                <CastPortrait castId={p.character.castId} size={48} />
                <span>{p.name}</span>
              </button>
            ))}
          </div>
          <div className="field-label">Pièces jointes</div>
          {evidence.length === 0 && <div className="small muted">Aucune pièce lue.</div>}
          {evidence.map((e) => (
            <label key={e.objectId} className="check-line">
              <input type="checkbox" checked={picked.includes(e.objectId)} onChange={(ev) => setPicked((x) => (ev.target.checked ? [...x, e.objectId] : x.filter((y) => y !== e.objectId)))} /> {e.title}
            </label>
          ))}
          <textarea value={accText} onChange={(e) => setAccText(e.target.value)} maxLength={280} rows={2} placeholder="Votre raisonnement, en une phrase" name="accText" />
          <button className="btn btn-blood" disabled={!free || !c.canAccuse}>Accuser formellement</button>
        </form>
      )}
    </div>
  );
}
