import * as THREE from 'three';

const emojiCache = new Map<string, THREE.Texture>();

/** Objet du monde : icône lisible qui flotte au-dessus du sol. */
export function emojiSprite(icon: string, size = 0.42): THREE.Sprite {
  let tex = emojiCache.get(icon);
  if (!tex) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d')!;
    const g = x.createRadialGradient(64, 64, 10, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,214,150,.45)');
    g.addColorStop(1, 'rgba(255,214,150,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
    x.font = '80px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(icon, 64, 70);
    tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    emojiCache.set(icon, tex);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(size, size, size);
  return s;
}

/** Étiquette de nom au-dessus d'un personnage. */
export function labelSprite(text: string, color = '#efe6d2'): THREE.Sprite {
  const c = document.createElement('canvas');
  const x = c.getContext('2d')!;
  const font = '600 34px Inter, system-ui, sans-serif';
  x.font = font;
  const w = Math.ceil(x.measureText(text).width) + 36;
  c.width = w;
  c.height = 56;
  x.font = font;
  x.fillStyle = 'rgba(0,0,0,.62)';
  const r = 26;
  x.beginPath();
  x.roundRect(0, 4, w, 48, r);
  x.fill();
  x.fillStyle = color;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(text, w / 2, 29);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  // Taille constante à l'écran (lisible de près comme de loin)
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: false }));
  s.renderOrder = 10;
  const h = 0.032;
  s.scale.set((h * w) / 56, h, 1);
  return s;
}
