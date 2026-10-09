import { useState } from 'react';
import { formatClock } from '@shared/config';
import type { EvidenceView, KnowledgeKind } from '@shared/types';
import { useStore } from '../../store';
import { CastPhoto } from '../common/CastPortrait';
import { act, usePicker } from './helpers';

const KIND_ICON: Record<KnowledgeKind, string> = {
  seen: '👁', heard: '👂', deduced: '💭', received: '📨', role: '🔎', evidence: '🧩', secret: '🤫', self: '✍️',
};

const CAMP_LABEL = { murderer: 'Meurtrier·ère', innocent: 'Innocent·e', protector: 'Protecteur·rice du meurtrier' } as const;

/** Une pièce lue : texte exact et photos rendues avec les vrais personnages de la partie. */
export function EvidenceCard({ e, actions }: { e: { title: string; lines: string[]; photos?: EvidenceView['photos'] }; actions?: React.ReactNode }) {
  return (
    <div className="evidence-card">
      <div className="evidence-title">{e.title}</div>
      {e.photos?.map((ph, i) => (
        <CastPhoto key={i} spec={{ castIds: ph.castIds, scene: ph.scene, caption: ph.caption, seed: ph.seed }} width={240} className="evidence-photo" />
      ))}
      {e.lines.map((l, i) => (
        <p key={i} className="evidence-line">{l}</p>
      ))}
      {actions && <div className="row-actions">{actions}</div>}
    </div>
  );
}

/** Dossier personnel (privé) : camp, objectif, secret, souvenirs, pièces lues, journal. */
export function DossierTab() {
  const game = useStore((s) => s.game)!;
  const ask = usePicker((s) => s.ask);
  const [section, setSection] = useState<'me' | 'evidence' | 'journal'>('me');
  const d = game.dossier;
  if (!d) return <div className="empty">Dossier indisponible.</div>;
  const others = game.players.filter((p) => p.id !== game.you && p.alive && !game.arrested.includes(p.id));
  const free = game.alive && !d.arrested && !game.epilogue;

  const present = (e: EvidenceView) =>
    ask('Verser au dossier commun', [{ id: '', label: '📂 Sans viser personne (information)' }, ...others.map((p) => ({ id: p.id, label: `⚠ Contre ${p.name}`, hint: 'dénonciation formelle : opposition officielle irrévocable' }))], (against) =>
      act({ type: 'present', objectId: e.objectId, againstId: against || undefined }),
    );

  return (
    <div className="dossier">
      <div className="chips-row">
        <button className={`chip-btn ${section === 'me' ? 'active' : ''}`} onClick={() => setSection('me')}>Moi</button>
        <button className={`chip-btn ${section === 'evidence' ? 'active' : ''}`} onClick={() => setSection('evidence')}>Pièces lues ({d.evidence.length})</button>
        <button className={`chip-btn ${section === 'journal' ? 'active' : ''}`} onClick={() => setSection('journal')}>Journal</button>
      </div>

      {section === 'me' && (
        <>
          <div className={`camp-card camp-${d.camp}`}>
            <div className="field-label">Votre camp — strictement privé</div>
            <strong>{CAMP_LABEL[d.camp]}</strong>
            <p>{d.objective}</p>
            {d.arrested && <p className="bad">Vous êtes arrêté·e : vous observez jusqu’à la fin.</p>}
          </div>
          <div className="secret-card">
            <div className="field-label">Votre secret</div>
            {d.secret}
          </div>
          {d.briefing.filter(Boolean).length > 0 && (
            <div className="secret-card">
              <div className="field-label">À savoir</div>
              {d.briefing.filter(Boolean).map((b, i) => (
                <p key={i} className="small">{b}</p>
              ))}
            </div>
          )}
          <div className="field-label">Votre soirée (21h–22h)</div>
          <ul className="memories">
            {d.memories.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
          {game.role && (
            <div className="role-card">
              <div className="field-label">Votre spécialité</div>
              <strong>{game.role.name}</strong> — <span className="small">{game.role.description}</span>
            </div>
          )}
        </>
      )}

      {section === 'evidence' && (
        <>
          {d.evidence.length === 0 && <div className="empty small">Aucune pièce lue. Fouillez, ouvrez, déverrouillez, lisez.</div>}
          {[...d.evidence].reverse().map((e) => (
            <EvidenceCard
              key={e.objectId}
              e={e}
              actions={
                free && (
                  <button className="btn btn-xs" onClick={() => present(e)}>
                    Verser au dossier commun…
                  </button>
                )
              }
            />
          ))}
        </>
      )}

      {section === 'journal' && (
        <>
          {[...game.knowledge].reverse().map((k) => (
            <div key={k.id} className={`note note-${k.kind} ${k.important ? 'important' : ''}`}>
              <span className="note-icon" title={k.kind}>{KIND_ICON[k.kind]}</span>
              <div className="grow">
                <div className="note-text">{k.text}</div>
                <div className="note-meta">
                  {formatClock(k.at)}
                  {k.sourceName && ` · transmis par ${k.sourceName}`}
                </div>
              </div>
              {free && k.kind !== 'secret' && (
                <button
                  className="btn btn-xs btn-ghost"
                  title="Transmettre"
                  onClick={() =>
                    ask('Transmettre cette note à…', [{ id: 'allies', label: '🛡️ Mes allié·es' }, ...others.map((p) => ({ id: p.id, label: `✉ ${p.name}` }))], (to) =>
                      to === 'allies' ? act({ type: 'share', knowledgeId: k.id, to: 'allies' }) : act({ type: 'share', knowledgeId: k.id, to: 'player', targetId: to }),
                    )
                  }
                >
                  ↗
                </button>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
