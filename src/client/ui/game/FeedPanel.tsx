import { useEffect, useRef, useState } from 'react';
import { formatClock } from '@shared/config';
import type { FeedMessage } from '@shared/types';
import { useStore } from '../../store';
import { audio } from '../../audio';

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
    if (last.style === 'danger') audio.thunder();
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
