import { useState } from 'react';
import { formatClock } from '@shared/config';
import { useStore } from '../../store';
import { CastPhoto } from '../common/CastPortrait';
import { computeLeads } from './Guidance';
import { useChatFocus } from './helpers';

/** Heure (minutes) à partir de laquelle l'orage coupe le réseau (annonce de 23h00). */
const NO_NETWORK_AT = 23 * 60;

/**
 * Téléphone du personnage (touche P) : un point d'accès « dans le monde » aux outils du joueur — messages, dossier,
 * photos lues, pistes, plan, chronique. Les applications ouvrent les panneaux habituels.
 */
export function Phone({ onClose, onMap }: { onClose: () => void; onMap: () => void }) {
  const game = useStore((s) => s.game);
  const [app, setApp] = useState<'home' | 'photos' | 'leads'>('home');
  if (!game) return null;
  const ui = useChatFocus.getState();
  const noNetwork = game.clock >= NO_NETWORK_AT;
  const photos = (game.dossier?.evidence ?? []).flatMap((e) => (e.photos ?? []).map((p) => ({ ...p, title: e.title })));
  const leads = computeLeads(game);
  const open = (fn: () => void) => () => {
    onClose();
    fn();
  };
  const APPS = [
    { icon: '💬', label: 'Messages', run: open(() => ui.setChatOpen(true)) },
    { icon: '📁', label: 'Dossier', run: open(() => ui.setTab(0)) },
    { icon: '🖼️', label: 'Photos', run: () => setApp('photos'), badge: photos.length || null },
    { icon: '🧭', label: 'Pistes', run: () => setApp('leads'), badge: leads.filter((l) => !l.done).length || null },
    { icon: '🗺️', label: 'Plan', run: open(onMap) },
    { icon: '📜', label: 'Chronique', run: open(() => ui.setTab(4)) },
    { icon: '🔎', label: 'Enquête', run: open(() => ui.setTab(2)) },
    { icon: '👥', label: 'Relations', run: open(() => ui.setTab(3)) },
  ];
  return (
    <div className="phone-backdrop" onClick={onClose}>
      <div className="phone fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="phone-status">
          <span>{formatClock(game.clock)}</span>
          <span>{noNetwork ? '✕ Pas de réseau' : '▂▄▆ Réseau faible'}</span>
          <span>🔋 {Math.max(8, 74 - Math.floor((game.clock - 22 * 60) / 6))}%</span>
        </div>
        {app === 'home' && (
          <>
            <div className="phone-clock">{formatClock(game.clock)}</div>
            <div className="phone-sub">Villa Beaumont{noNetwork ? ' — l’orage a coupé le réseau' : ''}</div>
            <div className="phone-apps">
              {APPS.map((a) => (
                <button key={a.label} className="phone-app" onClick={a.run}>
                  <span className="phone-app-icon">{a.icon}</span>
                  {a.label}
                  {a.badge ? <span className="badge">{a.badge}</span> : null}
                </button>
              ))}
            </div>
          </>
        )}
        {app === 'photos' && (
          <div className="phone-screen">
            <button className="phone-back" onClick={() => setApp('home')}>‹ Photos</button>
            {photos.length === 0 && <div className="small muted">Aucune photo pour l’instant. Les photos des pièces que vous lisez s’ajoutent ici.</div>}
            {photos.map((p, i) => (
              <figure key={i} className="phone-photo">
                <CastPhoto spec={{ castIds: p.castIds, scene: p.scene, caption: p.caption, seed: p.seed }} width={220} />
                <figcaption className="small muted">{p.title}</figcaption>
              </figure>
            ))}
          </div>
        )}
        {app === 'leads' && (
          <div className="phone-screen">
            <button className="phone-back" onClick={() => setApp('home')}>‹ Pistes</button>
            <ul className="phone-leads">
              {leads.map((l) => (
                <li key={l.text} className={l.done ? 'done' : ''}>
                  {l.done ? '✓' : '○'} {l.text}
                </li>
              ))}
            </ul>
          </div>
        )}
        <button className="phone-home" onClick={() => (app === 'home' ? onClose() : setApp('home'))} aria-label="Accueil" />
      </div>
    </div>
  );
}
