/**
 * Lecture / écriture minimale de fichiers GLB (glTF 2.0 binaire), sans dépendance.
 * Le document est manipulé sous forme JSON ; chaque bufferView est extrait en Buffer indépendant
 * (`doc.views[i]`) puis tout est ré-empaqueté à l'écriture (alignement 4 octets).
 */
import { readFileSync, writeFileSync } from 'node:fs';

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

export function readGlb(path) {
  const buf = readFileSync(path);
  if (buf.readUInt32LE(0) !== GLB_MAGIC) throw new Error(`${path} : pas un GLB`);
  let off = 12;
  let json = null;
  let bin = Buffer.alloc(0);
  while (off < buf.length) {
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === CHUNK_JSON) json = JSON.parse(data.toString('utf8'));
    else if (type === CHUNK_BIN) bin = data;
    off += 8 + len;
  }
  const views = (json.bufferViews ?? []).map((v) => Buffer.from(bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength)));
  return { json, views };
}

/** Données typées d'un accesseur (copie, non entrelacée). */
export function readAccessor(doc, index) {
  const acc = doc.json.accessors[index];
  const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[acc.type];
  const Ctor = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array, 5122: Int16Array, 5120: Int8Array }[acc.componentType];
  const out = new Ctor(acc.count * n);
  if (acc.bufferView === undefined) return out;
  const view = doc.json.bufferViews[acc.bufferView];
  const data = doc.views[acc.bufferView];
  const elem = Ctor.BYTES_PER_ELEMENT * n;
  const stride = view.byteStride ?? elem;
  const base = acc.byteOffset ?? 0;
  for (let i = 0; i < acc.count; i++) {
    const src = new Ctor(data.buffer.slice(data.byteOffset + base + i * stride, data.byteOffset + base + i * stride + elem));
    out.set(src, i * n);
  }
  return out;
}

/** Ajoute un bufferView (renvoie son index). */
export function addView(doc, data, target) {
  const b = Buffer.from(data.buffer ? Buffer.from(data.buffer, data.byteOffset, data.byteLength) : data);
  doc.json.bufferViews.push({ buffer: 0, byteOffset: 0, byteLength: b.length, ...(target ? { target } : {}) });
  doc.views.push(b);
  return doc.json.bufferViews.length - 1;
}

/** Ajoute un accesseur pour un tableau typé (renvoie son index). */
export function addAccessor(doc, array, type, { minmax = false, target } = {}) {
  const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[type];
  const componentType = array instanceof Float32Array ? 5126 : array instanceof Uint32Array ? 5125 : array instanceof Uint16Array ? 5123 : 5121;
  const acc = { bufferView: addView(doc, array, target), componentType, count: array.length / n, type };
  if (minmax) {
    const min = new Array(n).fill(Infinity);
    const max = new Array(n).fill(-Infinity);
    for (let i = 0; i < array.length; i++) {
      const k = i % n;
      if (array[i] < min[k]) min[k] = array[i];
      if (array[i] > max[k]) max[k] = array[i];
    }
    acc.min = min;
    acc.max = max;
  }
  doc.json.accessors.push(acc);
  return doc.json.accessors.length - 1;
}

/**
 * Supprime les bufferViews / accesseurs non référencés puis ré-indexe (après remplacements).
 */
export function compact(doc) {
  const j = doc.json;
  // accesseurs utilisés
  const usedAcc = new Set();
  for (const m of j.meshes ?? [])
    for (const p of m.primitives) {
      for (const a of Object.values(p.attributes)) usedAcc.add(a);
      if (p.indices !== undefined) usedAcc.add(p.indices);
      for (const t of p.targets ?? []) for (const a of Object.values(t)) usedAcc.add(a);
    }
  for (const s of j.skins ?? []) if (s.inverseBindMatrices !== undefined) usedAcc.add(s.inverseBindMatrices);
  for (const a of j.animations ?? []) for (const s of a.samplers) usedAcc.add(s.input), usedAcc.add(s.output);
  const accMap = new Map();
  const accs = [];
  (j.accessors ?? []).forEach((a, i) => {
    if (usedAcc.has(i)) {
      accMap.set(i, accs.length);
      accs.push(a);
    }
  });
  const remapAcc = (i) => accMap.get(i);
  for (const m of j.meshes ?? [])
    for (const p of m.primitives) {
      for (const k of Object.keys(p.attributes)) p.attributes[k] = remapAcc(p.attributes[k]);
      if (p.indices !== undefined) p.indices = remapAcc(p.indices);
      for (const t of p.targets ?? []) for (const k of Object.keys(t)) t[k] = remapAcc(t[k]);
    }
  for (const s of j.skins ?? []) if (s.inverseBindMatrices !== undefined) s.inverseBindMatrices = remapAcc(s.inverseBindMatrices);
  for (const a of j.animations ?? []) for (const s of a.samplers) (s.input = remapAcc(s.input)), (s.output = remapAcc(s.output));
  j.accessors = accs;
  // images / textures utilisées
  const usedView = new Set(accs.map((a) => a.bufferView).filter((v) => v !== undefined));
  for (const im of j.images ?? []) if (im.bufferView !== undefined) usedView.add(im.bufferView);
  const viewMap = new Map();
  const views = [];
  const datas = [];
  j.bufferViews.forEach((v, i) => {
    if (usedView.has(i)) {
      viewMap.set(i, views.length);
      views.push(v);
      datas.push(doc.views[i]);
    }
  });
  for (const a of accs) if (a.bufferView !== undefined) a.bufferView = viewMap.get(a.bufferView);
  for (const im of j.images ?? []) if (im.bufferView !== undefined) im.bufferView = viewMap.get(im.bufferView);
  j.bufferViews = views;
  doc.views = datas;
}

export function writeGlb(doc, path) {
  const j = doc.json;
  let off = 0;
  const parts = [];
  j.bufferViews.forEach((v, i) => {
    const d = doc.views[i];
    const pad = (4 - (off % 4)) % 4;
    if (pad) parts.push(Buffer.alloc(pad));
    off += pad;
    v.buffer = 0;
    v.byteOffset = off;
    v.byteLength = d.length;
    parts.push(d);
    off += d.length;
  });
  const tail = (4 - (off % 4)) % 4;
  if (tail) parts.push(Buffer.alloc(tail));
  const bin = Buffer.concat(parts);
  j.buffers = [{ byteLength: bin.length }];
  let jsonBuf = Buffer.from(JSON.stringify(j), 'utf8');
  const jpad = (4 - (jsonBuf.length % 4)) % 4;
  jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jpad, 0x20)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(GLB_MAGIC, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + bin.length, 8);
  const ch = (len, type) => {
    const b = Buffer.alloc(8);
    b.writeUInt32LE(len, 0);
    b.writeUInt32LE(type, 4);
    return b;
  };
  writeFileSync(path, Buffer.concat([header, ch(jsonBuf.length, CHUNK_JSON), jsonBuf, ch(bin.length, CHUNK_BIN), bin]));
}
