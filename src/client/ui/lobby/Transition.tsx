import { useEffect, useState } from 'react';
import { formatClock } from '@shared/config';
import { useStore } from '../../store';

/** Transition cinématique vers la villa : écran noir, heure, nom du lieu. */
export function Transition() {
  const t = useStore((s) => s.transition);
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!t) return;
    setStep(0);
    const d = t.durationMs;
    const timers = [setTimeout(() => setStep(1), d * 0.12), setTimeout(() => setStep(2), d * 0.38), setTimeout(() => setStep(3), d * 0.62), setTimeout(() => setStep(4), d * 0.9)];
    return () => timers.forEach(clearTimeout);
  }, [t]);
  if (!t) return null;
  return (
    <div className={`transition step-${step}`}>
      <div className="transition-rain" />
      <div className="transition-clock">{formatClock(t.clock)}</div>
      <div className="transition-title">{t.title}</div>
      <div className="transition-dots">. . .</div>
    </div>
  );
}
