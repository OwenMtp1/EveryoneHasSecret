/**
 * Animations Rocketbox (même squelette Biped que les avatars) → public/characters/anims-f.glb, anims-m.glb
 *
 *   node scripts/characters/build-anims.mjs
 *
 * - seules les rotations des os du corps sont gardées (pas de visage, pas de translations d'os :
 *   chaque avatar garde ses propres longueurs d'os), plus la translation de la racine « Bip01 » ;
 * - locomotion : la translation horizontale moyenne de la racine est retirée (cycle sur place) et la
 *   vitesse correspondante (m/s, cadence 1) est consignée dans `extras.clips[nom].speed` ;
 * - `extras.hipHeight` : hauteur de la racine debout du squelette des animations (le client met à
 *   l'échelle la translation verticale selon la hauteur de bassin de chaque avatar) ;
 * - réduction des clés (interpolation linéaire / slerp, tolérance ~0,25°, 1 mm).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLIPS, FBX2GLTF, OUT, WORK, animPath } from './config.mjs';
import { fetchFiles } from './lib/rocketbox.mjs';
import { addAccessor, readAccessor, readGlb, writeGlb } from './lib/glb.mjs';
import { boneName, isBodyBone } from './lib/bones.mjs';

const ROT_TOL = 0.0045; // rad
const POS_TOL = 0.001; // m

function convert(rel) {
  const [abs] = fetchFiles([rel]);
  const work = join(WORK, 'anims');
  mkdirSync(work, { recursive: true });
  const out = join(work, rel.split('/').pop().replace('.max.fbx', ''));
  execFileSync(FBX2GLTF, ['-b', '--anim-framerate', 'bake30', '-i', abs, '-o', out], { stdio: 'pipe' });
  return readGlb(`${out}.glb`);
}

const qAngle = (a, i, b, k) => {
  const d = Math.abs(a[i * 4] * b[k * 4] + a[i * 4 + 1] * b[k * 4 + 1] + a[i * 4 + 2] * b[k * 4 + 2] + a[i * 4 + 3] * b[k * 4 + 3]);
  return 2 * Math.acos(Math.min(1, d));
};

function slerp(q, i, k, t, out) {
  let ax = q[i * 4], ay = q[i * 4 + 1], az = q[i * 4 + 2], aw = q[i * 4 + 3];
  const bx = q[k * 4], by = q[k * 4 + 1], bz = q[k * 4 + 2], bw = q[k * 4 + 3];
  let cos = ax * bx + ay * by + az * bz + aw * bw;
  if (cos < 0) (ax = -ax), (ay = -ay), (az = -az), (aw = -aw), (cos = -cos);
  let s0 = 1 - t, s1 = t;
  if (cos < 0.9995) {
    const th = Math.acos(cos);
    const sn = Math.sin(th);
    s0 = Math.sin((1 - t) * th) / sn;
    s1 = Math.sin(t * th) / sn;
  }
  out[0] = ax * s0 + bx * s1;
  out[1] = ay * s0 + by * s1;
  out[2] = az * s0 + bz * s1;
  out[3] = aw * s0 + bw * s1;
  const l = Math.hypot(...out);
  for (let c = 0; c < 4; c++) out[c] /= l;
  return out;
}

/** Réduction gloutonne des clés : on garde une clé quand l'interpolation depuis la dernière gardée dévie. */
function reduce(times, values, n, isQuat) {
  const frames = times.length;
  if (isQuat) for (let f = 1; f < frames; f++) {
    const d = values[f * 4] * values[f * 4 - 4] + values[f * 4 + 1] * values[f * 4 - 3] + values[f * 4 + 2] * values[f * 4 - 2] + values[f * 4 + 3] * values[f * 4 - 1];
    if (d < 0) for (let c = 0; c < 4; c++) values[f * 4 + c] *= -1; // continuité d'hémisphère
  }
  const keep = [0];
  const tmp = [0, 0, 0, 0];
  let last = 0;
  const fits = (a, b) => {
    for (let f = a + 1; f < b; f++) {
      const t = (times[f] - times[a]) / (times[b] - times[a]);
      if (isQuat) {
        slerp(values, a, b, t, tmp);
        const d = Math.abs(tmp[0] * values[f * 4] + tmp[1] * values[f * 4 + 1] + tmp[2] * values[f * 4 + 2] + tmp[3] * values[f * 4 + 3]);
        if (2 * Math.acos(Math.min(1, d)) > ROT_TOL) return false;
      } else {
        for (let c = 0; c < n; c++) {
          const v = values[a * n + c] + (values[b * n + c] - values[a * n + c]) * t;
          if (Math.abs(v - values[f * n + c]) > POS_TOL) return false;
        }
      }
    }
    return true;
  };
  for (let f = 2; f < frames; f++) {
    if (!fits(last, f)) {
      keep.push(f - 1);
      last = f - 1;
    }
  }
  keep.push(frames - 1);
  // piste constante → une seule clé
  const constant = isQuat ? keep.length === 2 && qAngle(values, 0, values, frames - 1) < ROT_TOL && fits(0, frames - 1) : false;
  const idx = constant ? [0] : [...new Set(keep)];
  const t = new Float32Array(idx.length);
  const v = new Float32Array(idx.length * n);
  idx.forEach((f, i) => {
    t[i] = times[f];
    for (let c = 0; c < n; c++) v[i * n + c] = values[f * n + c];
  });
  return { t, v };
}

function buildSet(gender) {
  const out = { json: { asset: { version: '2.0', generator: 'EveryoneHasSecret cast pipeline (Microsoft Rocketbox, MIT)' }, scene: 0, scenes: [{ nodes: [] }], nodes: [], accessors: [], bufferViews: [], animations: [] }, views: [] };
  const nodeIndex = new Map();
  const meta = { hipHeight: 0, clips: {} };

  for (const clip of CLIPS) {
    const src = convert(animPath(clip[gender]));
    const sj = src.json;
    // squelette (une fois, depuis le premier clip)
    if (!out.json.nodes.length) {
      const visit = (i, parent) => {
        const n = sj.nodes[i];
        const name = boneName(n.name);
        if (!isBodyBone(name)) return;
        const idx = out.json.nodes.length;
        out.json.nodes.push({ name, translation: n.translation, rotation: n.rotation });
        nodeIndex.set(name, idx);
        if (parent === null) out.json.scenes[0].nodes.push(idx);
        else (out.json.nodes[parent].children ??= []).push(idx);
        for (const c of n.children ?? []) visit(c, idx);
      };
      for (const r of sj.scenes[0].nodes) {
        const root = sj.nodes[r];
        if (root.name === 'RootNode') for (const c of root.children ?? []) visit(c, null);
        else visit(r, null);
      }
    }
    const anim = sj.animations[0];
    const a = { name: clip.name, channels: [], samplers: [] };
    let speed = 0;
    for (const ch of anim.channels) {
      const name = boneName(sj.nodes[ch.target.node].name);
      if (!nodeIndex.has(name)) continue;
      const path = ch.target.path;
      if (path === 'scale') continue;
      if (path === 'translation' && name !== 'Bip01') continue;
      const s = anim.samplers[ch.sampler];
      const times = readAccessor(src, s.input);
      const values = readAccessor(src, s.output);
      const t0 = times[0];
      for (let i = 0; i < times.length; i++) times[i] -= t0;
      const n = path === 'rotation' ? 4 : 3;
      if (path === 'translation') {
        const frames = times.length;
        const dur = times[frames - 1];
        if (name === 'Bip01' && clip.name === 'idle') meta.hipHeight = values[1];
        const x0 = values[0], z0 = values[2];
        const vx = clip.locomotion ? (values[(frames - 1) * 3] - x0) / dur : 0;
        const vz = clip.locomotion ? (values[(frames - 1) * 3 + 2] - z0) / dur : 0;
        if (clip.locomotion) speed = Math.hypot(vx, vz);
        for (let f = 0; f < frames; f++) {
          values[f * 3] -= x0 + vx * times[f];
          values[f * 3 + 2] -= z0 + vz * times[f];
        }
      }
      const r = reduce(times, values, n, n === 4);
      const input = addAccessor(out, r.t, 'SCALAR', { minmax: true });
      const output = addAccessor(out, r.v, n === 4 ? 'VEC4' : 'VEC3');
      a.samplers.push({ input, output, interpolation: 'LINEAR' });
      a.channels.push({ sampler: a.samplers.length - 1, target: { node: nodeIndex.get(name), path } });
    }
    const times = readAccessor(src, anim.samplers[0].input);
    const duration = times[times.length - 1] - times[0];
    meta.clips[clip.name] = { duration: +duration.toFixed(3), loop: !!clip.loop, ...(clip.locomotion ? { speed: +speed.toFixed(3) } : {}), source: clip[gender] };
    out.json.animations.push(a);
  }
  out.json.extras = meta;
  mkdirSync(OUT, { recursive: true });
  const file = join(OUT, `anims-${gender}.glb`);
  writeGlb(out, file);
  return { file, bytes: statSync(file).size, meta };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = {};
  for (const g of ['f', 'm']) {
    const r = buildSet(g);
    report[g] = r.meta;
    console.log(`anims-${g}.glb  ${(r.bytes / 1024).toFixed(0)} Ko  hipHeight=${r.meta.hipHeight.toFixed(3)}`);
    for (const [k, v] of Object.entries(r.meta.clips)) console.log(`  ${k.padEnd(9)} ${v.duration.toFixed(2)} s${v.speed ? `  vitesse ${v.speed} m/s` : ''}`);
  }
  writeFileSync(join(WORK, 'anims-report.json'), JSON.stringify(report, null, 2));
}
