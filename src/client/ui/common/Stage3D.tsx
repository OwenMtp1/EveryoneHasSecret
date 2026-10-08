import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { Character } from '@shared/types';
import { buildCharacter, type Character3D } from '../../three/character3d';
import { labelSprite } from '../../three/sprites';

export interface StageActor {
  key: string;
  character: Character;
  label?: string;
  highlight?: boolean;
  dim?: boolean;
}

/**
 * Scène 3D de présentation : un ou plusieurs personnages sur un plateau éclairé.
 * Utilisée par le créateur de personnage, le lobby, le profil et l'épilogue.
 * Glisser pour tourner (si `rotatable`).
 */
export function Stage3D({
  actors,
  rotatable = false,
  angle = 0,
  className,
  zoom = 1,
}: {
  actors: StageActor[];
  rotatable?: boolean;
  angle?: number;
  className?: string;
  zoom?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const api = useRef<{ set: (a: StageActor[]) => void; setAngle: (a: number) => void } | null>(null);

  useEffect(() => {
    const host = ref.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    scene.add(new THREE.HemisphereLight('#8090b8', '#140f0c', 0.7));
    const key = new THREE.SpotLight('#ffd6a0', 60, 20, 0.7, 0.6, 1.4);
    key.position.set(2, 5, 4);
    scene.add(key, key.target);
    const rim = new THREE.DirectionalLight('#6d8cff', 1.2);
    rim.position.set(-3, 3, -4);
    scene.add(rim);
    // Plateau
    const glowTex = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const x = c.getContext('2d')!;
      const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,190,110,.55)');
      g.addColorStop(1, 'rgba(255,190,110,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(c);
    })();
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    const pivot = new THREE.Group();
    scene.add(pivot);
    let items: { a: StageActor; c3d: Character3D; tag?: THREE.Sprite }[] = [];
    let rot = 0;
    let targetRot = 0;

    const layout = () => {
      const n = Math.max(1, items.length);
      const spacing = 1.05;
      items.forEach((it, i) => {
        const x = (i - (n - 1) / 2) * spacing;
        it.c3d.root.position.set(x, 0, n > 1 ? -Math.abs(x) * 0.15 : 0);
        if (it.tag) it.tag.position.set(x, 2.02, it.c3d.root.position.z);
      });
      const width = n > 1 ? (n - 1) * spacing + 1.4 : 1;
      floor.scale.set(width + 2, 3, 1);
      const w = host.clientWidth || 1;
      const h = host.clientHeight || 1;
      camera.aspect = w / h;
      const fitH = (n > 1 ? 2.75 : 2.3) / zoom;
      const fitW = (width + 0.6) / camera.aspect / zoom;
      const span = Math.max(fitH, fitW);
      const dist = span / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      camera.position.set(0, 1.3, dist);
      camera.lookAt(0, n > 1 ? 1.08 : 0.98, 0);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };

    const set = (actors: StageActor[]) => {
      const keyOf = (a: StageActor) => `${a.key}|${JSON.stringify(a.character)}|${a.label}|${a.highlight}`;
      if (items.length === actors.length && items.every((it, i) => keyOf(it.a) === keyOf(actors[i]))) return;
      for (const it of items) {
        pivot.remove(it.c3d.root);
        if (it.tag) pivot.remove(it.tag);
        it.c3d.dispose();
      }
      items = actors.map((a) => {
        const c3d = buildCharacter(a.character);
        pivot.add(c3d.root);
        let tag: THREE.Sprite | undefined;
        if (a.label) {
          tag = labelSprite(a.label, a.highlight ? '#9be3b4' : '#efe6d2');
          pivot.add(tag);
        }
        return { a, c3d, tag };
      });
      layout();
    };
    api.current = {
      set,
      setAngle: (v) => {
        targetRot = v;
      },
    };
    set(actors);
    targetRot = angle;

    let drag: number | null = null;
    const down = (e: PointerEvent) => {
      if (rotatable) drag = e.clientX;
    };
    const move = (e: PointerEvent) => {
      if (drag === null) return;
      targetRot += (e.clientX - drag) * 0.012;
      drag = e.clientX;
    };
    const up = () => (drag = null);
    renderer.domElement.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    const ro = new ResizeObserver(layout);
    ro.observe(host);

    const clock = new THREE.Clock();
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, clock.getDelta());
      rot += (targetRot - rot) * Math.min(1, dt * 8);
      for (const it of items) {
        it.c3d.root.rotation.y = items.length === 1 ? rot : Math.sin(clock.elapsedTime * 0.4 + it.c3d.root.position.x) * 0.25;
        it.c3d.update(dt, 0);
      }
      renderer.render(scene, camera);
    };
    loop();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      for (const it of items) it.c3d.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      api.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rotatable, zoom]);

  useEffect(() => {
    api.current?.set(actors);
  }, [actors]);
  useEffect(() => {
    api.current?.setAngle(angle);
  }, [angle]);

  return <div ref={ref} className={`stage3d ${className ?? ''}`} style={{ cursor: rotatable ? 'grab' : undefined }} />;
}
