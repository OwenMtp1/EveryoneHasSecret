import type { ReactNode } from 'react';
import { objectTypeDef } from '@shared/content/objects';
import type { RelationType } from '@shared/types';
import { useStore } from '../../store';
import { act, computeNearby, REL_LABEL, useChatFocus, usePicker } from './helpers';

/** Barre d'interactions contextuelles : ce qui est à portée, maintenant. */
export function ActionBar() {
  const game = useStore((s) => s.game);
  const ask = usePicker((s) => s.ask);
  const setChannel = useChatFocus((s) => s.setChannel);
  if (!game || !game.alive || game.epilogue) return null;
  const n = computeNearby(game);
  const inv = game.inventory;
  const cloth = inv.find((o) => objectTypeDef(o.type)?.tags.includes('cleaning'));
  const role = game.role;
  const tool = (id: string) => role?.tools.find((t) => t.id === id);
  const items: ReactNode[] = [];

  for (const o of n.objects) {
    items.push(
      <div key={o.id} className="action-group">
        <span className="action-label">{o.icon} {o.name}</span>
        <button className="btn btn-sm" onClick={() => act({ type: 'take', objectId: o.id })}>Prendre</button>
        <button className="btn btn-sm btn-ghost" onClick={() => act({ type: 'examine', objectId: o.id })}>Examiner</button>
        {tool('analyze_prints') && <button className="btn btn-sm btn-ghost" onClick={() => act({ type: 'tool', toolId: 'analyze_prints', targetId: o.id })}>Analyser</button>}
        {cloth && <button className="btn btn-sm btn-ghost" onClick={() => act({ type: 'clean', toolId: cloth.id, targetKind: 'object', targetId: o.id })}>Essuyer</button>}
      </div>,
    );
  }
  for (const b of n.bodies) {
    items.push(
      <div key={b.id} className="action-group danger">
        <span className="action-label">⚰️ Corps de {b.name}</span>
        {tool('examine_body') && <button className="btn btn-sm" onClick={() => act({ type: 'tool', toolId: 'examine_body' })}>Autopsie</button>}
      </div>,
    );
  }
  for (const f of n.furniture) {
    const btns: ReactNode[] = [];
    if (f.hiding) btns.push(<button key="s" className="btn btn-sm" onClick={() => act({ type: 'search', furnitureId: f.id })}>Fouiller</button>);
    if (f.hiding && inv.length)
      btns.push(
        <button key="h" className="btn btn-sm btn-ghost" onClick={() => ask(`Cacher dans : ${f.name}`, inv.map((o) => ({ id: o.id, label: `${o.icon} ${o.name}` })), (id) => act({ type: 'hide', objectId: id, furnitureId: f.id }))}>
          Cacher…
        </button>,
      );
    if (f.kind === 'sink') btns.push(<button key="w" className="btn btn-sm" onClick={() => act({ type: 'wash' })}>Se laver les mains</button>);
    if (f.kind === 'terminal' && tool('camera_logs')) btns.push(<button key="c" className="btn btn-sm" onClick={() => act({ type: 'tool', toolId: 'camera_logs' })}>Consulter les caméras</button>);
    if (f.kind === 'fireplace' && inv.some((o) => objectTypeDef(o.type)?.tags.includes('destructible')))
      btns.push(
        <button key="b" className="btn btn-sm btn-ghost" onClick={() => ask('Jeter au feu', inv.filter((o) => objectTypeDef(o.type)?.tags.includes('destructible')).map((o) => ({ id: o.id, label: `${o.icon} ${o.name}` })), (id) => act({ type: 'destroy', objectId: id }))}>
          Brûler…
        </button>,
      );
    if (btns.length)
      items.push(
        <div key={f.id} className="action-group">
          <span className="action-label">{f.name}</span>
          {btns}
        </div>,
      );
  }
  for (const p of n.players) {
    const rels: RelationType[] = ['FRIEND', 'ALLY', 'PACT', 'ENEMY', 'VENDETTA'];
    items.push(
      <div key={p.id} className="action-group">
        <span className="action-label">👤 {p.name}</span>
        <button className="btn btn-sm btn-ghost" onClick={() => setChannel(`dm:${p.id}`)}>Murmurer</button>
        <button className="btn btn-sm btn-ghost" onClick={() => ask(`Relation avec ${p.name}`, rels.map((r) => ({ id: r, label: r === 'ENEMY' || r === 'VENDETTA' ? `Déclarer : ${REL_LABEL[r]}` : `Proposer : ${REL_LABEL[r]}`, hint: r === 'PACT' ? 'secret, inventaires partagés' : r === 'VENDETTA' ? 'secrète, exige un mobile' : r === 'ALLY' ? 'canal privé, positions partagées' : undefined })), (r) => act({ type: 'relation', op: 'propose', relType: r as RelationType, targetId: p.id }))}>
          Relation…
        </button>
        {inv.length > 0 && (
          <button className="btn btn-sm btn-ghost" onClick={() => ask(`Donner à ${p.name}`, inv.map((o) => ({ id: o.id, label: `${o.icon} ${o.name}` })), (id) => act({ type: 'give', objectId: id, targetId: p.id }))}>
            Donner…
          </button>
        )}
        {tool('take_prints') && <button className="btn btn-sm" onClick={() => act({ type: 'tool', toolId: 'take_prints', targetId: p.id })}>Empreintes</button>}
        {tool('examine_shoes') && <button className="btn btn-sm" onClick={() => act({ type: 'tool', toolId: 'examine_shoes', targetId: p.id })}>Semelles</button>}
      </div>,
    );
  }
  if (cloth)
    for (const t of n.traces.filter((x) => ['footprint', 'blood_pool'].includes(x.kind)).slice(0, 2))
      items.push(
        <div key={t.id} className="action-group">
          <span className="action-label">{t.label}</span>
          <button className="btn btn-sm btn-ghost" onClick={() => act({ type: 'clean', toolId: cloth.id, targetKind: 'trace', targetId: t.id })}>Nettoyer</button>
        </div>,
      );

  // rien à proximité : écran libre (les raccourcis restent rappelés en bas à gauche)
  if (!items.length) return null;
  return <div className="action-bar">{items.slice(0, 6)}</div>;
}
