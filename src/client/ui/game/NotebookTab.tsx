import { useState } from 'react';
import { formatClock } from '@shared/config';
import type { KnowledgeKind } from '@shared/types';
import { useStore } from '../../store';
import { act, usePicker } from './helpers';

const FILTERS: { id: 'all' | 'important' | KnowledgeKind; label: string }[] = [
  { id: 'important', label: 'Important' },
  { id: 'all', label: 'Tout' },
  { id: 'seen', label: 'Vu' },
  { id: 'heard', label: 'Entendu' },
  { id: 'evidence', label: 'Indices' },
  { id: 'role', label: 'Rôle' },
  { id: 'received', label: 'Reçu' },
];

const KIND_ICON: Record<KnowledgeKind, string> = {
  seen: '👁', heard: '👂', deduced: '💭', received: '📨', role: '🔎', evidence: '🧩', secret: '🤫', self: '✍️',
};

/** Le carnet : TOUT ce que vous savez — et rien de plus. */
export function NotebookTab() {
  const game = useStore((s) => s.game)!;
  const ask = usePicker((s) => s.ask);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('important');
  const entries = [...game.knowledge]
    .reverse()
    .filter((k) => filter === 'all' || (filter === 'important' ? k.important || k.kind === 'secret' || k.kind === 'heard' : k.kind === filter));

  const share = (id: string) => {
    const others = game.players.filter((p) => p.id !== game.you && p.alive);
    ask('Partager cette information avec…', [{ id: 'board', label: '📋 Le tableau d’enquête (public)' }, { id: 'allies', label: '🛡️ Mes allié·es' }, ...others.map((p) => ({ id: `p:${p.id}`, label: `✉ ${p.name}` }))], (to) => {
      if (to === 'board' || to === 'allies') act({ type: 'share', knowledgeId: id, to });
      else act({ type: 'share', knowledgeId: id, to: 'player', targetId: to.slice(2) });
    });
  };

  return (
    <div className="notebook">
      <div className="secret-card">
        <div className="field-label">Votre secret</div>
        {game.secret}
      </div>
      <div className="chips-row">
        {FILTERS.map((f) => (
          <button key={f.id} className={`chip-btn ${filter === f.id ? 'active' : ''}`} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>
      {entries.length === 0 && <div className="empty small">Rien pour l’instant. Observez. Écoutez.</div>}
      {entries.map((k) => (
        <div key={k.id} className={`note note-${k.kind} ${k.important ? 'important' : ''}`}>
          <span className="note-icon" title={k.kind}>{KIND_ICON[k.kind]}</span>
          <div className="grow">
            <div className="note-text">{k.text}</div>
            <div className="note-meta">
              {formatClock(k.at)}
              {k.sourceName && ` · transmis par ${k.sourceName}`}
            </div>
          </div>
          {game.alive && (
            <button className="btn btn-xs btn-ghost" onClick={() => share(k.id)} title="Partager">↗</button>
          )}
        </div>
      ))}
    </div>
  );
}
