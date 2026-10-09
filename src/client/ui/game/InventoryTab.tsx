import { allFurniture } from '@shared/content/villa';
import { GAME_CONFIG } from '@shared/config';
import type { ObjectView } from '@shared/types';
import { objectTypeDef } from '@shared/content/objects';
import { useStore } from '../../store';
import { act, usePicker } from './helpers';

const near = (a: { x: number; y: number }, b: { x: number; y: number }, r: number) => Math.hypot(a.x - b.x, a.y - b.y) <= r;

/** Inventaire : chaque bouton correspond à une interaction réellement possible côté serveur. */
export function InventoryTab() {
  const game = useStore((s) => s.game)!;
  const picker = usePicker();
  const me = game.players.find((p) => p.id === game.you);
  const inv = game.inventory;
  const R = GAME_CONFIG.interactRange;
  const furniture = me?.pos ? allFurniture().filter((f) => f.roomId === me.roomId && near({ x: Math.max(f.x, Math.min(me.pos!.x, f.x + f.w)), y: Math.max(f.y, Math.min(me.pos!.y, f.y + f.h)) }, me.pos!, R)) : [];
  const hiding = furniture.filter((f) => f.hiding);
  const fireplace = furniture.some((f) => f.kind === 'fireplace');
  const lighter = inv.some((o) => o.type === 'lighter');
  const cloth = inv.find((o) => o.type === 'cloth');
  const players = game.players.filter((p) => p.id !== game.you && p.alive && p.pos && me?.pos && p.roomId === me.roomId && near(p.pos, me.pos, R + 0.4));
  const nearbyDevices = game.objects.filter((o) => (o.type === 'laptop' || o.type === 'camera') && o.pos && me?.pos && o.roomId === me.roomId && near(o.pos, me.pos, R));
  const devices = [...inv.filter((o) => o.type === 'laptop' || o.type === 'camera'), ...nearbyDevices];
  const free = game.alive && !game.arrested.includes(game.you) && !game.epilogue;

  const buttons = (o: ObjectView) => {
    const caps = o.caps ?? [];
    const b: { label: string; run: () => void; danger?: boolean }[] = [];
    b.push({ label: caps.includes('read') ? 'Lire' : 'Examiner', run: () => act({ type: 'examine', objectId: o.id }) });
    if (caps.includes('code')) b.push({ label: 'Saisir le code', run: () => picker.askText(o.name, o.lockHint ?? 'Code', (code) => act({ type: 'unlock', objectId: o.id, code })) });
    if (caps.includes('key')) b.push({ label: 'Ouvrir (clé)', run: () => act({ type: 'open', objectId: o.id }) });
    if (caps.includes('eject')) b.push({ label: 'Retirer le support', run: () => act({ type: 'open', objectId: o.id }) });
    if (caps.includes('insert')) {
      const compatible = devices.filter((d) => (objectTypeDef(o.type)?.readBy ?? []).includes(d.type));
      b.push({
        label: 'Lire dans…',
        run: () => (compatible.length ? picker.ask(`Lire ${o.name} dans…`, compatible.map((d) => ({ id: d.id, label: `${d.icon} ${d.name}`, hint: d.locked ? 'verrouillé' : undefined })), (did) => act({ type: 'insert', mediaId: o.id, deviceId: did })) : useStore.getState().flash('Aucun appareil compatible à portée (ordinateur ou appareil photo).', true)),
      });
    }
    if (caps.includes('wear')) b.push({ label: o.worn ? 'Retirer les gants' : 'Enfiler', run: () => act({ type: 'use', objectId: o.id }) });
    if (caps.includes('light')) b.push({ label: o.lit ? 'Éteindre' : 'Allumer', run: () => act({ type: 'use', objectId: o.id }) });
    b.push({ label: 'Poser', run: () => act({ type: 'drop', objectId: o.id }) });
    if (hiding.length) b.push({ label: 'Cacher…', run: () => picker.ask(`Cacher ${o.name} dans…`, hiding.map((f) => ({ id: f.id, label: f.name })), (fid) => act({ type: 'hide', objectId: o.id, furnitureId: fid })) });
    if (players.length) b.push({ label: 'Donner…', run: () => picker.ask(`Donner ${o.name} à…`, players.map((p) => ({ id: p.id, label: p.name })), (pid) => act({ type: 'give', objectId: o.id, targetId: pid })) });
    if (cloth && cloth.id !== o.id) b.push({ label: 'Essuyer', run: () => act({ type: 'clean', toolId: cloth.id, targetKind: 'object', targetId: o.id }) });
    if (caps.includes('burn') && (lighter || fireplace)) b.push({ label: 'Brûler', danger: true, run: () => confirm(`Brûler définitivement ${o.name} ? Des cendres resteront.`) && act({ type: 'destroy', objectId: o.id }) });
    if (game.role?.tools.some((t) => t.id === 'analyze_prints')) b.push({ label: 'Analyser', run: () => act({ type: 'tool', toolId: 'analyze_prints', targetId: o.id }) });
    if (o.locked && game.role?.tools.some((t) => t.id === 'bypass_lock' && (t.usesLeft ?? 1) > 0)) b.push({ label: 'Contourner', run: () => act({ type: 'tool', toolId: 'bypass_lock', targetId: o.id }) });
    return b;
  };

  return (
    <div className="inventory">
      <div className="field-label">
        Inventaire ({inv.length}/{GAME_CONFIG.inventorySize}) — invisible pour les autres.
      </div>
      {inv.length === 0 && <div className="empty small">Vos poches sont vides. Visez un objet et appuyez sur E pour le ramasser.</div>}
      {inv.map((o) => (
        <div key={o.id} className={`inv-item ${o.bloody ? 'bloody' : ''}`}>
          <div className="inv-icon">{o.icon}</div>
          <div className="grow">
            <div className="inv-name">
              {o.name} {o.locked && <span className="chip">🔒 verrouillé</span>} {o.known && <span className="chip">lu</span>} {o.worn && <span className="chip">portés</span>} {o.lit && <span className="chip">allumée</span>}{' '}
              {o.bloody && <span className="chip chip-danger">taché de sang</span>}
            </div>
            {free && (
              <div className="inv-actions">
                {buttons(o).map((b) => (
                  <button key={b.label} className={`btn btn-xs ${b.danger ? 'btn-ghost danger' : ''}`} onClick={b.run}>
                    {b.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
      <div className="field-label">Cachettes de la pièce</div>
      <div className="small muted">{allFurniture().filter((f) => f.hiding && f.roomId === me?.roomId).map((f) => f.name).join(' · ') || '—'}</div>
    </div>
  );
}
