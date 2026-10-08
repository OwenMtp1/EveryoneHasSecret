import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../../store';
import { IntroSequence } from './IntroSequence';
import { IntroText } from './IntroText';

/** Délai de sécurité : au-delà, la partie s'affiche même si le chargement n'est pas fini. */
const MAX_HOLD_MS = 6000;

/**
 * Écran de la cinématique d'arrivée (au-dessus du salon puis de la partie qui se monte en dessous).
 * Repli sans WebGL : écran noir avec les mêmes textes, au même rythme.
 */
export function IntroScreen() {
  const intro = useStore((s) => s.intro);
  const screen = useStore((s) => s.screen);
  const endIntro = useStore((s) => s.endIntro);
  const host = useRef<HTMLDivElement>(null);
  const fade = useRef<HTMLDivElement>(null);
  const seq = useRef<IntroSequence | null>(null);
  const [fallback, setFallback] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const planId = intro?.plan.id;

  // horloge commune (serveur) ; lit toujours l'état le plus récent du store
  const elapsed = useCallback(() => {
    const i = useStore.getState().intro;
    return i ? Date.now() + i.offset - i.plan.startedAt : 0;
  }, []);

  useEffect(() => {
    const i = useStore.getState().intro;
    if (!i || !host.current) return;
    setFallback(false);
    setLeaving(false);
    let s: IntroSequence | null = null;
    try {
      s = new IntroSequence(
        host.current,
        i.plan,
        () => {
          const cur = useStore.getState().intro;
          return { elapsed: elapsed(), serverState: cur?.state ?? 'INTRO_START' };
        },
        (black) => {
          if (fade.current) fade.current.style.opacity = String(black);
        },
      );
      seq.current = s;
      void s.start();
    } catch {
      setFallback(true);
    }
    return () => {
      s?.dispose();
      seq.current = null;
    };
  }, [planId, elapsed]);

  // Fin : la partie est montée en dessous et le chargement est fini → fondu de sortie
  const done = intro?.state === 'GAME_START' && screen === 'game';
  useEffect(() => {
    if (!done) return;
    let cancelled = false;
    const loaded = seq.current?.loader.ready ?? Promise.resolve();
    setWaiting(true);
    const hold = new Promise((r) => setTimeout(r, MAX_HOLD_MS));
    void Promise.race([loaded, hold]).then(() => {
      if (cancelled) return;
      setWaiting(false);
      setLeaving(true);
      setTimeout(() => !cancelled && endIntro(), 1100);
    });
    return () => {
      cancelled = true;
    };
  }, [done, endIntro]);

  if (!intro) return null;
  return (
    <div className={`intro ${leaving ? 'leaving' : ''} ${fallback ? 'fallback' : ''}`} aria-label="Cinématique d'arrivée">
      <div className="intro-stage" ref={host} />
      <div className="intro-fade" ref={fade} />
      <div className="intro-bars" />
      <IntroText plan={intro.plan} elapsed={elapsed} />
      {waiting && <div className="intro-loading">Ouverture des portes…</div>}
    </div>
  );
}
