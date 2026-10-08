/**
 * Rendu 2D de la villa (vue de dessus). Ne dessine QUE ce que le serveur a envoyé :
 * les pièces où le joueur n'est pas restent dans l'ombre.
 */
import type { GameSelfView } from '@shared/types';
import { DOORS, GRID_W, ROOMS, WORLD_H, WORLD_W, allFurniture, buildWorldGrid, roomAt, type FurnitureDef } from '@shared/content/villa';
import { avatarImage } from './avatar';

export const TILE = 32;
/** Caméra : suit le joueur ; vue d'ensemble sur demande (touche M) ou en spectateur. */
export const camera = { overview: false };
const grid = buildWorldGrid();

const FURNITURE_STYLE: Partial<Record<FurnitureDef['kind'], { color: string; icon: string }>> = {
  counter: { color: '#5a4a3c', icon: '🍽️' },
  sink: { color: '#6f7d86', icon: '🚰' },
  table: { color: '#6b4b32', icon: '' },
  sofa: { color: '#5b2730', icon: '🛋️' },
  piano: { color: '#141414', icon: '🎹' },
  shelf: { color: '#4a3524', icon: '📚' },
  desk: { color: '#5c3f28', icon: '🗄️' },
  terminal: { color: '#1d2a33', icon: '🖥️' },
  bath: { color: '#c9d3d8', icon: '🛁' },
  bed: { color: '#7d6a58', icon: '🛏️' },
  wardrobe: { color: '#4b3322', icon: '🚪' },
  clock: { color: '#3d2a1a', icon: '🕰️' },
  fountain: { color: '#596670', icon: '⛲' },
  hedge: { color: '#163019', icon: '🌿' },
  tree: { color: '#13261a', icon: '🌳' },
  car: { color: '#3a1d1d', icon: '🚗' },
  fireplace: { color: '#3b2016', icon: '🔥' },
  crate: { color: '#5d4630', icon: '📦' },
  stairs: { color: '#4a3322', icon: '🪜' },
  railing: { color: '#3a2416', icon: '' },
  armchair: { color: '#5b2730', icon: '💺' },
  chair: { color: '#6b4b32', icon: '🪑' },
  bookcase: { color: '#4a3524', icon: '📚' },
  plant: { color: '#1f3a22', icon: '🪴' },
  floor_lamp: { color: '#4a3a2a', icon: '💡' },
  sideboard: { color: '#5c3f28', icon: '🏺' },
  nightstand: { color: '#5c3f28', icon: '🕯️' },
  dresser: { color: '#5c3f28', icon: '🗄️' },
  fridge: { color: '#c9c5ba', icon: '🧊' },
  stove: { color: '#8a8478', icon: '🍳' },
  toilet: { color: '#c9d3d8', icon: '🚽' },
  washbasin: { color: '#9aa8b0', icon: '🚰' },
  tv: { color: '#3a2a1e', icon: '📺' },
  workbench: { color: '#6a5032', icon: '🔧' },
  barrel: { color: '#5a3a22', icon: '🛢️' },
  bench: { color: '#5d4630', icon: '' },
  coat_rack: { color: '#3a2a1e', icon: '🧥' },
  easel: { color: '#8a6440', icon: '🎨' },
  globe: { color: '#2d4f6e', icon: '🌍' },
  harp: { color: '#9a7a3a', icon: '🎼' },
  chest: { color: '#5a3a22', icon: '🧰' },
};

function hash(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Couche statique (sols, murs, mobilier) pré-rendue. */
export function renderStatic(unlocked: Set<string>): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = GRID_W * TILE;
  c.height = WORLD_H * TILE;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#040507';
  ctx.fillRect(0, 0, c.width, c.height);

  for (let y = 0; y < WORLD_H; y++)
    for (let x = 0; x < GRID_W; x++) {
      const r = grid.rooms[y * GRID_W + x];
      const px = x * TILE;
      const py = y * TILE;
      if (!r) {
        // mur seulement s'il borde une pièce
        let border = false;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (x + dx >= 0 && x + dx < GRID_W && grid.rooms[(y + dy) * GRID_W + (x + dx)]) border = true;
        if (border) {
          ctx.fillStyle = '#1a1c22';
          ctx.fillRect(px, py, TILE, TILE);
          ctx.fillStyle = '#25282f';
          ctx.fillRect(px, py, TILE, 5);
        }
        continue;
      }
      const room = ROOMS[r - 1];
      ctx.fillStyle = room.floorColor;
      ctx.fillRect(px, py, TILE, TILE);
      const h = hash(x, y);
      switch (room.floor) {
        case 'wood':
          ctx.fillStyle = 'rgba(0,0,0,.18)';
          ctx.fillRect(px, py + ((x % 2) * TILE) / 2, TILE, 1);
          ctx.fillRect(px, py, 1, TILE);
          ctx.fillStyle = `rgba(255,220,180,${h * 0.04})`;
          ctx.fillRect(px, py, TILE, TILE);
          break;
        case 'tile':
          if ((x + y) % 2) {
            ctx.fillStyle = 'rgba(255,255,255,.05)';
            ctx.fillRect(px, py, TILE, TILE);
          }
          ctx.strokeStyle = 'rgba(0,0,0,.25)';
          ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
          break;
        case 'stone':
          ctx.strokeStyle = 'rgba(0,0,0,.22)';
          ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
          ctx.fillStyle = `rgba(255,255,255,${h * 0.05})`;
          ctx.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
          break;
        case 'grass':
          for (let i = 0; i < 5; i++) {
            ctx.fillStyle = `rgba(${40 + h * 30},${80 + h * 40},${40},.5)`;
            ctx.fillRect(px + hash(x + i, y) * TILE, py + hash(x, y + i) * TILE, 2, 4);
          }
          if (h > 0.86) {
            ctx.fillStyle = 'rgba(60,45,30,.55)';
            ctx.beginPath();
            ctx.ellipse(px + TILE / 2, py + TILE / 2, 10, 6, h * 3, 0, Math.PI * 2);
            ctx.fill();
          }
          break;
        case 'gravel':
          for (let i = 0; i < 8; i++) {
            ctx.fillStyle = `rgba(200,200,190,${0.08 + hash(i, x) * 0.08})`;
            ctx.fillRect(px + hash(x + i, y * 3) * TILE, py + hash(x * 2, y + i) * TILE, 2, 2);
          }
          break;
        case 'carpet':
          ctx.fillStyle = `rgba(255,255,255,${0.02 + h * 0.02})`;
          ctx.fillRect(px, py, TILE, TILE);
          break;
        case 'concrete':
          ctx.fillStyle = `rgba(0,0,0,${h * 0.15})`;
          ctx.fillRect(px, py, TILE, TILE);
          break;
      }
    }

  // Tapis de salon
  ctx.fillStyle = 'rgba(120,30,40,.35)';
  ctx.fillRect(13.5 * TILE, 8.5 * TILE, 5 * TILE, 3 * TILE);
  ctx.strokeStyle = 'rgba(201,164,92,.35)';
  ctx.strokeRect(13.7 * TILE, 8.7 * TILE, 4.6 * TILE, 2.6 * TILE);

  // Portes
  for (const d of DOORS) {
    const locked = !!d.lockedBy && !unlocked.has(d.id);
    ctx.fillStyle = locked ? '#3a2416' : 'rgba(110,80,50,.55)';
    ctx.fillRect(d.x * TILE + 2, d.y * TILE + 2, TILE - 4, TILE - 4);
    if (locked) {
      ctx.font = `${TILE * 0.55}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🔒', d.x * TILE + TILE / 2, d.y * TILE + TILE / 2);
    }
  }

  // Mobilier
  for (const f of allFurniture()) {
    const st = FURNITURE_STYLE[f.kind] ?? { color: '#4a3a2c', icon: '' };
    const x = f.x * TILE + 3;
    const y = f.y * TILE + 3;
    const w = f.w * TILE - 6;
    const h = f.h * TILE - 6;
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillRect(x + 3, y + 4, w, h);
    ctx.fillStyle = st.color;
    roundRect(ctx, x, y, w, h, 5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.08)';
    ctx.stroke();
    if (f.kind === 'bed') {
      ctx.fillStyle = '#e8e2d6';
      roundRect(ctx, x + 4, y + 4, w - 8, 12, 4);
      ctx.fill();
      ctx.fillStyle = 'rgba(80,30,40,.6)';
      ctx.fillRect(x + 2, y + h * 0.45, w - 4, h * 0.55 - 2);
    }
    if (st.icon) {
      ctx.font = `${Math.min(w, h, TILE) * 0.62}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = 0.85;
      ctx.fillText(st.icon, x + w / 2, y + h / 2 + 1);
      ctx.globalAlpha = 1;
    }
  }

  // Noms des pièces
  ctx.font = `600 11px Inter, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  for (const r of ROOMS) {
    ctx.fillStyle = 'rgba(232,220,196,.35)';
    ctx.fillText(r.name.toUpperCase(), r.rect.x * TILE + 6, r.rect.y * TILE + 4);
  }
  return c;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export interface RenderState {
  display: Map<string, { x: number; y: number; vy: number; lastMove: number }>;
  rain: { x: number; y: number }[];
  staticLayer: HTMLCanvasElement | null;
  staticKey: string;
}

export function createRenderState(): RenderState {
  return {
    display: new Map(),
    rain: Array.from({ length: 220 }, () => ({ x: Math.random() * WORLD_W, y: Math.random() * WORLD_H })),
    staticLayer: null,
    staticKey: '',
  };
}

/** Dessine une frame. Retourne la pièce du joueur. */
export function drawFrame(ctx: CanvasRenderingContext2D, view: GameSelfView, rs: RenderState, cw: number, ch: number, dt: number, reduced: boolean) {
  const key = view.unlockedDoors.slice().sort().join(',');
  if (!rs.staticLayer || rs.staticKey !== key) {
    rs.staticLayer = renderStatic(new Set(view.unlockedDoors));
    rs.staticKey = key;
  }
  // plan : rez-de-chaussée à gauche, étage à droite
  const worldW = GRID_W * TILE;
  const worldH = WORLD_H * TILE;
  const meView = view.players.find((p) => p.id === view.you);
  const follow = !camera.overview && view.alive && !view.epilogue && meView?.pos;
  const fit = Math.min(cw / worldW, ch / worldH);
  const scale = follow ? Math.max(fit, Math.min(cw / (24 * TILE), ch / (13 * TILE))) : fit;
  const focus = follow ? (rs.display.get(view.you) ?? meView!.pos!) : { x: GRID_W / 2, y: WORLD_H / 2 };
  const place = (size: number, screen: number, center: number) =>
    size * scale <= screen ? (screen - size * scale) / 2 : Math.min(0, Math.max(screen - size * scale, screen / 2 - center * TILE * scale));
  const ox = place(worldW, cw, focus.x);
  const oy = place(worldH, ch, focus.y);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#030305';
  ctx.fillRect(0, 0, cw, ch);
  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);
  ctx.drawImage(rs.staticLayer, 0, 0);

  const me = view.players.find((p) => p.id === view.you);
  const myRoom = me?.pos ? roomAt(grid, me.pos.x, me.pos.y)?.id : undefined;
  const spectator = !view.alive || !!view.epilogue;

  // Pluie sur l'extérieur
  if (!reduced) {
    ctx.strokeStyle = 'rgba(170,190,230,.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const d of rs.rain) {
      d.y += dt * 14;
      d.x += dt * 2;
      if (d.y > WORLD_H) {
        d.y = 0;
        d.x = Math.random() * WORLD_W;
      }
      const r = roomAt(grid, d.x, d.y);
      if (!r?.outdoor) continue;
      ctx.moveTo(d.x * TILE, d.y * TILE);
      ctx.lineTo(d.x * TILE + 2, d.y * TILE + 9);
    }
    ctx.stroke();
  }

  // Traces au sol
  for (const t of view.traces) {
    const x = t.pos.x * TILE;
    const y = t.pos.y * TILE;
    if (t.kind === 'footprint') {
      ctx.fillStyle = 'rgba(70,50,30,.55)';
      ctx.beginPath();
      ctx.ellipse(x - 3, y, 2.6, 5, 0.2, 0, Math.PI * 2);
      ctx.ellipse(x + 4, y + 3, 2.6, 5, 0.2, 0, Math.PI * 2);
      ctx.fill();
    } else if (t.kind === 'blood_pool') {
      ctx.fillStyle = 'rgba(120,10,18,.75)';
      ctx.beginPath();
      ctx.ellipse(x, y + 6, 20, 12, 0.3, 0, Math.PI * 2);
      ctx.fill();
    } else if (t.kind === 'ashes') {
      ctx.fillStyle = 'rgba(160,160,160,.45)';
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = t.kind === 'diluted_blood' ? 'rgba(200,60,70,.7)' : 'rgba(200,200,220,.5)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // Objets
  const now = performance.now() / 1000;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const o of view.objects) {
    if (!o.pos) continue;
    const x = o.pos.x * TILE;
    const y = o.pos.y * TILE;
    const bob = reduced ? 0 : Math.sin(now * 2 + x) * 1.5;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, 16);
    glow.addColorStop(0, o.bloody ? 'rgba(200,30,40,.45)' : 'rgba(255,214,140,.28)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - 16, y - 16, 32, 32);
    ctx.font = '18px serif';
    ctx.globalAlpha = o.name.endsWith('(caché)') ? 0.55 : 1;
    ctx.fillText(o.icon, x, y + bob);
    ctx.globalAlpha = 1;
  }

  // Corps
  for (const b of view.bodies) {
    const img = avatarImage(b.character, 'front', true);
    const x = b.pos.x * TILE;
    const y = b.pos.y * TILE;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-Math.PI / 2);
    if (img.complete) ctx.drawImage(img, -26, -16, 52, 83);
    ctx.restore();
  }

  // Joueurs (interpolés)
  const visible = view.players.filter((p) => p.alive && p.pos);
  const seen = new Set<string>();
  const sorted = [...visible].sort((a, b) => a.pos!.y - b.pos!.y);
  for (const p of sorted) {
    seen.add(p.id);
    let d = rs.display.get(p.id);
    if (!d || Math.hypot(d.x - p.pos!.x, d.y - p.pos!.y) > 3) {
      d = { x: p.pos!.x, y: p.pos!.y, vy: 0, lastMove: 0 };
      rs.display.set(p.id, d);
    }
    const k = Math.min(1, dt * 14);
    const nx = d.x + (p.pos!.x - d.x) * k;
    const ny = d.y + (p.pos!.y - d.y) * k;
    const moving = Math.hypot(nx - d.x, ny - d.y) > 0.002;
    if (moving) {
      d.vy = ny - d.y;
      d.lastMove = now;
    }
    d.x = nx;
    d.y = ny;
    const back = d.vy < -0.004 && now - d.lastMove < 0.3;
    const img = avatarImage(p.character, back ? 'back' : 'front');
    const x = d.x * TILE;
    const y = d.y * TILE;
    const walk = moving && !reduced ? Math.abs(Math.sin(now * 12)) * 2.5 : reduced ? 0 : Math.sin(now * 2.2 + x) * 0.6;
    const h = 64;
    const w = 40;
    if (p.hasLight) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, TILE * 3);
      g.addColorStop(0, 'rgba(255,230,160,.25)');
      g.addColorStop(1, 'rgba(255,230,160,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - TILE * 3, y - TILE * 3, TILE * 6, TILE * 6);
    }
    ctx.globalAlpha = p.viaAlliance ? 0.45 : p.connected ? 1 : 0.5;
    if (img.complete) ctx.drawImage(img, x - w / 2, y - h + 10 - walk, w, h);
    ctx.globalAlpha = 1;
    if (p.id === view.you) {
      ctx.strokeStyle = 'rgba(201,164,92,.8)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(x, y + 9, 13, 4.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (p.viaAlliance) {
      ctx.strokeStyle = 'rgba(100,180,255,.7)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(x, y - 18, 22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.font = '600 10px Inter, sans-serif';
    const label = p.name.split(' ')[0];
    const tw = ctx.measureText(label).width + 10;
    ctx.fillStyle = 'rgba(0,0,0,.6)';
    roundRect(ctx, x - tw / 2, y - h + 2, tw, 14, 6);
    ctx.fill();
    ctx.fillStyle = p.stained ? '#ff8a8a' : '#efe6d2';
    ctx.fillText(label, x, y - h + 9.5);
  }
  for (const id of [...rs.display.keys()]) if (!seen.has(id)) rs.display.delete(id);

  // Brouillard : les autres pièces restent dans l'ombre
  if (!spectator && myRoom) {
    ctx.fillStyle = 'rgba(2,3,6,.62)';
    for (const r of ROOMS) {
      if (r.id === myRoom) continue;
      ctx.fillRect(r.rect.x * TILE, r.rect.y * TILE, r.rect.w * TILE, r.rect.h * TILE);
    }
  }

  // Coupure de courant
  if (view.blackout) {
    const dark = document.createElement('canvas');
    dark.width = worldW;
    dark.height = worldH;
    const dc = dark.getContext('2d')!;
    dc.fillStyle = 'rgba(0,0,0,.94)';
    dc.fillRect(0, 0, worldW, worldH);
    dc.globalCompositeOperation = 'destination-out';
    for (const p of visible) {
      const d = rs.display.get(p.id);
      if (!d) continue;
      const radius = p.hasLight ? TILE * 4 : p.id === view.you ? TILE * 1.3 : 0;
      if (!radius) continue;
      const g = dc.createRadialGradient(d.x * TILE, d.y * TILE, 0, d.x * TILE, d.y * TILE, radius);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      dc.fillStyle = g;
      dc.fillRect(d.x * TILE - radius, d.y * TILE - radius, radius * 2, radius * 2);
    }
    ctx.drawImage(dark, 0, 0);
  }

  ctx.restore();
  return myRoom;
}
