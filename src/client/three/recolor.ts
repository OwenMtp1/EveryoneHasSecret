/**
 * Recoloration des personnages réalistes selon le créateur (peau, haut, bas, chaussures, cheveux).
 *
 * Les modèles ne sont pas modulaires : leurs vêtements sont peints dans la texture (femme) ou portés
 * par des maillages séparés (homme). On garde le DÉTAIL de la texture (plis, coutures, ombrage) et on
 * remplace sa COULEUR : couleur cible × (luminance du texel / luminance moyenne de la zone).
 *
 * Zones d'une texture unique : masque calculé une fois par modèle, d'après la couleur des texels
 * (R = peau, G = haut, B = bas, A = cheveux ; 2e masque R = chaussures).
 */
import * as THREE from 'three';

export type Region = 'skin' | 'top' | 'bottom' | 'hair' | 'shoes';
export const REGIONS: Region[] = ['skin', 'top', 'bottom', 'hair', 'shoes'];

/** Classement d'un texel (couleurs sRGB 0–1) pour le modèle féminin (Michelle). */
export type Classifier = (r: number, g: number, b: number) => Region | null;

export interface RegionMasks {
  maskA: THREE.Texture;
  maskB: THREE.Texture;
  /** luminance moyenne (linéaire) de chaque zone dans la texture d'origine */
  lum: Record<Region, number>;
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const luminance = (r: number, g: number, b: number) => 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);

function hsv(r: number, g: number, b: number) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 1e-5) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

/** Classement de la texture de Michelle : peau brune, haut gris, pantalon jaune, baskets blanches, cheveux noirs. */
export const classifyFeminine: Classifier = (r, g, b) => {
  const { h, s, v } = hsv(r, g, b);
  if (v < 0.2) return 'hair';
  if (h >= 42 && h <= 65 && s > 0.45 && v > 0.55) return 'bottom';
  if (h >= 8 && h <= 40 && s > 0.25 && s < 0.8 && v > 0.2 && v < 0.8) return 'skin';
  if (s < 0.12 && v > 0.88) return 'shoes';
  if (s < 0.2 && v >= 0.3) return 'top';
  return null;
};

/** Calcule les masques de zones d'une texture (une fois par modèle). */
export function computeMasks(image: CanvasImageSource & { width: number; height: number }, classify: Classifier, size = 512): RegionMasks {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0, size, size);
  const src = ctx.getImageData(0, 0, size, size).data;
  const a = new Uint8Array(size * size * 4);
  const bm = new Uint8Array(size * size * 4);
  const sum: Record<Region, number> = { skin: 0, top: 0, bottom: 0, hair: 0, shoes: 0 };
  const count: Record<Region, number> = { skin: 0, top: 0, bottom: 0, hair: 0, shoes: 0 };
  for (let i = 0; i < size * size; i++) {
    const r = src[i * 4] / 255;
    const g = src[i * 4 + 1] / 255;
    const b = src[i * 4 + 2] / 255;
    const reg = classify(r, g, b);
    if (!reg) continue;
    sum[reg] += luminance(r, g, b);
    count[reg]++;
    if (reg === 'skin') a[i * 4] = 255;
    else if (reg === 'top') a[i * 4 + 1] = 255;
    else if (reg === 'bottom') a[i * 4 + 2] = 255;
    else if (reg === 'hair') a[i * 4 + 3] = 255;
    else bm[i * 4] = 255;
  }
  const tex = (data: Uint8Array) => {
    const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    // même orientation que les textures glTF (flipY = false)
    t.flipY = false;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    return t;
  };
  const lum = {} as Record<Region, number>;
  for (const k of REGIONS) lum[k] = count[k] ? sum[k] / count[k] : 0.2;
  return { maskA: tex(a), maskB: tex(bm), lum };
}

/** Luminance moyenne d'une texture entière (pour un maillage d'une seule zone). */
export function averageLuminance(image: CanvasImageSource & { width: number; height: number }, size = 64): number {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0, size, size);
  const d = ctx.getImageData(0, 0, size, size).data;
  let s = 0;
  for (let i = 0; i < d.length; i += 4) s += luminance(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255);
  return Math.max(0.02, s / (size * size));
}

/**
 * Applique la recoloration à un matériau texturé.
 * - `masks` fourni : texture à plusieurs zones (couleurs par zone) ;
 * - sinon : tout le matériau est la zone `whole`.
 */
export function applyRecolor(
  mat: THREE.MeshStandardMaterial,
  colors: Partial<Record<Region, string>>,
  opts: { masks?: RegionMasks; whole?: { region: Region; lum: number } },
) {
  const col = (r: Region) => new THREE.Color(colors[r] ?? '#ffffff');
  const lum = (r: Region) => opts.masks?.lum[r] ?? opts.whole?.lum ?? 0.2;
  const uniforms = {
    uSkin: { value: col('skin') },
    uTop: { value: col('top') },
    uBottom: { value: col('bottom') },
    uHair: { value: col('hair') },
    uShoes: { value: col('shoes') },
    uLum: { value: new THREE.Vector4(lum('skin'), lum('top'), lum('bottom'), lum('hair')) },
    uLumShoes: { value: lum('shoes') },
    uMaskA: { value: opts.masks?.maskA ?? null },
    uMaskB: { value: opts.masks?.maskB ?? null },
    uWhole: { value: opts.whole ? REGIONS.indexOf(opts.whole.region) : -1 },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec3 uSkin; uniform vec3 uTop; uniform vec3 uBottom; uniform vec3 uHair; uniform vec3 uShoes;
uniform vec4 uLum; uniform float uLumShoes; uniform int uWhole;
${opts.masks ? 'uniform sampler2D uMaskA; uniform sampler2D uMaskB;' : ''}
vec3 recolorZone(vec3 c, float l, vec3 target, float avg) {
  return target * clamp(l / max(avg, 0.01), 0.0, 2.2);
}`,
      )
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  vec3 c = sampledDiffuseColor.rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  ${
    opts.masks
      ? `vec4 mA = texture2D(uMaskA, vMapUv);
  float mS = texture2D(uMaskB, vMapUv).r;
  c = mix(c, recolorZone(c, l, uSkin, uLum.x), mA.r);
  c = mix(c, recolorZone(c, l, uTop, uLum.y), mA.g);
  c = mix(c, recolorZone(c, l, uBottom, uLum.z), mA.b);
  c = mix(c, recolorZone(c, l, uHair, uLum.w), mA.a);
  c = mix(c, recolorZone(c, l, uShoes, uLumShoes), mS);`
      : `vec3 t = uWhole == 0 ? uSkin : uWhole == 1 ? uTop : uWhole == 2 ? uBottom : uWhole == 3 ? uHair : uShoes;
  float avg = uWhole == 4 ? uLumShoes : uWhole == 0 ? uLum.x : uWhole == 1 ? uLum.y : uWhole == 2 ? uLum.z : uLum.w;
  c = recolorZone(c, l, t, avg);`
  }
  diffuseColor *= vec4(c, sampledDiffuseColor.a);
#endif`,
      );
  };
  // une clé par type de recoloration : les personnages partagent les programmes compilés
  mat.customProgramCacheKey = () => (opts.masks ? 'recolor-masks' : 'recolor-whole');
  mat.color.set('#ffffff');
  mat.needsUpdate = true;
}
