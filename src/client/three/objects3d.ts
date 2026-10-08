/**
 * Objets du monde en 3D, construits à partir de leur description (shared/content/objects.ts → model).
 * Un prototype par type, cloné par instance (géométries et matériaux partagés).
 */
import * as THREE from 'three';
import { objectTypeDef, type ModelPart } from '@shared/content/objects';

const protos = new Map<string, THREE.Group>();
const matCache = new Map<string, THREE.MeshStandardMaterial>();

function material(p: ModelPart) {
  const key = `${p.color}|${p.metal ?? 0}|${p.rough ?? 0.6}|${p.emissive ?? ''}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color: p.color,
      metalness: p.metal ?? 0,
      roughness: p.rough ?? 0.6,
      emissive: p.emissive ?? '#000000',
      emissiveIntensity: p.emissive ? 1.4 : 0,
    });
    matCache.set(key, m);
  }
  return m;
}

function geometry(p: ModelPart): THREE.BufferGeometry {
  switch (p.kind) {
    case 'box':
      return new THREE.BoxGeometry(p.size[0], p.size[1], p.size[2]);
    case 'cyl':
      return new THREE.CylinderGeometry(p.size[0], p.size[0], p.size[1], 20);
    case 'cone':
      return new THREE.CylinderGeometry(p.size[0] * 0.35, p.size[0], p.size[1], 20);
    case 'sphere':
      return new THREE.SphereGeometry(p.size[0], 16, 12);
    case 'torus':
      return new THREE.TorusGeometry(p.size[0], p.size[1], 10, 28);
  }
}

/** Modèle 3D d'un type d'objet, ou null s'il n'en a pas (icône de repli). */
export function objectModel(type: string): THREE.Group | null {
  let proto = protos.get(type);
  if (!proto) {
    const def = objectTypeDef(type);
    if (!def?.model) return null;
    proto = new THREE.Group();
    for (const part of def.model) {
      const mesh = new THREE.Mesh(geometry(part), material(part));
      mesh.position.set(...part.p);
      if (part.r) mesh.rotation.set(...part.r);
      mesh.castShadow = true;
      proto.add(mesh);
    }
    protos.set(type, proto);
  }
  return proto.clone();
}
