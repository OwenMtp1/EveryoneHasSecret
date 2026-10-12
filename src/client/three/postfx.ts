/**
 * Chaîne de rendu « jeu fini » : anti-crénelage MSAA conservé en post-traitement, occlusion ambiante (GTAO :
 * coins, dessous des meubles, contact au sol), halo des lumières, puis étalonnage couleur (contraste, saturation,
 * ombres froides / lumières chaudes) et vignettage. Trois niveaux selon la machine.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';

/** GTAO sans les étiquettes, la pluie ni les vitres (elles ne doivent pas assombrir ce qu'il y a derrière). */
class SceneAOPass extends GTAOPass {
  overrideVisibility() {
    const cache = (this as unknown as { _visibilityCache: Map<THREE.Object3D, boolean> })._visibilityCache;
    this.scene.traverse((o) => {
      cache.set(o, o.visible);
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if ((o as THREE.Points).isPoints || (o as THREE.Line).isLine || (o as THREE.Sprite).isSprite || (m && !Array.isArray(m) && m.transparent)) o.visible = false;
    });
  }
}

/** Étalonnage final (après la conversion en sRGB) : contraste, saturation, virage chaud/froid, vignettage. */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    contrast: { value: 1.07 },
    saturation: { value: 1.14 },
    shadowTint: { value: new THREE.Vector3(0.94, 0.98, 1.08) },
    highlightTint: { value: new THREE.Vector3(1.06, 1.0, 0.92) },
    vignette: { value: 0.32 },
    lift: { value: 0.012 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float contrast, saturation, vignette, lift;
    uniform vec3 shadowTint, highlightTint;
    varying vec2 vUv;
    void main() {
      vec4 tex = texture2D(tDiffuse, vUv);
      vec3 c = tex.rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, saturation);
      c = (c - 0.5) * contrast + 0.5;
      // ombres légèrement bleutées, lumières chaudes (lampes, bougies)
      c *= mix(shadowTint, highlightTint, smoothstep(0.08, 0.75, l));
      c = c * (1.0 - lift) + lift;
      vec2 d = vUv - 0.5;
      c *= 1.0 - vignette * smoothstep(0.25, 0.85, dot(d, d) * 2.2);
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), tex.a);
    }`,
};

export interface PostFx {
  composer: EffectComposer;
  /** 0 = complet (AO + halo + étalonnage), 1 = étalonnage seul, 2 = rendu direct (machines modestes) */
  setLevel(level: 0 | 1 | 2): void;
  /** occlusion ambiante activable à part (scènes extérieures très vastes : coûteuse et peu utile) */
  setAO(on: boolean): void;
  render(): void;
  setSize(w: number, h: number): void;
  setPixelRatio(r: number): void;
  readonly bloom: UnrealBloomPass;
  /** passe d'occlusion (réglages, affichage de contrôle) */
  readonly ao: GTAOPass;
  dispose(): void;
}

export function createPostFx(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera): PostFx {
  // cible multi-échantillonnée : le post-traitement garde l'anti-crénelage (et les mèches de cheveux lissées)
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const ao = new SceneAOPass(scene, camera, 1, 1);
  ao.blendIntensity = 0.85;
  ao.updateGtaoMaterial({ radius: 0.55, distanceExponent: 1.6, thickness: 1.2, scale: 1.15, samples: 12, distanceFallOff: 1 });
  ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
  composer.addPass(ao);
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.55, 0.88);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  let level: 0 | 1 | 2 = 0;
  let aoAllowed = true;
  return {
    composer,
    bloom,
    ao,
    setLevel(l) {
      level = l;
      ao.enabled = l === 0 && aoAllowed;
      bloom.enabled = l === 0;
    },
    setAO(on) {
      aoAllowed = on;
      ao.enabled = level === 0 && on;
    },
    render() {
      if (level === 2) renderer.render(scene, camera);
      else composer.render();
    },
    setSize(w, h) {
      composer.setSize(w, h);
      // l'occlusion se calcule à demi-résolution : quasi invisible, deux fois moins coûteuse
      ao.setSize(Math.max(1, Math.floor((w * renderer.getPixelRatio()) / 2)), Math.max(1, Math.floor((h * renderer.getPixelRatio()) / 2)));
    },
    setPixelRatio(r) {
      composer.setPixelRatio(r);
    },
    dispose() {
      composer.dispose();
      ao.dispose();
    },
  };
}
