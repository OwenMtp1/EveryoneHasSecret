/**
 * Villa Beaumont en 3D, générée à partir des données de plan (shared/content/villa.ts).
 * 1 tuile = 1 mètre. Monde : x = colonne, z = ligne, y = hauteur.
 * Ajouter une pièce / un meuble dans les données suffit à le faire apparaître ici.
 */
import * as THREE from 'three';
import { DOORS, FURNITURE, ROOMS, WORLD_H, WORLD_W, buildWorldGrid, type FurnitureDef, type RoomDef } from '@shared/content/villa';

export const WALL_H = 3;
const grid = buildWorldGrid();

function floorTexture(room: RoomDef): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  const base = new THREE.Color(room.floorColor);
  x.fillStyle = room.floorColor;
  x.fillRect(0, 0, 128, 128);
  const rnd = (i: number) => {
    const s = Math.sin(i * 91.7 + room.id.length * 13.1) * 43758.5;
    return s - Math.floor(s);
  };
  const shade = (k: number) => `#${base.clone().multiplyScalar(k).getHexString()}`;
  switch (room.floor) {
    case 'wood':
      for (let i = 0; i < 4; i++) {
        x.fillStyle = shade(0.85 + rnd(i) * 0.3);
        x.fillRect(0, i * 32, 128, 31);
        x.fillStyle = 'rgba(0,0,0,.35)';
        x.fillRect(((i * 53) % 128) | 0, i * 32, 2, 32);
      }
      break;
    case 'tile':
      for (let i = 0; i < 2; i++)
        for (let j = 0; j < 2; j++) {
          x.fillStyle = (i + j) % 2 ? shade(1.25) : shade(0.85);
          x.fillRect(i * 64 + 1, j * 64 + 1, 62, 62);
        }
      break;
    case 'stone':
      x.fillStyle = shade(1.15);
      x.fillRect(2, 2, 124, 124);
      x.strokeStyle = shade(0.7);
      x.lineWidth = 3;
      x.strokeRect(1, 1, 126, 126);
      break;
    case 'grass':
    case 'gravel':
      for (let i = 0; i < 260; i++) {
        x.fillStyle = shade(0.7 + rnd(i) * 0.7);
        const s = room.floor === 'grass' ? 3 : 2;
        x.fillRect(rnd(i * 3) * 128, rnd(i * 7) * 128, s, room.floor === 'grass' ? 6 : s);
      }
      break;
    case 'carpet':
      x.strokeStyle = shade(1.3);
      x.lineWidth = 2;
      for (let i = 8; i < 128; i += 16) {
        x.beginPath();
        x.moveTo(i, 0);
        x.lineTo(i, 128);
        x.stroke();
      }
      x.globalAlpha = 0.4;
      x.fillStyle = shade(0.8);
      x.fillRect(0, 0, 128, 128);
      break;
    case 'concrete':
      for (let i = 0; i < 80; i++) {
        x.fillStyle = shade(0.8 + rnd(i) * 0.4);
        x.fillRect(rnd(i * 5) * 128, rnd(i * 11) * 128, 6, 6);
      }
      break;
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const M = (color: string, o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o });

function box(parent: THREE.Object3D, w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/** Mobilier composé de primitives selon son type. Coordonnées : coin (f.x, f.y), taille (f.w, f.h). */
function buildFurniture(f: FurnitureDef): THREE.Group {
  const g = new THREE.Group();
  const cx = f.x + f.w / 2;
  const cz = f.y + f.h / 2;
  g.position.set(cx, 0, cz);
  const w = f.w - 0.1;
  const d = f.h - 0.1;
  const wood = M('#5c3b24');
  const darkWood = M('#3a2416');
  switch (f.kind) {
    case 'table':
    case 'desk': {
      const top = f.kind === 'desk' ? darkWood : wood;
      box(g, w, 0.06, d, top, 0, 0.76, 0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, 0.06, 0.74, 0.06, top, sx * (w / 2 - 0.08), 0.37, sz * (d / 2 - 0.08));
      if (f.kind === 'desk') box(g, 0.35, 0.05, 0.25, M('#d8cfb8'), 0.2, 0.81, 0);
      break;
    }
    case 'counter':
      box(g, w, 0.88, d, M('#e7e0d2'), 0, 0.44, 0);
      box(g, w + 0.04, 0.05, d + 0.04, M('#2b2b2e', { roughness: 0.3 }), 0, 0.9, 0);
      break;
    case 'sink':
      box(g, w, 0.85, d, M('#dfe5e8', { roughness: 0.3 }), 0, 0.42, 0);
      box(g, w * 0.7, 0.04, d * 0.6, M('#7b8a92', { roughness: 0.2, metalness: 0.6 }), 0, 0.86, 0);
      break;
    case 'sofa':
      box(g, w, 0.42, d, M('#6b1f2a'), 0, 0.21, 0);
      box(g, w, 0.5, 0.18, M('#5a1923'), 0, 0.55, -d / 2 + 0.09);
      for (const s of [-1, 1]) box(g, 0.18, 0.62, d, M('#5a1923'), s * (w / 2 - 0.09), 0.31, 0);
      break;
    case 'piano':
      box(g, w, 0.32, d, M('#0c0c0e', { roughness: 0.15 }), 0, 0.85, 0);
      box(g, w * 0.9, 0.04, 0.2, M('#f2efe8'), 0, 0.92, d / 2 - 0.1);
      for (const [sx, sz] of [[-1, -1], [1, -1], [0, 1]]) box(g, 0.08, 0.7, 0.08, M('#0c0c0e'), sx * (w / 2 - 0.15), 0.35, sz * (d / 2 - 0.15));
      break;
    case 'shelf': {
      const tall = 1.9;
      box(g, w, tall, d, darkWood, 0, tall / 2, 0);
      const colors = ['#7a2a2a', '#2b4a6b', '#3d5a33', '#8a6d2f', '#4b3354'];
      for (let r = 0; r < 4; r++)
        for (let i = 0; i < Math.floor((Math.max(w, d) - 0.2) / 0.16); i++) {
          const along = -Math.max(w, d) / 2 + 0.1 + i * 0.16;
          const bm = M(colors[(i + r) % colors.length]);
          if (w >= d) box(g, 0.1, 0.26, d * 0.7, bm, along, 0.3 + r * 0.45, d * 0.05);
          else box(g, d * 0.7, 0.26, 0.1, bm, w * 0.05, 0.3 + r * 0.45, along);
        }
      break;
    }
    case 'terminal':
      box(g, w, 0.75, d, darkWood, 0, 0.375, 0);
      box(g, 0.6, 0.42, 0.06, M('#0a0a0a'), 0, 1.0, 0);
      box(g, 0.54, 0.36, 0.01, new THREE.MeshStandardMaterial({ color: '#0d2b1e', emissive: '#2bd17a', emissiveIntensity: 0.6 }), 0, 1.0, 0.035).name = 'screen';
      break;
    case 'bath':
      box(g, w, 0.6, d, M('#f4f4f2', { roughness: 0.2 }), 0, 0.3, 0);
      box(g, w - 0.16, 0.02, d - 0.16, M('#6c8fa3', { roughness: 0.05 }), 0, 0.55, 0);
      break;
    case 'bed':
      box(g, w, 0.35, d, wood, 0, 0.175, 0);
      box(g, w - 0.08, 0.2, d - 0.08, M('#efe9dd'), 0, 0.44, 0);
      box(g, w - 0.06, 0.08, d * 0.6, M(f.roomId === 'bedroom2' ? '#5a1d2b' : '#24365e'), 0, 0.56, d * 0.18);
      box(g, w * 0.7, 0.12, 0.32, M('#ffffff'), 0, 0.6, -d / 2 + 0.25);
      box(g, w, 1.0, 0.08, darkWood, 0, 0.5, -d / 2 + 0.04);
      break;
    case 'wardrobe':
      box(g, w, 2.1, d, darkWood, 0, 1.05, 0);
      break;
    case 'clock':
      box(g, w * 0.6, 2.0, d * 0.6, darkWood, 0, 1.0, 0);
      box(g, 0.3, 0.3, 0.02, M('#e8dcc0', { emissive: '#3a2a10', emissiveIntensity: 0.3 }), 0, 1.6, d * 0.3 + 0.01);
      break;
    case 'fountain': {
      const basin = new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2, 0.5, 24), M('#7b8188'));
      basin.position.y = 0.25;
      g.add(basin);
      const water = new THREE.Mesh(new THREE.CylinderGeometry(w / 2 - 0.1, w / 2 - 0.1, 0.02, 24), M('#2d4a5f', { roughness: 0.05, metalness: 0.3 }));
      water.position.y = 0.48;
      g.add(water);
      box(g, 0.2, 1.2, 0.2, M('#8d939a'), 0, 0.6, 0);
      break;
    }
    case 'hedge':
      box(g, w, 1.3, d, M('#1d3b20'), 0, 0.65, 0);
      break;
    case 'tree': {
      box(g, 0.3, 2.2, 0.3, M('#3b2a1c'), 0, 1.1, 0);
      const fol = new THREE.Mesh(new THREE.SphereGeometry(1.4, 14, 10), M('#183020'));
      fol.position.y = 3;
      fol.castShadow = true;
      g.add(fol);
      break;
    }
    case 'car': {
      const paint = M('#4a1414', { roughness: 0.25, metalness: 0.5 });
      box(g, w, 0.55, d, paint, 0, 0.45, 0);
      box(g, w * 0.55, 0.45, d * 0.9, M('#1a1c22', { roughness: 0.1, metalness: 0.4 }), -w * 0.05, 0.95, 0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 16), M('#111'));
        wh.rotation.x = Math.PI / 2;
        wh.position.set(sx * (w / 2 - 0.5), 0.3, sz * (d / 2));
        g.add(wh);
      }
      break;
    }
    case 'fireplace':
      box(g, w + 0.3, 1.2, d, M('#6b625a'), 0, 0.6, 0);
      box(g, w * 0.5, 0.5, d * 0.7, new THREE.MeshStandardMaterial({ color: '#ff7a2a', emissive: '#ff5a10', emissiveIntensity: 1.4 }), 0.1, 0.3, 0).name = 'fire';
      break;
    case 'crate':
      box(g, w * 0.55, 0.6, d * 0.55, M('#7a5a36'), -w * 0.18, 0.3, -d * 0.18);
      box(g, w * 0.5, 0.5, d * 0.5, M('#6b4e2f'), w * 0.2, 0.25, d * 0.2);
      box(g, w * 0.45, 0.45, d * 0.45, M('#806040'), -w * 0.1, 0.83, -d * 0.1);
      break;
  }
  g.userData.furnitureId = f.id;
  return g;
}

export interface Villa3D {
  group: THREE.Group;
  /** surfaces bloquant la caméra */
  colliders: THREE.Object3D[];
  setBlackout(on: boolean): void;
  setUnlocked(ids: string[]): void;
  update(t: number): void;
}

export function buildVilla(opts: { roof?: boolean } = {}): Villa3D {
  const group = new THREE.Group();
  const colliders: THREE.Object3D[] = [];

  // Sol extérieur infini
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), M('#0d140e'));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(WORLD_W / 2, -0.02, WORLD_H / 2);
  ground.receiveShadow = true;
  group.add(ground);

  // Sols des pièces
  const floorMats = new Map<string, THREE.MeshStandardMaterial>();
  for (const r of ROOMS) {
    const tex = floorTexture(r);
    tex.repeat.set(r.rect.w, r.rect.h);
    const m = M('#ffffff', { map: tex, roughness: r.floor === 'tile' ? 0.35 : 0.85 });
    floorMats.set(r.id, m);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(r.rect.w, r.rect.h), m);
    f.rotation.x = -Math.PI / 2;
    f.position.set(r.rect.x + r.rect.w / 2, 0, r.rect.y + r.rect.h / 2);
    f.receiveShadow = true;
    group.add(f);
  }
  // Seuils de porte
  for (const d of DOORS) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), M('#3d2a1c'));
    f.rotation.x = -Math.PI / 2;
    f.position.set(d.x + 0.5, 0.005, d.y + 0.5);
    group.add(f);
  }

  // Murs (instanciés) : intérieurs hauts, murets bas autour des zones extérieures
  const roomAtIdx = (x: number, y: number) => (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H ? 0 : grid.rooms[y * WORLD_W + x]);
  const walls: { x: number; y: number; h: number; color: THREE.Color }[] = [];
  const windows: { x: number; y: number; axis: 'x' | 'z'; outdoorSide: number }[] = [];
  for (let y = -1; y <= WORLD_H; y++)
    for (let x = -1; x <= WORLD_W; x++) {
      if (roomAtIdx(x, y)) continue;
      let indoor = false;
      let outdoor = false;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const r = roomAtIdx(x + dx, y + dy);
          if (!r) continue;
          if (ROOMS[r - 1].outdoor) outdoor = true;
          else indoor = true;
        }
      if (!indoor && !outdoor) continue;
      const h = indoor ? WALL_H : 1.1;
      walls.push({ x, y, h, color: new THREE.Color(indoor ? (outdoor ? '#5d574f' : '#4a3f36') : '#3b3a36') });
      // Fenêtres : mur entre intérieur et extérieur, une tuile sur trois
      const up = roomAtIdx(x, y - 1);
      const down = roomAtIdx(x, y + 1);
      if (up && down && ROOMS[up - 1].outdoor !== ROOMS[down - 1].outdoor && x % 3 === 1)
        windows.push({ x, y, axis: 'x', outdoorSide: ROOMS[up - 1].outdoor ? -1 : 1 });
    }
  const wallGeo = new THREE.BoxGeometry(1, 1, 1);
  const wallMat = M('#ffffff', { roughness: 0.9 });
  const wallMesh = new THREE.InstancedMesh(wallGeo, wallMat, walls.length);
  const tmp = new THREE.Object3D();
  walls.forEach((w, i) => {
    tmp.position.set(w.x + 0.5, w.h / 2, w.y + 0.5);
    tmp.scale.set(1, w.h, 1);
    tmp.updateMatrix();
    wallMesh.setMatrixAt(i, tmp.matrix);
    wallMesh.setColorAt(i, w.color);
  });
  wallMesh.castShadow = true;
  wallMesh.receiveShadow = true;
  group.add(wallMesh);
  colliders.push(wallMesh);

  // Fenêtres lumineuses
  // Côté jardin/allée : vitre éclairée de l'intérieur. Côté intérieur : vitre sombre sur la nuit.
  const windowMat = new THREE.MeshStandardMaterial({ color: '#2a1d10', emissive: '#ffb45c', emissiveIntensity: 1.2 });
  const nightGlass = new THREE.MeshStandardMaterial({ color: '#0b1220', emissive: '#1a2a48', emissiveIntensity: 0.5, roughness: 0.1, metalness: 0.3 });
  const paneGeo = new THREE.PlaneGeometry(0.8, 1.1);
  for (const w of windows) {
    for (const side of [1, -1]) {
      const outside = side === w.outdoorSide;
      const pane = new THREE.Mesh(paneGeo, outside ? windowMat : nightGlass);
      pane.position.set(w.x + 0.5, 1.6, w.y + 0.5 + side * 0.505);
      if (side < 0) pane.rotation.y = Math.PI;
      group.add(pane);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.1, 0.02), M('#1a1410'));
      bar.position.copy(pane.position);
      group.add(bar);
    }
  }

  // Portes : linteaux + battants des portes verrouillées
  const lockedDoors = new Map<string, THREE.Mesh>();
  for (const d of DOORS) {
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(1, WALL_H - 2.3, 1), M('#4a3f36'));
    lintel.position.set(d.x + 0.5, 2.3 + (WALL_H - 2.3) / 2, d.y + 0.5);
    group.add(lintel);
    colliders.push(lintel);
    if (d.lockedBy) {
      const horizontal = d.rooms.some((r) => ROOMS.find((x) => x.id === r)!.rect.y > d.y) && d.rooms.some((r) => ROOMS.find((x) => x.id === r)!.rect.y + ROOMS.find((x) => x.id === r)!.rect.h <= d.y);
      const door = new THREE.Mesh(new THREE.BoxGeometry(horizontal ? 0.96 : 0.12, 2.3, horizontal ? 0.12 : 0.96), M('#4b2c18', { roughness: 0.6 }));
      door.position.set(d.x + 0.5, 1.15, d.y + 0.5);
      door.castShadow = true;
      group.add(door);
      colliders.push(door);
      lockedDoors.set(d.id, door);
    }
  }

  // Mobilier
  const fires: THREE.Mesh[] = [];
  for (const f of FURNITURE) {
    const fg = buildFurniture(f);
    fg.traverse((o) => o.name === 'fire' && fires.push(o as THREE.Mesh));
    group.add(fg);
  }
  // Tapis du salon
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(5, 3), M('#5a1820'));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(16, 0.01, 10);
  group.add(rug);

  // Lumières : une lampe par pièce intérieure
  const roomLights: THREE.PointLight[] = [];
  const bulbs: THREE.Mesh[] = [];
  const bulbMat = new THREE.MeshStandardMaterial({ color: '#fff2d6', emissive: '#ffcf88', emissiveIntensity: 2 });
  for (const r of ROOMS) {
    if (r.outdoor) continue;
    const light = new THREE.PointLight('#ffc98a', 10, Math.max(r.rect.w, r.rect.h) * 1.4, 1.4);
    light.position.set(r.rect.x + r.rect.w / 2, WALL_H - 0.4, r.rect.y + r.rect.h / 2);
    group.add(light);
    roomLights.push(light);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), bulbMat);
    bulb.position.copy(light.position);
    group.add(bulb);
    bulbs.push(bulb);
  }

  // Plafonds (en jeu) : l'intérieur est clos, la caméra ne passe pas au-dessus des murs
  if (!opts.roof) {
    const ceilMat = M('#17130f', { side: THREE.DoubleSide });
    for (const r of ROOMS) {
      if (r.outdoor) continue;
      const c = new THREE.Mesh(new THREE.PlaneGeometry(r.rect.w + 1, r.rect.h + 1), ceilMat);
      c.rotation.x = Math.PI / 2;
      c.position.set(r.rect.x + r.rect.w / 2, WALL_H, r.rect.y + r.rect.h / 2);
      group.add(c);
      colliders.push(c);
    }
  }

  // Toit (vue extérieure du menu)
  if (opts.roof) {
    const houseX0 = 0;
    const houseX1 = WORLD_W;
    const houseZ0 = 5;
    const houseZ1 = 23;
    const roofMat = M('#1c1e24', { roughness: 0.7 });
    const len = houseX1 - houseX0;
    const depth = houseZ1 - houseZ0;
    const shape = new THREE.Shape();
    shape.moveTo(-depth / 2 - 0.6, 0);
    shape.lineTo(depth / 2 + 0.6, 0);
    shape.lineTo(0, 5.5);
    shape.closePath();
    const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: len + 1.2, bevelEnabled: false }), roofMat);
    roof.rotation.y = Math.PI / 2;
    roof.position.set(houseX0 - 0.6, WALL_H, houseZ0 + depth / 2);
    roof.castShadow = true;
    group.add(roof);
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(1.2, 4, 1.2), M('#3a332d'));
    chimney.position.set(12.5, WALL_H + 3.5, 9);
    group.add(chimney);
  }

  return {
    group,
    colliders,
    setBlackout(on) {
      for (const l of roomLights) l.visible = !on;
      bulbMat.emissiveIntensity = on ? 0 : 2;
      windowMat.emissiveIntensity = on ? 0.02 : 1.2;
    },
    setUnlocked(ids) {
      for (const [id, mesh] of lockedDoors) {
        const open = ids.includes(id);
        mesh.visible = !open;
        const i = colliders.indexOf(mesh);
        if (open && i >= 0) colliders.splice(i, 1);
      }
    },
    update(t) {
      for (const f of fires) (f.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.2 + Math.sin(t * 13) * 0.25 + Math.sin(t * 7.3) * 0.2;
    },
  };
}
