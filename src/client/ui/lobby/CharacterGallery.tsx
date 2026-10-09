import { useState } from 'react';
import { CAST } from '@shared/content/cast';
import type { LobbyView } from '@shared/types';
import { call } from '../../net/socket';
import { attempt, useStore } from '../../store';
import { CastPortrait } from '../common/CastPortrait';

/**
 * Galerie des 40 personnages. La réservation est décidée par le serveur (atomique) : l'affichage
 * suit toujours le dernier état du salon reçu, jamais une supposition locale.
 */
export function CharacterGallery({ lobby, userId }: { lobby: LobbyView; userId: string }) {
  const [filter, setFilter] = useState<'all' | 'feminine' | 'masculine'>('all');
  const [busy, setBusy] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);
  const holder = new Map(lobby.players.filter((p) => p.castId).map((p) => [p.castId!, p]));
  const mine = lobby.players.find((p) => p.userId === userId)?.castId ?? null;
  const open = lobby.status === 'WAITING';
  const shown = CAST.filter((c) => filter === 'all' || c.gender === filter);
  const detail = CAST.find((c) => c.id === (focus ?? mine));

  const pick = async (id: string | null) => {
    if (busy || !open) return;
    setBusy(true);
    const v = await attempt(call('lobby:pick', id));
    if (v) {
      const cur = useStore.getState().lobby;
      if (!cur || v.version >= cur.version) useStore.setState({ lobby: v });
    }
    setBusy(false);
  };

  return (
    <div className="panel cast-gallery">
      <div className="cast-gallery-head">
        <strong>Choisissez votre personnage</strong>
        <div className="seg">
          {(['all', 'feminine', 'masculine'] as const).map((f) => (
            <button key={f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
              {{ all: 'Tous', feminine: 'Femmes', masculine: 'Hommes' }[f]}
            </button>
          ))}
        </div>
        {mine && open && (
          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => pick(null)}>
            Libérer mon choix
          </button>
        )}
      </div>
      {detail && (
        <div className="cast-detail">
          <CastPortrait castId={detail.id} size={64} variant="card" />
          <div className="small">
            <strong>
              {detail.firstName} {detail.lastName}
            </strong>
            , {detail.age} ans — {detail.description}
            <div className="muted">
              {detail.outfit.top} · {detail.outfit.bottom} · {detail.outfit.shoes}
              {detail.outfit.accessories ? ` · ${detail.outfit.accessories}` : ''}
            </div>
          </div>
        </div>
      )}
      <div className="cast-grid">
        {shown.map((c) => {
          const h = holder.get(c.id);
          const status = !h ? 'free' : h.userId === userId ? 'mine' : 'taken';
          return (
            <button
              key={c.id}
              className={`cast-card cast-${status}`}
              disabled={busy || !open || status === 'taken'}
              onMouseEnter={() => setFocus(c.id)}
              onMouseLeave={() => setFocus(null)}
              onFocus={() => setFocus(c.id)}
              onClick={() => status === 'free' && pick(c.id)}
              title={`${c.firstName} ${c.lastName} — ${c.description}`}
            >
              <CastPortrait castId={c.id} size={72} />
              <span className="cast-name">{c.firstName}</span>
              <span className="cast-status">{status === 'free' ? 'Disponible' : status === 'mine' ? 'Sélectionné par vous' : `Indisponible — ${h!.username}`}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
