import { useEffect, useRef, useState } from 'react';
import { formatClock } from '@shared/config';
import type { ReplayView } from '@shared/types';
import { LEVELS, ROOMS, WORLD_H, WORLD_W, levelOf, localX, type Level } from '@shared/content/villa';

const LEVEL_NAME: Record<Level, string> = { [-1]: 'Sous-sol', 0: 'Rez-de-chaussée', 1: 'Étage', 2: 'Grenier' } as Record<Level, string>;
const COLORS = ['#7ec8ff', '#ffd27a', '#a6e3a1', '#f5a3d0', '#c9a7ff', '#ffb37a', '#8ee6e0', '#e8e2d2'];

/**
 * Rejeu de la nuit : les trajets de chacun sur le plan (quatre niveaux), le meurtrier entouré de rouge,
 * les morts marqués d'une croix à l'heure où elles surviennent.
 */
export function Replay({ replay, onClose }: { replay: ReplayView; onClose: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(2);
  const n = replay.frames.length;
  const tRef = useRef(0);
  tRef.current = t;

  useEffect(() => {
    if (!playing || n < 2) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const next = Math.min(n - 1, tRef.current + dt * speed);
      setT(next);
      if (next >= n - 1) setPlaying(false);
      else raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, n]);

  useEffect(() => {
    const cv = ref.current;
    if (!cv || !n) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = cv.clientWidth;
    const H = cv.clientHeight;
    cv.width = W * dpr;
    cv.height = H * dpr;
    const g = cv.getContext('2d')!;
    g.scale(dpr, dpr);
    g.fillStyle = '#07080c';
    g.fillRect(0, 0, W, H);
    // quatre niveaux en 2 × 2 : rez-de-chaussée et étage en haut
    const order: Level[] = [0, 1, -1, 2];
    const pad = 8;
    const cw = (W - pad * 3) / 2;
    const ch = (H - pad * 3) / 2;
    const s = Math.min(cw / WORLD_W, (ch - 14) / WORLD_H);
    const origin = (l: Level) => {
      const i = order.indexOf(l);
      return { x: pad + (i % 2) * (cw + pad), y: pad + Math.floor(i / 2) * (ch + pad) + 14 };
    };
    const map = (x: number, y: number) => {
      const l = levelOf(x);
      const o = origin(l);
      return { x: o.x + localX(x) * s, y: o.y + y * s };
    };
    for (const l of LEVELS) {
      const o = origin(l);
      g.fillStyle = 'rgba(227,200,138,0.7)';
      g.font = '11px sans-serif';
      g.fillText(LEVEL_NAME[l], o.x, o.y - 4);
    }
    for (const r of ROOMS) {
      const a = map(r.rect.x, r.rect.y);
      g.fillStyle = r.outdoor ? 'rgba(40,70,48,0.35)' : 'rgba(255,255,255,0.06)';
      g.strokeStyle = 'rgba(255,255,255,0.14)';
      g.fillRect(a.x, a.y, r.rect.w * s, r.rect.h * s);
      g.strokeRect(a.x + 0.5, a.y + 0.5, r.rect.w * s - 1, r.rect.h * s - 1);
    }
    const i0 = Math.floor(t);
    const f = t - i0;
    const A = replay.frames[i0];
    const B = replay.frames[Math.min(n - 1, i0 + 1)];
    const clock = A.clock + (B.clock - A.clock) * f;
    // morts survenues avant l'instant affiché
    for (const d of replay.deaths)
      if (d.clock <= clock) {
        const p = map(d.x, d.y);
        g.strokeStyle = '#ff5060';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(p.x - 5, p.y - 5);
        g.lineTo(p.x + 5, p.y + 5);
        g.moveTo(p.x + 5, p.y - 5);
        g.lineTo(p.x - 5, p.y + 5);
        g.stroke();
      }
    replay.players.forEach((pl, idx) => {
      const color = COLORS[idx % COLORS.length];
      // traînée : les dernières positions
      g.strokeStyle = color + '66';
      g.lineWidth = 1.5;
      g.beginPath();
      let started = false;
      for (let k = Math.max(0, i0 - 8); k <= i0; k++) {
        const e = replay.frames[k].p.find((q) => q[0] === pl.id);
        if (!e) continue;
        const p = map(e[1], e[2]);
        if (!started) g.moveTo(p.x, p.y);
        else g.lineTo(p.x, p.y);
        started = true;
      }
      g.stroke();
      const a = A.p.find((q) => q[0] === pl.id);
      if (!a) return;
      const b = B.p.find((q) => q[0] === pl.id) ?? a;
      // changement de niveau entre deux images : pas d'interpolation à travers le plan
      const same = levelOf(a[1]) === levelOf(b[1]);
      const x = same ? a[1] + (b[1] - a[1]) * f : f < 0.5 ? a[1] : b[1];
      const y = same ? a[2] + (b[2] - a[2]) * f : f < 0.5 ? a[2] : b[2];
      const p = map(x, y);
      g.fillStyle = color;
      g.beginPath();
      g.arc(p.x, p.y, 5, 0, Math.PI * 2);
      g.fill();
      if (pl.murderer) {
        g.strokeStyle = '#ff3344';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(p.x, p.y, 8, 0, Math.PI * 2);
        g.stroke();
      }
      g.fillStyle = '#f1e7d0';
      g.font = '10px sans-serif';
      g.fillText(pl.name.split(' ')[0], p.x + 8, p.y + 3);
    });
    g.fillStyle = '#f1e7d0';
    g.font = 'bold 14px sans-serif';
    g.textAlign = 'right';
    g.fillText(formatClock(Math.floor(clock)), W - pad - 4, H - pad - 4);
    g.textAlign = 'left';
  }, [t, replay, n]);

  if (n < 2) return null;
  return (
    <div className="replay fade-in">
      <div className="replay-head">
        <strong>Revoir la nuit</strong>
        <span className="small muted">Le meurtrier est entouré de rouge · ✕ = une mort</span>
        <button className="drawer-close" onClick={onClose} aria-label="Fermer">×</button>
      </div>
      <canvas ref={ref} className="replay-canvas" />
      <div className="replay-controls">
        <button className="btn btn-sm" onClick={() => (t >= n - 1 ? (setT(0), setPlaying(true)) : setPlaying(!playing))}>{playing ? '⏸' : '▶'}</button>
        <input type="range" min={0} max={n - 1} step={0.01} value={t} onChange={(e) => (setPlaying(false), setT(Number(e.target.value)))} />
        <button className="btn btn-sm btn-ghost" onClick={() => setSpeed(speed >= 8 ? 1 : speed * 2)}>×{speed}</button>
      </div>
    </div>
  );
}
