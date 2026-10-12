import { useEffect, useRef, useState } from 'react';
import type { GameView3D } from '../../three/GameView3D';

/** Écran tactile détecté (téléphone, tablette) : les commandes tactiles s'affichent d'elles-mêmes. */
export const isTouchDevice = () => typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window);

/**
 * Commandes tactiles : joystick à gauche (pousser à fond = courir), glisser sur la droite de l'écran pour regarder,
 * gros boutons pour interagir, la roue d'actions, le téléphone et le chat.
 */
export function TouchControls({ view, onInteract, onWheel, onPhone, onChat }: { view: () => GameView3D | null; onInteract: () => void; onWheel: () => void; onPhone: () => void; onChat: () => void }) {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const stickId = useRef<number | null>(null);
  const lookId = useRef<{ id: number; x: number; y: number } | null>(null);
  const R = 52;

  const moveStick = (cx: number, cy: number) => {
    const b = base.current!.getBoundingClientRect();
    let x = cx - (b.left + b.width / 2);
    let y = cy - (b.top + b.height / 2);
    const d = Math.hypot(x, y);
    if (d > R) {
      x = (x / d) * R;
      y = (y / d) * R;
    }
    setKnob({ x, y });
    view()?.setStick(x / R, -y / R);
  };
  const endStick = () => {
    stickId.current = null;
    setKnob({ x: 0, y: 0 });
    view()?.setStick(0, 0);
  };
  useEffect(() => () => view()?.setStick(0, 0), [view]);

  return (
    <div className="touch-layer">
      <div
        className="touch-look"
        onTouchStart={(e) => {
          const t = e.changedTouches[0];
          lookId.current = { id: t.identifier, x: t.clientX, y: t.clientY };
        }}
        onTouchMove={(e) => {
          const l = lookId.current;
          if (!l) return;
          for (const t of Array.from(e.changedTouches))
            if (t.identifier === l.id) {
              view()?.look((t.clientX - l.x) * 0.006, (t.clientY - l.y) * 0.005);
              l.x = t.clientX;
              l.y = t.clientY;
            }
        }}
        onTouchEnd={() => (lookId.current = null)}
      />
      <div
        className="touch-stick"
        ref={base}
        onTouchStart={(e) => {
          const t = e.changedTouches[0];
          stickId.current = t.identifier;
          moveStick(t.clientX, t.clientY);
        }}
        onTouchMove={(e) => {
          for (const t of Array.from(e.changedTouches)) if (t.identifier === stickId.current) moveStick(t.clientX, t.clientY);
        }}
        onTouchEnd={endStick}
        onTouchCancel={endStick}
      >
        <div className="touch-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
      </div>
      <div className="touch-buttons">
        <button className="touch-btn big" onTouchStart={(e) => (e.preventDefault(), onInteract())} aria-label="Interagir">E</button>
        <button className="touch-btn" onTouchStart={(e) => (e.preventDefault(), onWheel())} aria-label="Roue d’actions">⋯</button>
        <button className="touch-btn" onTouchStart={(e) => (e.preventDefault(), onPhone())} aria-label="Téléphone">📱</button>
        <button className="touch-btn" onTouchStart={(e) => (e.preventDefault(), onChat())} aria-label="Chat">💬</button>
      </div>
    </div>
  );
}
