import { useEffect, useRef } from 'react';
import { useStore } from '../../store';
import { formatClock, GAME_CONFIG } from '@shared/config';

/**
 * Fond vivant : la Villa Beaumont de nuit, sous la pluie.
 * Fenêtres qui s'allument/s'éteignent, silhouettes, éclairs, horloge.
 */
export function NightBackground({ dim = false }: { dim?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useStore((s) => s.settings.reducedMotion);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    let w = 0;
    let h = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const drops = Array.from({ length: 260 }, () => ({ x: Math.random(), y: Math.random(), s: 0.6 + Math.random() * 0.8 }));
    const windows: { x: number; y: number; w: number; h: number; on: number; target: number; silhouette: number }[] = [];
    // grille de fenêtres de la villa (coordonnées relatives à la façade)
    for (let row = 0; row < 2; row++)
      for (let col = 0; col < 7; col++)
        if (!(row === 1 && col === 3))
          windows.push({ x: 0.08 + col * 0.125, y: 0.2 + row * 0.33, w: 0.06, h: 0.2, on: Math.random() > 0.5 ? 1 : 0, target: Math.random() > 0.45 ? 1 : 0, silhouette: -1 });
    let flash = 0;
    let nextFlash = performance.now() + 6000 + Math.random() * 9000;
    const start = performance.now();

    const draw = (now: number) => {
      const t = (now - start) / 1000;
      // ciel
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#05060b');
      sky.addColorStop(0.6, '#0c1018');
      sky.addColorStop(1, '#07080c');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
      // lune voilée
      const mx = w * 0.8;
      const my = h * 0.18;
      const moon = ctx.createRadialGradient(mx, my, 0, mx, my, h * 0.25);
      moon.addColorStop(0, 'rgba(190,200,220,.22)');
      moon.addColorStop(1, 'rgba(190,200,220,0)');
      ctx.fillStyle = moon;
      ctx.fillRect(0, 0, w, h);

      // villa
      const fw = Math.min(w * 0.72, 980);
      const fh = fw * 0.42;
      const fx = (w - fw) / 2;
      const fy = h * 0.78 - fh;
      ctx.fillStyle = '#0b0d13';
      ctx.beginPath();
      ctx.moveTo(fx - fw * 0.04, fy);
      ctx.lineTo(fx + fw * 0.5, fy - fh * 0.38);
      ctx.lineTo(fx + fw * 1.04, fy);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(fx, fy, fw, fh);
      // cheminée
      ctx.fillRect(fx + fw * 0.74, fy - fh * 0.32, fw * 0.05, fh * 0.3);
      // tour
      ctx.fillRect(fx + fw * 0.03, fy - fh * 0.25, fw * 0.12, fh * 0.25);
      ctx.beginPath();
      ctx.moveTo(fx + fw * 0.02, fy - fh * 0.25);
      ctx.lineTo(fx + fw * 0.09, fy - fh * 0.48);
      ctx.lineTo(fx + fw * 0.16, fy - fh * 0.25);
      ctx.fill();

      // fenêtres
      for (const win of windows) {
        if (!reduced && Math.random() < 0.0015) win.target = win.target ? 0 : 1;
        if (!reduced && Math.random() < 0.0008 && win.on > 0.6) win.silhouette = 0;
        win.on += (win.target - win.on) * 0.03;
        const x = fx + win.x * fw;
        const y = fy + win.y * fh;
        const ww = win.w * fw;
        const wh = win.h * fh;
        const flick = 0.85 + Math.sin(t * 7 + win.x * 40) * 0.05;
        ctx.fillStyle = `rgba(255, 184, 92, ${0.08 + win.on * 0.62 * flick})`;
        ctx.fillRect(x, y, ww, wh);
        if (win.on > 0.3) {
          const glow = ctx.createRadialGradient(x + ww / 2, y + wh / 2, 0, x + ww / 2, y + wh / 2, ww * 2.2);
          glow.addColorStop(0, `rgba(255,170,80,${0.12 * win.on})`);
          glow.addColorStop(1, 'rgba(255,170,80,0)');
          ctx.fillStyle = glow;
          ctx.fillRect(x - ww * 2, y - wh, ww * 5, wh * 3);
        }
        if (win.silhouette >= 0) {
          win.silhouette += 0.006;
          const sx = x + ww * (win.silhouette * 1.4 - 0.2);
          ctx.fillStyle = 'rgba(10,8,8,.85)';
          ctx.beginPath();
          ctx.arc(sx, y + wh * 0.38, ww * 0.16, 0, Math.PI * 2);
          ctx.fillRect(sx - ww * 0.22, y + wh * 0.52, ww * 0.44, wh * 0.48);
          ctx.fill();
          if (win.silhouette > 1) win.silhouette = -1;
        }
        ctx.strokeStyle = '#05060a';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, ww, wh);
        ctx.beginPath();
        ctx.moveTo(x + ww / 2, y);
        ctx.lineTo(x + ww / 2, y + wh);
        ctx.moveTo(x, y + wh / 2);
        ctx.lineTo(x + ww, y + wh / 2);
        ctx.stroke();
      }
      // porte
      ctx.fillStyle = 'rgba(255,170,80,.25)';
      ctx.fillRect(fx + fw * 0.465, fy + fh * 0.6, fw * 0.07, fh * 0.4);
      // horloge du fronton
      const cx = fx + fw * 0.5;
      const cy = fy - fh * 0.14;
      ctx.strokeStyle = 'rgba(201,164,92,.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, fh * 0.07, 0, Math.PI * 2);
      ctx.stroke();
      const minutes = GAME_CONFIG.startClockMinutes + t / 6;
      const ang = ((minutes % 60) / 60) * Math.PI * 2 - Math.PI / 2;
      const hang = (((minutes / 60) % 12) / 12) * Math.PI * 2 - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(ang) * fh * 0.06, cy + Math.sin(ang) * fh * 0.06);
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(hang) * fh * 0.04, cy + Math.sin(hang) * fh * 0.04);
      ctx.stroke();
      canvas.dataset.clock = formatClock(minutes);

      // arbres / haies
      ctx.fillStyle = '#05070a';
      for (let i = 0; i < 9; i++) {
        const tx = (i / 8) * w;
        const sway = reduced ? 0 : Math.sin(t * 0.6 + i) * 4;
        ctx.beginPath();
        ctx.ellipse(tx + sway, h * 0.8, w * 0.06, h * 0.12 + (i % 3) * 12, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#040508';
      ctx.fillRect(0, h * 0.82, w, h * 0.18);
      // reflets au sol
      ctx.fillStyle = 'rgba(255,170,80,.035)';
      ctx.fillRect(fx, h * 0.83, fw, h * 0.05);

      // pluie
      ctx.strokeStyle = 'rgba(170,190,220,.28)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const d of drops) {
        if (!reduced) {
          d.y += 0.012 * d.s;
          d.x += 0.002 * d.s;
          if (d.y > 1) {
            d.y = -0.05;
            d.x = Math.random();
          }
        }
        const x = d.x * w;
        const y = d.y * h;
        ctx.moveTo(x, y);
        ctx.lineTo(x + 3 * d.s, y + 14 * d.s);
      }
      ctx.stroke();

      // éclairs
      if (!reduced && now > nextFlash) {
        flash = 1;
        nextFlash = now + 8000 + Math.random() * 14000;
      }
      if (flash > 0) {
        ctx.fillStyle = `rgba(200,215,255,${flash * 0.35})`;
        ctx.fillRect(0, 0, w, h);
        flash = Math.max(0, flash - 0.04 - Math.random() * 0.05);
      }
      // vignette
      const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, `rgba(0,0,0,${dim ? 0.85 : 0.65})`);
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);
      if (dim) {
        ctx.fillStyle = 'rgba(4,5,8,.45)';
        ctx.fillRect(0, 0, w, h);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [dim, reduced]);

  return <canvas ref={ref} className="night-bg" aria-hidden />;
}
