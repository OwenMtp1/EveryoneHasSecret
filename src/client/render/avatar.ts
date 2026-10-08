/**
 * Rendu du personnage en SVG, composé à partir des données (teinte, coiffure, tenue).
 * Une seule source : utilisé par l'éditeur, le profil, le lobby ET la villa (converti en image).
 * Repère : viewBox 0 0 200 320, tête en (100, 72).
 */
import type { Character } from '@shared/types';
import { findHairColor, findHairStyle, findOutfit, findSkinTone, type Outfit } from '@shared/content/character';

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v + amt * 255)));
  const r = c((n >> 16) & 255);
  const g = c((n >> 8) & 255);
  const b = c(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

const TORSO: Record<Character['appearance'], string> = {
  masculine: 'M58,128 Q60,117 74,115 L126,115 Q140,117 142,128 L135,204 L65,204 Z',
  feminine: 'M64,128 Q66,117 79,115 L121,115 Q134,117 136,128 L129,164 Q133,184 135,204 L65,204 Q67,184 71,164 Z',
};

function patternDef(o: Outfit, uid: string): string {
  const p = o.top.pattern;
  if (!p || p === 'none') return '';
  const c = o.top.patternColor ?? o.top.accent;
  if (p === 'stripes')
    return `<pattern id="pat-${uid}" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="4" fill="${c}"/></pattern>`;
  if (p === 'checks')
    return `<pattern id="pat-${uid}" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="8" height="16" fill="${c}" opacity=".35"/><rect width="16" height="8" fill="${c}" opacity=".35"/></pattern>`;
  return `<pattern id="pat-${uid}" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="4" cy="4" r="2.2" fill="${c}"/><circle cx="11" cy="11" r="2.2" fill="${c}"/></pattern>`;
}

export interface AvatarOptions {
  view?: 'front' | 'back';
  uid?: string;
  dead?: boolean;
  /** cadrage : 'full' corps entier, 'bust' buste (portraits) */
  crop?: 'full' | 'bust';
}

let uidCounter = 0;

export function avatarSvg(c: Character, opts: AvatarOptions = {}): string {
  const uid = opts.uid ?? `a${++uidCounter}`;
  const back = opts.view === 'back';
  const skin = findSkinTone(c.skinTone).color;
  const skinDark = shade(skin, -0.12);
  const hair = findHairColor(c.hairColor).color;
  const hs = findHairStyle(c.hairStyleId);
  const o = findOutfit(c.outfitId);
  const fem = c.appearance === 'feminine';
  const top = o.top;
  const parts: string[] = [];
  const defs = patternDef(o, uid);

  // Ombre au sol
  parts.push(`<ellipse cx="100" cy="304" rx="48" ry="9" fill="#000" opacity=".35"/>`);
  // Cheveux arrière
  if (hs.back) parts.push(`<path d="${hs.back}" fill="${shade(hair, -0.06)}"/>`);

  // Jambes
  const longTop = top.style === 'gown';
  const dress = top.style === 'dress';
  const coat = top.style === 'coat';
  if (!longTop) {
    const b = o.bottom;
    if (b.style === 'shorts' || b.style === 'skirt' || dress) {
      parts.push(`<rect x="77" y="200" width="20" height="92" rx="8" fill="${skin}"/><rect x="103" y="200" width="20" height="92" rx="8" fill="${skin}"/>`);
      if (b.style === 'shorts' && !dress) parts.push(`<path d="M68,198 L132,198 L134,240 L102,240 L100,222 L98,240 L66,240 Z" fill="${b.color}"/>`);
      if (b.style === 'skirt' && !dress) parts.push(`<path d="M68,196 L132,196 L140,252 L60,252 Z" fill="${b.color}"/>`);
    } else {
      parts.push(`<rect x="72" y="196" width="27" height="98" rx="6" fill="${b.color}"/><rect x="101" y="196" width="27" height="98" rx="6" fill="${b.color}"/>`);
      if (b.style === 'jeans') parts.push(`<path d="M86,204 L86,290 M114,204 L114,290" stroke="${shade(b.color, 0.12)}" stroke-width="1.5" opacity=".6"/>`);
      if (b.style === 'joggers') parts.push(`<rect x="72" y="282" width="27" height="10" rx="4" fill="${shade(b.color, -0.1)}"/><rect x="101" y="282" width="27" height="10" rx="4" fill="${shade(b.color, -0.1)}"/><path d="M76,206 L76,280 M124,206 L124,280" stroke="#fff" stroke-width="2" opacity=".25"/>`);
    }
  }
  // Chaussures
  parts.push(`<rect x="70" y="288" width="31" height="13" rx="6" fill="${o.shoes}"/><rect x="99" y="288" width="31" height="13" rx="6" fill="${o.shoes}"/>`);

  // Bras
  const sleeve = top.style === 'tank' ? null : top.style === 'tee' || top.style === 'polo' || (fem && (dress || longTop)) ? 'short' : 'long';
  const armColor = top.color;
  for (const x of [46, 138]) {
    parts.push(`<rect x="${x}" y="122" width="16" height="92" rx="8" fill="${skin}"/>`);
    if (sleeve === 'long') parts.push(`<rect x="${x - 1}" y="120" width="18" height="88" rx="8" fill="${armColor}"/>`);
    if (sleeve === 'short') parts.push(`<rect x="${x - 1}" y="120" width="18" height="34" rx="8" fill="${armColor}"/>`);
  }
  parts.push(`<circle cx="54" cy="216" r="9" fill="${skin}"/><circle cx="146" cy="216" r="9" fill="${skin}"/>`);

  // Cou
  parts.push(`<rect x="90" y="96" width="20" height="24" rx="6" fill="${skinDark}"/>`);

  // Torse
  let torso = TORSO[c.appearance];
  if (dress) torso = fem ? 'M64,128 Q66,117 79,115 L121,115 Q134,117 136,128 L129,164 Q133,180 144,252 L56,252 Q67,180 71,164 Z' : 'M58,128 Q60,117 74,115 L126,115 Q140,117 142,128 L138,170 L146,252 L54,252 L62,170 Z';
  if (longTop) torso = 'M64,128 Q66,117 79,115 L121,115 Q134,117 136,128 L129,164 Q134,200 150,298 L50,298 Q66,200 71,164 Z';
  if (coat) torso = fem ? 'M62,128 Q64,117 78,115 L122,115 Q136,117 138,128 L134,164 L140,246 L60,246 L66,164 Z' : 'M57,128 Q59,117 73,115 L127,115 Q141,117 143,128 L139,246 L61,246 Z';
  parts.push(`<path d="${torso}" fill="${top.color}"/>`);
  if (defs) parts.push(`<path d="${torso}" fill="url(#pat-${uid})"/>`);
  // ombrage latéral
  parts.push(`<path d="${torso}" fill="#000" opacity=".08" transform="translate(100 0) scale(.5 1) translate(-100 0)"/>`);

  if (!back) {
    switch (top.style) {
      case 'tee':
        parts.push(`<path d="M88,116 Q100,128 112,116" stroke="${shade(top.color, -0.18)}" stroke-width="3" fill="none"/>`);
        break;
      case 'tank':
        parts.push(`<path d="M80,116 L84,130 M120,116 L116,130" stroke="${top.accent}" stroke-width="3"/>`);
        break;
      case 'shirt':
        parts.push(`<path d="M86,114 L100,130 L94,138 Z M114,114 L100,130 L106,138 Z" fill="${shade(top.color, 0.1)}"/>`);
        for (let y = 140; y <= 196; y += 14) parts.push(`<circle cx="100" cy="${y}" r="2" fill="${top.accent}"/>`);
        parts.push(`<line x1="100" y1="130" x2="100" y2="204" stroke="${shade(top.color, -0.2)}" stroke-width="1.2"/>`);
        break;
      case 'polo':
        parts.push(`<path d="M88,114 L100,126 L112,114 L116,122 L100,132 L84,122 Z" fill="${top.accent}"/><circle cx="100" cy="138" r="2" fill="${top.accent}"/><circle cx="100" cy="148" r="2" fill="${top.accent}"/>`);
        break;
      case 'hoodie':
        parts.push(`<path d="M78,116 Q100,138 122,116 Q118,108 100,108 Q82,108 78,116 Z" fill="${top.accent}"/>`);
        parts.push(`<path d="M94,128 L92,156 M106,128 L108,156" stroke="#eee" stroke-width="2" opacity=".8"/>`);
        parts.push(`<path d="M78,172 L122,172 L126,196 L74,196 Z" fill="${top.accent}" opacity=".7"/>`);
        break;
      case 'blazer': {
        const inner = top.accent;
        if (o.detail === 'vest') parts.push(`<path d="M84,115 L100,178 L116,115 Z" fill="${o.detailColor}"/>`);
        parts.push(`<path d="M89,115 L100,150 L111,115 Z" fill="${inner}"/>`);
        parts.push(`<path d="M84,115 L100,166 L88,140 L78,124 Z M116,115 L100,166 L112,140 L122,124 Z" fill="${shade(top.color, -0.12)}"/>`);
        parts.push(`<circle cx="100" cy="176" r="2.6" fill="${shade(top.color, 0.3)}"/><circle cx="100" cy="190" r="2.6" fill="${shade(top.color, 0.3)}"/>`);
        break;
      }
      case 'jacket':
        parts.push(`<path d="M84,114 L100,124 L116,114 L118,124 L100,134 L82,124 Z" fill="${shade(top.color, -0.15)}"/>`);
        break;
      case 'sweater':
        parts.push(`<rect x="66" y="196" width="68" height="8" rx="3" fill="${top.accent}" opacity=".8"/><path d="M86,116 Q100,126 114,116" stroke="${top.accent}" stroke-width="5" fill="none"/>`);
        break;
      case 'turtleneck':
        parts.push(`<rect x="86" y="100" width="28" height="22" rx="8" fill="${top.accent}"/>`);
        break;
      case 'coat':
        parts.push(`<path d="M86,114 L100,150 L80,132 Z M114,114 L100,150 L120,132 Z" fill="${top.accent}"/><line x1="100" y1="150" x2="100" y2="246" stroke="${shade(top.color, -0.25)}" stroke-width="2"/>`);
        for (const y of [168, 188, 208]) parts.push(`<circle cx="92" cy="${y}" r="2.4" fill="${shade(top.color, -0.3)}"/><circle cx="108" cy="${y}" r="2.4" fill="${shade(top.color, -0.3)}"/>`);
        break;
      case 'dress':
      case 'gown':
        parts.push(`<path d="M80,116 Q100,140 120,116" stroke="${top.accent}" stroke-width="3" fill="none"/>`);
        break;
    }
    // Détails
    const dc = o.detailColor ?? top.accent;
    if (o.detail === 'tie') parts.push(`<path d="M96,118 L104,118 L106,126 L102,174 L100,180 L98,174 L94,126 Z" fill="${dc}"/>`);
    if (o.detail === 'bowtie') parts.push(`<path d="M100,122 L88,116 L88,128 Z M100,122 L112,116 L112,128 Z" fill="${dc}"/><circle cx="100" cy="122" r="3" fill="${dc}"/>`);
    if (o.detail === 'logo') parts.push(`<path d="M106,146 l8,-8 l8,8 l-8,8 Z" fill="${dc}"/>`);
    if (o.detail === 'belt') parts.push(`<rect x="${dress ? 70 : 64}" y="${dress ? 160 : 194}" width="${dress ? 60 : 72}" height="7" rx="2" fill="${dc}"/><rect x="96" y="${dress ? 159 : 193}" width="8" height="9" rx="1" fill="#d8c08a"/>`);
    if (o.detail === 'scarf') parts.push(`<path d="M82,112 Q100,126 118,112 L120,120 Q100,134 80,120 Z M104,124 L112,160 L104,162 L98,128 Z" fill="${dc}"/>`);
    if (o.detail === 'zip') parts.push(`<line x1="100" y1="124" x2="100" y2="204" stroke="${dc}" stroke-width="2.4"/>`);
  } else {
    parts.push(`<path d="M80,116 Q100,108 120,116" stroke="${shade(top.color, -0.2)}" stroke-width="3" fill="none"/>`);
  }

  // Tête
  parts.push(`<circle cx="70" cy="78" r="7" fill="${skinDark}"/><circle cx="130" cy="78" r="7" fill="${skinDark}"/>`);
  parts.push(`<ellipse cx="100" cy="72" rx="30" ry="36" fill="${skin}"/>`);
  if (!back) {
    parts.push(`<ellipse cx="100" cy="92" rx="22" ry="14" fill="#000" opacity=".05"/>`);
    // Visage
    const browW = fem ? 1.8 : 3;
    parts.push(`<path d="M82,${fem ? 66 : 67} Q89,${fem ? 61 : 63} 95,66 M105,66 Q111,${fem ? 61 : 63} 118,${fem ? 66 : 67}" stroke="${shade(hair, -0.05)}" stroke-width="${browW}" fill="none" stroke-linecap="round"/>`);
    parts.push(`<ellipse cx="89" cy="76" rx="3.3" ry="4" fill="#1d1a19"/><ellipse cx="111" cy="76" rx="3.3" ry="4" fill="#1d1a19"/>`);
    parts.push(`<circle cx="90.2" cy="74.6" r="1.1" fill="#fff"/><circle cx="112.2" cy="74.6" r="1.1" fill="#fff"/>`);
    if (fem) parts.push(`<path d="M85,73 L83,71 M93,73 L95,71 M107,73 L105,71 M115,73 L117,71" stroke="#1d1a19" stroke-width="1.2"/>`);
    parts.push(`<path d="M100,80 Q104,88 98,90" stroke="${shade(skin, -0.22)}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`);
    if (fem) parts.push(`<path d="M92,97 Q100,93 108,97 Q100,103 92,97 Z" fill="${shade(skin, -0.28)}"/>`);
    else parts.push(`<path d="M92,97 Q100,101 108,97" stroke="${shade(skin, -0.32)}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`);
    // Cheveux avant
    if (hs.shade) parts.push(`<path d="${hs.shade}" fill="${hair}" opacity=".45"/>`);
    parts.push(`<path d="${hs.front}" fill="${hair}"/>`);
  } else {
    // Vue de dos : l'arrière du crâne est couvert
    if (hs.id !== 'buzz' && hs.id !== 'mohawk') parts.push(`<path d="M67,82 C62,30 138,30 133,82 C126,104 74,104 67,82 Z" fill="${hair}"/>`);
    else parts.push(`<path d="M70,70 C68,40 132,40 130,70 C124,58 76,58 70,70 Z" fill="${hair}" opacity=".5"/>`);
    if (hs.front && hs.id === 'mohawk') parts.push(`<path d="${hs.front}" fill="${hair}"/>`);
    if (hs.back) parts.push(`<path d="${hs.back}" fill="${hair}" opacity=".95"/>`);
  }

  const viewBox = opts.crop === 'bust' ? '40 0 120 170' : '0 0 200 320';
  const filter = opts.dead ? `<filter id="dead-${uid}"><feColorMatrix type="saturate" values="0.1"/></filter>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"><defs>${defs}${filter}</defs><g${opts.dead ? ` filter="url(#dead-${uid})" opacity=".75"` : ''}>${parts.join('')}</g></svg>`;
}

/** Cache d'images pour le rendu canvas. */
const imageCache = new Map<string, HTMLImageElement>();
export function avatarImage(c: Character, view: 'front' | 'back' = 'front', dead = false): HTMLImageElement {
  const key = `${JSON.stringify(c)}|${view}|${dead}`;
  let img = imageCache.get(key);
  if (!img) {
    img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(avatarSvg(c, { view, dead, uid: `c${imageCache.size}` }))}`;
    imageCache.set(key, img);
  }
  return img;
}
