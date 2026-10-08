import { useEffect, useRef } from 'react';
import { introSchedule, type IntroPlan } from '@shared/content/intro';

/** Vitesse de frappe (ms par caractère) : première ligne vive, seconde plus lente. */
const LINE1_MS = 40;
const LINE2_MS = 75;

/**
 * Textes de la cinématique, en bas de l'écran, petits, jaunes, tapés lettre à lettre.
 * Le texte affiché ne dépend que de l'horloge commune : chaque joueur voit la même lettre au même moment.
 */
export function IntroText({ plan, elapsed }: { plan: IntroPlan; elapsed: () => number }) {
  const l1 = useRef<HTMLDivElement>(null);
  const l2 = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const c = plan.config;
    const line1 = `${c.locationName} — ${c.time} — ${c.description}`;
    const line2 = c.tagline;
    const sched = introSchedule(plan.durationMs);
    const at = (s: string) => sched.find((x) => x.state === s)!.at;
    const reveal = at('INTRO_REVEAL');
    const villa = at('INTRO_VILLA');
    const end = plan.durationMs;
    // la 1re ligne apparaît quand le véhicule se dévoile, la 2de pendant le plan sur la villa
    const start1 = reveal + (villa - reveal) * 0.35;
    const start2 = villa + (end - villa) * 0.15;
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const t = elapsed();
      const n1 = Math.max(0, Math.min(line1.length, Math.floor((t - start1) / LINE1_MS)));
      const n2 = Math.max(0, Math.min(line2.length, Math.floor((t - start2) / LINE2_MS)));
      if (l1.current && l1.current.textContent!.length !== n1) l1.current.textContent = line1.slice(0, n1);
      if (l2.current && l2.current.textContent!.length !== n2) l2.current.textContent = line2.slice(0, n2);
      if (box.current) box.current.style.opacity = String(t > end - 700 ? Math.max(0, (end - t) / 700) : 1);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [plan, elapsed]);

  return (
    <div className="intro-text" ref={box}>
      <div className="intro-line" ref={l1} />
      <div className="intro-line slow" ref={l2} />
    </div>
  );
}
