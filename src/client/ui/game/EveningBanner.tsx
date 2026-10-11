import { useEffect, useRef, useState } from 'react';
import { GAME_CONFIG } from '@shared/config';
import { useStore } from '../../store';

/**
 * Grandes annonces de la soirée, en haut de l'écran : jalons de l'horloge de jeu (22h15, 22h30…)
 * et moments clés (coupure de courant, dernières minutes, arrivée de la police).
 * Uniquement des repères d'ambiance et de rythme : aucune information secrète.
 */
interface Beat {
  time: string;
  title: string;
  sub: string;
}

const CLOCK_BEATS: { at: number; beat: Beat }[] = [
  { at: 22 * 60 + 15, beat: { time: '22h15', title: 'Visite de la villa', sub: 'Chaque pièce, chaque armoire, chaque tiroir peut cacher quelque chose.' } },
  { at: 22 * 60 + 30, beat: { time: '22h30', title: 'Il est temps de choisir vos chambres', sub: 'Personne ne quittera la villa cette nuit. Mieux vaut savoir qui dort où… et avec qui.' } },
  { at: 23 * 60, beat: { time: '23h00', title: 'Le réseau ne passe plus', sub: 'La route est coupée par l’orage. Vous n’êtes plus qu’entre vous.' } },
  { at: 23 * 60 + 30, beat: { time: '23h30', title: 'L’heure des alibis', sub: 'Où étiez-vous entre 21h et 22h ? Déclarez-le — ou mentez bien.' } },
  { at: 24 * 60, beat: { time: 'Minuit', title: 'Les mensonges commencent à se voir', sub: 'Versez vos pièces au dossier commun. Comparez les versions.' } },
  { at: 24 * 60 + 30, beat: { time: '00h30', title: 'La nuit avance', sub: 'Accusez si vous êtes sûrs. Le meurtrier, lui, attend son heure.' } },
];

const SHOW_MS = 6500;

export function EveningBanner({ hold }: { hold: boolean }) {
  const clock = useStore((s) => s.game?.clock);
  const phase = useStore((s) => s.game?.phase);
  const blackout = useStore((s) => s.game?.blackout);
  const endsAt = useStore((s) => s.game?.caseInfo?.endsAt);
  const [queue, setQueue] = useState<Beat[]>([]);
  const [current, setCurrent] = useState<Beat | null>(null);
  const last = useRef<{ clock?: number; phase?: string; blackout?: boolean; final?: boolean }>({});

  const push = (b: Beat) => setQueue((q) => [...q, b]);
  const hhmm = () => (clock === undefined ? '' : fmt(clock));

  // jalons de l'horloge : seulement ceux franchis pendant qu'on regarde (pas de rattrapage à la reconnexion)
  useEffect(() => {
    if (clock === undefined) return;
    const prev = last.current.clock;
    last.current.clock = clock;
    if (prev === undefined || clock <= prev) return;
    // l'horloge peut dépasser minuit (> 1440) ou repartir de 0 selon la source : on compare sur 48 h
    const norm = (m: number) => (m < GAME_CONFIG.startClockMinutes - 60 ? m + 1440 : m);
    for (const { at, beat } of CLOCK_BEATS) if (norm(prev) < at && norm(clock) >= at) push(beat);
  }, [clock]);

  useEffect(() => {
    const prev = last.current.blackout;
    last.current.blackout = blackout;
    if (prev === false && blackout) push({ time: hhmm(), title: 'Coupure de courant', sub: 'Dans le noir, tout peut arriver.' });
    if (prev === true && blackout === false) push({ time: hhmm(), title: 'La lumière revient', sub: 'Regardez bien qui est où.' });
  }, [blackout]);

  useEffect(() => {
    const prev = last.current.phase;
    last.current.phase = phase;
    if (prev && prev !== 'RESOLUTION' && phase === 'RESOLUTION') push({ time: 'À l’aube', title: 'La police arrive', sub: 'Délibération finale : désignez le meurtrier.' });
  }, [phase]);

  // dernières minutes avant la délibération finale
  useEffect(() => {
    if (!endsAt || phase !== 'INVESTIGATION') return;
    const left = endsAt - Date.now() - 120_000;
    if (left < 0) return;
    const t = setTimeout(() => {
      if (last.current.final) return;
      last.current.final = true;
      push({ time: 'Plus que 2 minutes', title: 'La police est en route', sub: 'Dernières fouilles, dernières alliances. Préparez votre vote.' });
    }, left);
    return () => clearTimeout(t);
  }, [endsAt, phase]);

  useEffect(() => {
    if (current || hold || !queue.length) return;
    setCurrent(queue[0]);
    setQueue((q) => q.slice(1));
  }, [queue, current, hold]);

  useEffect(() => {
    if (!current) return;
    const t = setTimeout(() => setCurrent(null), SHOW_MS);
    return () => clearTimeout(t);
  }, [current]);

  if (!current) return null;
  return (
    <div className="evening-banner" role="status" key={current.title}>
      <div className="evening-time">{current.time}</div>
      <div className="evening-title">{current.title}</div>
      <div className="evening-sub">{current.sub}</div>
    </div>
  );
}

function fmt(m: number) {
  const x = ((Math.floor(m) % 1440) + 1440) % 1440;
  const h = Math.floor(x / 60);
  const mm = x % 60;
  return `${String(h).padStart(2, '0')}h${String(mm).padStart(2, '0')}`;
}
