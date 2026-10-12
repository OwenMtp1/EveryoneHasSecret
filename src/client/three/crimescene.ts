/**
 * Scène de crime : chevalets jaunes numérotés posés autour d'un corps (repères des enquêteurs).
 * Petits, au ras du sol : ils ne traversent ni murs ni meubles.
 */
import * as THREE from 'three';

const numberTex = new Map<number, THREE.Texture>();
function markerTexture(n: number): THREE.Texture {
  let t = numberTex.get(n);
  if (t) return t;
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 64;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#f3c21a';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#111';
  g.font = 'bold 44px Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(n), 32, 35);
  t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  numberTex.set(n, t);
  return t;
}

const plain = new THREE.MeshStandardMaterial({ color: '#f3c21a', roughness: 0.55 });

/** Chevalet en V (deux faces inclinées, numéro sur chacune). */
function marker(n: number): THREE.Object3D {
  const g = new THREE.Group();
  const face = new THREE.MeshStandardMaterial({ map: markerTexture(n), roughness: 0.55 });
  const geo = new THREE.BoxGeometry(0.11, 0.1, 0.006);
  for (const s of [1, -1]) {
    const m = new THREE.Mesh(geo, [plain, plain, plain, plain, face, face]);
    m.position.set(0, 0.048, s * 0.022);
    m.rotation.x = s * 0.42;
    m.castShadow = true;
    g.add(m);
  }
  return g;
}

/** Repères autour d'un corps ; `count` chevalets répartis de façon stable (graine = position). */
export function buildCrimeScene(seed: number, count: number): THREE.Group {
  const g = new THREE.Group();
  let s = Math.abs(Math.floor(seed * 9301)) % 233280 || 7;
  const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rnd() * 0.8;
    const d = 0.75 + rnd() * 0.35;
    const m = marker(i + 1);
    m.position.set(Math.cos(a) * d, 0.002, Math.sin(a) * d);
    m.rotation.y = -a + Math.PI / 2 + (rnd() - 0.5) * 0.6;
    g.add(m);
  }
  return g;
}
