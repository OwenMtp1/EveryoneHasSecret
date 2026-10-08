import { useState, type FormEvent } from 'react';
import { formatClock } from '@shared/config';
import { useStore } from '../../store';
import { act, usePicker, PHASE_LABEL } from '../game/helpers';

export function InvestigationTab() {
  const game = useStore((s) => s.game)!;
  const ask = usePicker((s) => s.ask);
  const [claim, setClaim] = useState('');
  const c = game.caseInfo;
  const role = game.role;

  if (!c)
    return (
      <div className="investigation">
        <div className="empty">
          <p>Aucune affaire pour l’instant.</p>
          <p className="small muted">Phase actuelle : {PHASE_LABEL[game.phase]}. Explorez, parlez, observez. Notez qui était où. Quand quelque chose arrivera, chacun recevra un rôle d’enquête — et vous aurez besoin des autres.</p>
        </div>
      </div>
    );

  const testimonies = game.board.filter((b) => b.kind === 'testimony');
  const useTool = (id: string, target: string) => {
    if (target === 'player') {
      const opts = game.players.filter((p) => p.id !== game.you && p.alive).map((p) => ({ id: p.id, label: p.name }));
      ask('Choisir un joueur', opts, (pid) => act({ type: 'tool', toolId: id, targetId: pid }));
    } else if (target === 'testimony') {
      if (!testimonies.length) return useStore.getState().flash('Aucun témoignage sur le tableau. Interrogez d’abord.', true);
      ask('Quel témoignage vérifier ?', testimonies.map((t) => ({ id: t.id, label: t.text })), (tid) => act({ type: 'tool', toolId: id, targetId: tid }));
    } else if (target === 'object') {
      const opts = [...game.inventory, ...game.objects.filter((o) => o.pos)].map((o) => ({ id: o.id, label: `${o.icon} ${o.name}`, hint: o.inInventory ? 'dans vos poches' : 'à proximité requise' }));
      ask('Analyser quel objet ?', opts, (oid) => act({ type: 'tool', toolId: id, targetId: oid }));
    } else act({ type: 'tool', toolId: id });
  };
  const toolTarget: Record<string, string> = {
    request_testimony: 'player',
    verify_testimony: 'testimony',
    examine_body: 'body',
    analyze_prints: 'object',
    take_prints: 'player',
    inspect_room: 'none',
    examine_shoes: 'player',
    camera_logs: 'none',
    social_profile: 'none',
  };

  const submitClaim = async (e: FormEvent) => {
    e.preventDefault();
    if (await act({ type: 'claim', text: claim })) setClaim('');
  };

  return (
    <div className="investigation">
      <div className={`case-card case-${c.type}`}>
        <div className="case-title">{c.title}</div>
        <div>{c.summary}</div>
      </div>
      {role && (
        <div className="role-card">
          <div className="role-name">🔎 {role.name}</div>
          <div className="small muted">{role.description}</div>
          <div className="role-tools">
            {role.tools.map((t) => (
              <button key={t.id} className="btn btn-sm" disabled={!game.alive || t.usesLeft === 0} title={t.description} onClick={() => useTool(t.id, toolTarget[t.id] ?? 'none')}>
                {t.name}
                {t.usesLeft !== undefined && <span className="uses"> ({t.usesLeft})</span>}
              </button>
            ))}
          </div>
          <div className="small muted">Les résultats arrivent dans votre Carnet. Partagez-les… ou pas.</div>
        </div>
      )}
      <div className="field-label">Tableau d’enquête</div>
      <div className="board">
        {game.board.length === 0 && <div className="muted small">Vide.</div>}
        {[...game.board].reverse().map((b) => (
          <div key={b.id} className={`board-entry board-${b.kind} ${b.verified ? 'verified' : ''}`}>
            <div className="board-meta">
              {formatClock(b.at)} · {b.authorName}
              {b.kind === 'evidence' && (b.verified ? <span className="chip chip-ok">constat</span> : <span className="chip">rapporté</span>)}
              {b.kind === 'claim' && <span className="chip">déclaration</span>}
              {b.kind === 'testimony' && <span className="chip">témoignage</span>}
            </div>
            <div>{b.text}</div>
          </div>
        ))}
      </div>
      {game.alive && !game.epilogue && (
        <form onSubmit={submitClaim} className="claim-form">
          <textarea value={claim} onChange={(e) => setClaim(e.target.value)} maxLength={240} placeholder="Déclarer publiquement (vrai… ou faux) : « J’ai vu Thomas sortir de la cuisine à 00:20 »" rows={2} name="claim" />
          <button className="btn btn-sm btn-primary" disabled={claim.trim().length < 3}>Déclarer</button>
        </form>
      )}
    </div>
  );
}
