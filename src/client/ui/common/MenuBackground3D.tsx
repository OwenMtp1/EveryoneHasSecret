import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { WORLD_H, WORLD_W } from '@shared/content/villa';
import { buildVilla } from '../../three/villa3d';
import { loadEnvironment } from '../../three/materials';
import { useStore } from '../../store';
import { NightBackground } from './NightBackground';

/**
 * Fond vivant des menus : la Villa Beaumont en 3D, de nuit, sous la pluie.
 * Caméra en lent travelling, fenêtres éclairées, éclairs. Repli 2D si WebGL est indisponible.
 */
export function MenuBackground3D({ dim }: { dim: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useStore((s) => s.settings.reducedMotion);
  const failed = useRef(false);

  useEffect(() => {
    const host = ref.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      failed.current = true;
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#04050a');
    scene.fog = new THREE.FogExp2('#05070d', 0.012);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
    const hemi = new THREE.HemisphereLight('#7083b5', '#0a0a10', 0.9);
    scene.add(hemi);
    const moon = new THREE.DirectionalLight('#9fb4e6', 0.6);
    moon.position.set(60, 50, 80);
    scene.add(moon);
    loadEnvironment(renderer, scene, 0.3);
    const villa = buildVilla({ roof: true });
    scene.add(villa.group);
    // Lanternes de l'allée et du perron
    for (const [x, z] of [[17, 24.5], [24.5, 24.5], [8, 3], [30, 3]] as const) {
      const l = new THREE.PointLight('#ffb66b', 25, 14, 1.6);
      l.position.set(x, 2.6, z);
      scene.add(l);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.4, 8), new THREE.MeshStandardMaterial({ color: '#111' }));
      post.position.set(x, 1.2, z);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), new THREE.MeshBasicMaterial({ color: '#ffd29a' }));
      lamp.position.set(x, 2.55, z);
      scene.add(post, lamp);
    }
    // Lune
    const moonDisc = new THREE.Mesh(new THREE.SphereGeometry(3, 24, 16), new THREE.MeshBasicMaterial({ color: '#c8d2e8', fog: false }));
    moonDisc.position.set(110, 70, 160);
    scene.add(moonDisc);
    // Pluie
    const N = reduced ? 0 : 5000;
    const pos = new Float32Array(N * 6);
    for (let i = 0; i < N; i++) {
      const x = WORLD_W / 2 + (Math.random() - 0.5) * 120;
      const z = WORLD_H / 2 + (Math.random() - 0.5) * 120;
      const y = Math.random() * 30;
      pos.set([x, y, z, x + 0.05, y - 0.7, z + 0.03], i * 6);
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: '#8ea3cc', transparent: true, opacity: 0.32 }));
    scene.add(rain);

    const resize = () => {
      const w = host.clientWidth || 1;
      const h = host.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener('resize', resize);
    const clock = new THREE.Clock();
    let flash = 0;
    let next = 5;
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, clock.getDelta());
      const t = clock.elapsedTime;
      const a = reduced ? 0.6 : 0.6 + Math.sin(t * 0.035) * 0.45;
      const cx = WORLD_W / 2;
      const cz = WORLD_H / 2;
      camera.position.set(cx + 4 + Math.sin(a) * 30, 7 + Math.sin(t * 0.07) * 1.2, cz + 10 + Math.cos(a) * 26);
      camera.lookAt(cx - 8, 3.5, cz + 2);
      if (N) {
        const arr = rg.getAttribute('position').array as Float32Array;
        for (let i = 0; i < arr.length; i += 6) {
          arr[i + 1] -= dt * 22;
          arr[i + 4] -= dt * 22;
          if (arr[i + 4] < 0) {
            arr[i + 1] += 30;
            arr[i + 4] += 30;
          }
        }
        rg.getAttribute('position').needsUpdate = true;
      }
      if (!reduced && t > next) {
        flash = 1;
        next = t + 7 + Math.random() * 12;
      }
      hemi.intensity = 0.35 + flash * 3;
      moon.intensity = 0.6 + flash * 2;
      flash = Math.max(0, flash - dt * 3);
      villa.update(t);
      renderer.render(scene, camera);
    };
    loop();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [reduced]);

  if (failed.current) return <NightBackground dim={dim} />;
  return <div ref={ref} className={`three-bg ${dim ? 'dim' : ''}`} aria-hidden />;
}
