import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../store';
import { useChatFocus } from './helpers';

const KEY = 'ehas.tutorial';
interface Saved {
  games: number;
  hidden: boolean;
}
function load(): Saved {
  try {
    return { games: 0, hidden: false, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { games: 0, hidden: false };
  }
}
function save(s: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignoré */
  }
}

const STEPS = [
  { id: 'move', text: 'Déplacez-vous avec ZQSD / WASD' },
  { id: 'look', text: 'Cliquez dans la vue et bougez la souris pour regarder autour (V : vue à la 1re personne)' },
  { id: 'secret', text: 'Maintenez « Mon secret » pour le relire — ne le dites à personne… ou si ?' },
  { id: 'take', text: 'Approchez-vous d’un objet et prenez-le (E ou « Prendre »)' },
  { id: 'notebook', text: 'Ouvrez votre Carnet (touche 3) : tout ce que vous voyez et entendez y est noté' },
  { id: 'relation', text: 'Proposez une amitié, une alliance ou un pacte à quelqu’un dans la même pièce' },
] as const;

/** Guide de la première nuit : objectifs qui se cochent tout seuls. Affiché pendant les 2 premières parties. */
export function Tutorial() {
  const game = useStore((s) => s.game);
  const tab = useChatFocus((s) => s.tab);
  const [saved, setSaved] = useState(load);
  const [done, setDone] = useState<Set<string>>(new Set());
  const start = useRef<{ x: number; y: number } | null>(null);
  const counted = useRef(false);

  useEffect(() => {
    if (!game || counted.current) return;
    counted.current = true;
    const s = { ...saved, games: saved.games + 1 };
    save(s);
  }, [game, saved]);

  const mark = (id: string) => setDone((d) => (d.has(id) ? d : new Set(d).add(id)));

  useEffect(() => {
    if (!game) return;
    const me = game.players.find((p) => p.id === game.you);
    if (me?.pos) {
      if (!start.current) start.current = { ...me.pos };
      else if (Math.hypot(me.pos.x - start.current.x, me.pos.y - start.current.y) > 1.5) mark('move');
    }
    if (game.inventory.length) mark('take');
    if (game.relations.some((r) => r.from === game.you && !r.origin.startsWith('Pacte ancien'))) mark('relation');
  }, [game]);
  useEffect(() => {
    if (tab === 2) mark('notebook');
  }, [tab]);
  useEffect(() => {
    const onLock = () => document.pointerLockElement && mark('look');
    const onDown = (e: MouseEvent) => (e.target as HTMLElement).closest?.('.view3d') && mark('look');
    const onSecret = (e: MouseEvent) => (e.target as HTMLElement).closest?.('.secret-btn') && mark('secret');
    document.addEventListener('pointerlockchange', onLock);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('mousedown', onSecret);
    return () => {
      document.removeEventListener('pointerlockchange', onLock);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousedown', onSecret);
    };
  }, []);

  if (!game || saved.hidden || saved.games > 2 || game.epilogue || !game.alive) return null;
  const allDone = STEPS.every((s) => done.has(s.id));
  const hide = () => {
    const s = { ...saved, hidden: true };
    save(s);
    setSaved(s);
  };
  return (
    <div className={`tutorial ${allDone ? 'complete' : ''}`}>
      <div className="tutorial-head">
        <span>PREMIÈRE NUIT</span>
        <button onClick={hide} title="Ne plus afficher">×</button>
      </div>
      {allDone ? (
        <p>Vous savez l’essentiel. Observez, parlez, mentez si besoin. Quand le drame arrivera, l’onglet Enquête vous donnera un rôle.</p>
      ) : (
        <ul>
          {STEPS.map((s) => (
            <li key={s.id} className={done.has(s.id) ? 'done' : ''}>
              {done.has(s.id) ? '✓' : '○'} {s.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
