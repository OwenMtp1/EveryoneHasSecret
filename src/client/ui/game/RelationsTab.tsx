import type { RelationType } from '@shared/types';
import { useStore } from '../../store';
import { Portrait } from '../common/Avatar';
import { act, REL_LABEL, useChatFocus } from './helpers';

const PROPOSE: RelationType[] = ['FRIEND', 'ALLY', 'PACT'];

export function RelationsTab() {
  const game = useStore((s) => s.game)!;
  const setChannel = useChatFocus((s) => s.setChannel);
  const others = game.players.filter((p) => p.id !== game.you);
  const incoming = game.relations.filter((r) => r.status === 'pending' && r.to === game.you);

  return (
    <div className="relations">
      {incoming.length > 0 && (
        <div className="incoming">
          {incoming.map((r) => (
            <div key={r.id} className="incoming-item">
              <strong>{game.players.find((p) => p.id === r.from)?.name}</strong> vous propose : {REL_LABEL[r.type]}
              <div className="row-actions">
                <button className="btn btn-xs btn-primary" onClick={() => act({ type: 'relation', op: 'accept', relationId: r.id })}>Accepter</button>
                <button className="btn btn-xs btn-ghost" onClick={() => act({ type: 'relation', op: 'decline', relationId: r.id })}>Refuser</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="small muted">
        Amitié, alliance et pacte se proposent en face à face. Alliés et partenaires de pacte partagent un canal privé et leur position ; un pacte partage aussi les poches — le rompre est une trahison.
      </p>
      {others.map((p) => {
        const rels = game.relations.filter((r) => (r.from === p.id || r.to === p.id) && r.status !== 'broken');
        const sameRoom = !!p.pos && !p.viaAlliance;
        return (
          <div key={p.id} className={`rel-card ${p.alive ? '' : 'dead'}`}>
            <Portrait character={p.character} size={42} />
            <div className="grow">
              <div className="rel-name">
                {p.name} {!p.alive && <span className="chip chip-danger">mort·e</span>} {!p.connected && p.alive && <span className="chip">absent·e</span>}
              </div>
              <div className="rel-tags">
                {rels.length === 0 && <span className="muted small">Aucun lien</span>}
                {rels.map((r) => (
                  <span key={r.id} className={`rel-tag rel-${r.type.toLowerCase()} ${r.status}`} title={r.history.map((h) => h.text).join(' → ')}>
                    {REL_LABEL[r.type]}
                    {r.status === 'pending' && ' (en attente)'}
                    {r.type === 'ENEMY' && r.to === game.you && ' (envers vous)'}
                    {r.status === 'active' && (r.from === game.you || ['FRIEND', 'ALLY', 'PACT'].includes(r.type)) && (
                      <button className="tag-x" title="Rompre" onClick={() => confirm(r.type === 'PACT' ? 'Rompre le pacte est une TRAHISON. Continuer ?' : 'Rompre ce lien ?') && act({ type: 'relation', op: 'break', relationId: r.id })}>×</button>
                    )}
                  </span>
                ))}
              </div>
              {p.alive && game.alive && !game.epilogue && (
                <div className="inv-actions">
                  <button className="btn btn-xs btn-ghost" onClick={() => setChannel(`dm:${p.id}`)}>✉ Message</button>
                  {PROPOSE.map((t) => (
                    <button key={t} className="btn btn-xs" disabled={!sameRoom} title={sameRoom ? '' : 'Rejoignez cette personne'} onClick={() => act({ type: 'relation', op: 'propose', relType: t, targetId: p.id })}>
                      {REL_LABEL[t]}
                    </button>
                  ))}
                  <button className="btn btn-xs btn-ghost danger" onClick={() => confirm(`Déclarer ${p.name} ennemi·e ? Cette personne le saura.`) && act({ type: 'relation', op: 'propose', relType: 'ENEMY', targetId: p.id })}>Ennemi·e</button>
                  <button className="btn btn-xs btn-ghost danger" onClick={() => act({ type: 'relation', op: 'propose', relType: 'VENDETTA', targetId: p.id })}>Vendetta</button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
