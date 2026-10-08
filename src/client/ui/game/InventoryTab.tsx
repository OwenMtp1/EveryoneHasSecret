import { objectTypeDef } from '@shared/content/objects';
import { allFurniture } from '@shared/content/villa';
import { useStore } from '../../store';
import { GAME_CONFIG } from '@shared/config';
import { act, computeNearby, usePicker } from './helpers';

export function InventoryTab() {
  const game = useStore((s) => s.game)!;
  const ask = usePicker((s) => s.ask);
  const n = computeNearby(game);
  const inv = game.inventory;
  const hidingSpots = n.furniture.filter((f) => f.hiding);
  const cleaning = inv.find((o) => objectTypeDef(o.type)?.tags.includes('cleaning'));
  const hasFire = inv.some((o) => objectTypeDef(o.type)?.tags.includes('fire'));
  const nearFireplace = n.furniture.some((f) => f.kind === 'fireplace');
  const scientist = game.role?.tools.some((t) => t.id === 'analyze_prints');

  return (
    <div className="inventory">
      <div className="field-label">
        Inventaire ({inv.length}/{GAME_CONFIG.inventorySize}) — personne ne le voit, sauf vos partenaires de pacte.
      </div>
      {inv.length === 0 && <div className="empty small">Vos poches sont vides.</div>}
      {inv.map((o) => {
        const def = objectTypeDef(o.type);
        const tags = def?.tags ?? [];
        return (
          <div key={o.id} className={`inv-item ${o.bloody ? 'bloody' : ''}`}>
            <div className="inv-icon">{o.icon}</div>
            <div className="grow">
              <div className="inv-name">
                {o.name} {o.lit && <span className="chip">allumée</span>} {o.bloody && <span className="chip chip-danger">taché de sang</span>}
              </div>
              <div className="inv-actions">
                <button className="btn btn-xs" onClick={() => act({ type: 'examine', objectId: o.id })}>Examiner</button>
                {def?.useEffect && def.useEffect !== 'none' && <button className="btn btn-xs" onClick={() => act({ type: 'use', objectId: o.id })}>{def.useEffect === 'toggle_light' ? (o.lit ? 'Éteindre' : 'Allumer') : def.useEffect === 'read' || def.useEffect === 'phone' ? 'Lire' : 'Utiliser'}</button>}
                <button className="btn btn-xs btn-ghost" onClick={() => act({ type: 'drop', objectId: o.id })}>Poser</button>
                {hidingSpots.length > 0 && (
                  <button className="btn btn-xs btn-ghost" onClick={() => ask(`Cacher ${o.name} dans…`, hidingSpots.map((f) => ({ id: f.id, label: f.name })), (fid) => act({ type: 'hide', objectId: o.id, furnitureId: fid }))}>
                    Cacher
                  </button>
                )}
                {n.players.length > 0 && (
                  <button className="btn btn-xs btn-ghost" onClick={() => ask(`Donner ${o.name} à…`, n.players.map((p) => ({ id: p.id, label: p.name })), (pid) => act({ type: 'give', objectId: o.id, targetId: pid }))}>
                    Donner
                  </button>
                )}
                {cleaning && cleaning.id !== o.id && <button className="btn btn-xs btn-ghost" onClick={() => act({ type: 'clean', toolId: cleaning.id, targetKind: 'object', targetId: o.id })}>Essuyer</button>}
                {tags.includes('destructible') && (hasFire || nearFireplace) && <button className="btn btn-xs btn-ghost danger" onClick={() => confirm(`Brûler ${o.name} ?`) && act({ type: 'destroy', objectId: o.id })}>Brûler</button>}
                {scientist && <button className="btn btn-xs" onClick={() => act({ type: 'tool', toolId: 'analyze_prints', targetId: o.id })}>Analyser</button>}
              </div>
            </div>
          </div>
        );
      })}
      {n.objects.length > 0 && (
        <>
          <div className="field-label">À portée</div>
          {n.objects.map((o) => (
            <div key={o.id} className="inv-item ground">
              <div className="inv-icon">{o.icon}</div>
              <div className="grow inv-name">{o.name}</div>
              <button className="btn btn-xs" onClick={() => act({ type: 'take', objectId: o.id })}>Prendre</button>
            </div>
          ))}
        </>
      )}
      {game.pactInventories.length > 0 && (
        <>
          <div className="field-label">Poches de vos partenaires de pacte</div>
          {game.pactInventories.map((pi) => (
            <div key={pi.playerId} className="small">
              <strong>{game.players.find((p) => p.id === pi.playerId)?.name}</strong> : {pi.items.join(', ') || 'rien'}
            </div>
          ))}
        </>
      )}
      <div className="field-label">Cachettes de la pièce</div>
      <div className="small muted">
        {allFurniture().filter((f) => f.hiding && f.roomId === n.me?.roomId).map((f) => f.name).join(' · ') || '—'}
      </div>
    </div>
  );
}
