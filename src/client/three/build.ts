/**
 * Petites briques de construction 3D partagées (villa, mobilier, décoration).
 * Toutes les mesures sont en mètres ; les objets créés projettent et reçoivent les ombres.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export type V3 = [number, number, number];
export function box(parent: THREE.Object3D, size: V3, m: THREE.Material, pos: V3, rot: V3 = [0, 0, 0], rounded = 0) {
  const g = rounded ? new RoundedBoxGeometry(size[0], size[1], size[2], 3, Math.min(rounded, size[0] / 2.1, size[1] / 2.1, size[2] / 2.1)) : new THREE.BoxGeometry(...size);
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(...pos);
  mesh.rotation.set(...rot);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
export function cyl(parent: THREE.Object3D, rTop: number, rBot: number, h: number, m: THREE.Material, pos: V3, rot: V3 = [0, 0, 0], seg = 20) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), m);
  mesh.position.set(...pos);
  mesh.rotation.set(...rot);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
export function sphere(parent: THREE.Object3D, r: number, m: THREE.Material, pos: V3, scale: V3 = [1, 1, 1]) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), m);
  mesh.position.set(...pos);
  mesh.scale.set(...scale);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

