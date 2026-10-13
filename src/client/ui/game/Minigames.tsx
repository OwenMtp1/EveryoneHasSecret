import { useEffect, useRef, useState } from 'react';
import { useMinigame } from './helpers';
import { FORCE_PINS, forceCursor, forceZones } from '@shared/content/forceLock';

/** Capture le clavier tant que le mini-jeu est ouvert (rien n'atteint la vue 3D ni les raccourcis). */
function useKeys(on: boolean, handler: (e: KeyboardEvent) => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!on) return;
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      e.stopPropagation();
      if (e.repeat) return;
      ref.current(e);
    };
    window.addEventListener('keydown', down, true);
    return () => window.removeEventListener('keydown', down, true);
  }, [on]);
}

const PINS = FORCE_PINS;

/**
 * Forcer une serrure : un curseur va et vient, il faut frapper (E, Espace ou clic) quand il est dans la zone.
 * Trois goupilles, zone de plus en plus étroite ; un raté et l'outil ripe.
 */
export function ForceLockGame() {
  const open = useMinigame((s) => s.open);
  const close = useMinigame((s) => s.close);
  const [pin, setPin] = useState(0);
  const [zone, setZone] = useState({ at: 0.6, w: 0.22 });
  const [result, setResult] = useState<null | boolean>(null);
  const cursor = useRef(0);
  const barRef = useRef<HTMLDivElement>(null);
  const zones = useRef<{ at: number; w: number }[]>([]);
  const t0 = useRef(0);
  const strikes = useRef<number[]>([]);
  useEffect(() => {
    if (!open) return;
    setPin(0);
    setResult(null);
    // zones et vitesse fixées par la graine du serveur : il rejoue les frappes et décide seul de la réussite
    zones.current = forceZones(open.seed);
    setZone(zones.current[0]);
    strikes.current = [];
    let raf = 0;
    t0.current = performance.now();
    const loop = (now: number) => {
      const p = Number(barRef.current?.dataset.pin ?? 0);
      cursor.current = forceCursor(Math.max(0, now - t0.current), p);
      if (barRef.current) barRef.current.style.setProperty('--cursor', String(cursor.current));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [open]);

  const finish = (ok: boolean) => {
    setResult(ok);
    const cb = open?.onDone;
    const sent = [...strikes.current];
    setTimeout(() => {
      close();
      cb?.(sent);
    }, 700);
  };
  const strike = () => {
    if (!open || result !== null) return;
    const t = performance.now() - t0.current;
    const c = forceCursor(t, pin);
    const z = zones.current[pin];
    strikes.current.push(Math.round(t));
    if (z && Math.abs(c - z.at) <= z.w / 2) {
      const next = pin + 1;
      setPin(next);
      if (next >= PINS) return finish(true);
      setZone(zones.current[next]);
    } else finish(false);
  };
  useKeys(!!open, (e) => {
    if (e.code === 'Escape') close();
    else if (e.code === 'KeyE' || e.code === 'Space' || e.code === 'KeyF') {
      e.preventDefault();
      strike();
    }
  });
  if (!open) return null;
  return (
    <div className="modal-backdrop">
      <div className="modal minigame" onMouseDown={strike}>
        <h3>🪛 Forcer : {open.title}</h3>
        <div className="small muted">Frappez quand le curseur est dans la zone dorée — <kbd>E</kbd>, <kbd>Espace</kbd> ou clic. Échap : renoncer.</div>
        <div className="force-bar" ref={barRef} data-pin={pin}>
          <div className="force-zone" style={{ left: `${(zone.at - zone.w / 2) * 100}%`, width: `${zone.w * 100}%` }} />
          <div className="force-cursor" />
        </div>
        <div className="force-pins">
          {Array.from({ length: PINS }, (_, i) => (
            <span key={i} className={`force-pin ${i < pin ? 'done' : ''}`} />
          ))}
        </div>
        {result === true && <div className="good">La serrure cède !</div>}
        {result === false && <div className="bad">L’outil ripe… ça s’est entendu.</div>}
      </div>
    </div>
  );
}

/** Pavé à code (coffre-fort, téléphone, coffret à molette) : chiffres cliquables ou tapés au clavier. */
export function Keypad({ title, hint, length = 4, onSubmit, onCancel }: { title: string; hint: string; length?: number; onSubmit: (code: string) => void; onCancel: () => void }) {
  const [code, setCode] = useState('');
  const [shake, setShake] = useState(0);
  const press = (d: string) => setCode((c) => (c.length >= length ? c : c + d));
  const submit = () => {
    if (code.length < length) return setShake((x) => x + 1);
    onSubmit(code);
  };
  useKeys(true, (e) => {
    if (/^(Digit|Numpad)\d$/.test(e.code)) press(e.code.slice(-1));
    else if (e.code === 'Backspace') setCode((c) => c.slice(0, -1));
    else if (e.code === 'Enter' || e.code === 'NumpadEnter') submit();
    else if (e.code === 'Escape') onCancel();
    else return;
    e.preventDefault();
  });
  return (
    <div className="keypad">
      <h3>{title}</h3>
      <div className="small muted">{hint}</div>
      <div className={`keypad-screen ${shake ? 'shake' : ''}`} key={shake}>
        {Array.from({ length }, (_, i) => (
          <span key={i} className={`keypad-digit ${i < code.length ? 'set' : ''}`}>{code[i] ?? '·'}</span>
        ))}
      </div>
      <div className="keypad-grid">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} type="button" className="keypad-key" onClick={() => press(d)}>{d}</button>
        ))}
        <button type="button" className="keypad-key muted" onClick={() => setCode((c) => c.slice(0, -1))} aria-label="Effacer">⌫</button>
        <button type="button" className="keypad-key" onClick={() => press('0')}>0</button>
        <button type="button" className="keypad-key ok" onClick={submit} aria-label="Valider">✓</button>
      </div>
      <button className="btn btn-ghost btn-sm" onClick={onCancel}>Annuler</button>
    </div>
  );
}
