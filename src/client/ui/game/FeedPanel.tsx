import { useEffect, useMemo, useRef, useState } from 'react';
import { formatClock } from '@shared/config';
import type { FeedMessage } from '@shared/types';
import { useStore } from '../../store';

export function FeedPanel() {
  const EMPTY: never[] = [];
  const feed = useStore((s) => s.game?.feed) ?? EMPTY;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' });
  }, [feed.length]);
  return (
    <div className="panel feed-panel" ref={ref}>
      {feed.map((m) => (
        <div key={m.id} className={`feed-line feed-${m.style}`}>
          <span className="feed-time">{formatClock(m.at)}</span> {m.text}
        </div>
      ))}
    </div>
  );
}

const FILTERS = [
  { id: 'all', label: 'Tout' },
  { id: 'danger', label: 'Accusations et votes' },
  { id: 'public', label: 'Annonces' },
  { id: 'me', label: 'Pour moi' },
] as const;

/**
 * Chronique de la nuit : tout ce qui a été annoncé (accusations, défenses, alibis, pièces versées, révélations,
 * bruits, messages personnels), consultable à tout moment, du plus récent au plus ancien.
 */
export function ChronicleTab() {
  const EMPTY: never[] = [];
  const feed = useStore((s) => s.game?.feed) ?? EMPTY;
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all');
  const lines = useMemo(() => {
    const keep = (m: FeedMessage) =>
      filter === 'all' ? true : filter === 'danger' ? m.style === 'danger' : filter === 'public' ? m.style === 'announce' || m.style === 'narration' : m.style === 'whisper' || m.style === 'system';
    return [...feed].filter(keep).reverse();
  }, [feed, filter]);
  return (
    <div className="chronicle">
      <div className="chips-row">
        {FILTERS.map((f) => (
          <button key={f.id} className={`chip-btn ${filter === f.id ? 'active' : ''}`} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>
      {!lines.length && <div className="empty small">Rien pour l’instant.</div>}
      {lines.map((m) => (
        <div key={m.id} className={`feed-line feed-${m.style}`}>
          <span className="feed-time">{formatClock(m.at)}</span> {m.text}
        </div>
      ))}
    </div>
  );
}

/** Grande narration au centre de l'écran pour les moments clés. */
export function Announcement() {
  const feed = useStore((s) => s.game?.feed);
  const [current, setCurrent] = useState<FeedMessage | null>(null);
  const seen = useRef<string | null>(null);
  useEffect(() => {
    if (!feed?.length) return;
    const last = [...feed].reverse().find((m) => m.style !== 'whisper' && m.style !== 'system');
    if (!last || last.id === seen.current) return;
    const firstLoad = seen.current === null;
    seen.current = last.id;
    // à la reconnexion, on ne rejoue pas une vieille narration
    if (firstLoad && feed.length > 3) return;
    setCurrent(last);
  }, [feed]);
  useEffect(() => {
    if (!current) return;
    const t = setTimeout(() => setCurrent(null), Math.max(4500, current.text.length * 55));
    return () => clearTimeout(t);
  }, [current]);
  if (!current) return null;
  return (
    <div key={current.id} className={`announcement announcement-${current.style}`} onClick={() => setCurrent(null)}>
      {current.text}
    </div>
  );
}
