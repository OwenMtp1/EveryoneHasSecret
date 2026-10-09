/**
 * Avatars Rocketbox → public/characters/<castId>.glb
 *
 *   node scripts/characters/build-avatars.mjs [castId…]
 *
 * Pour chaque personnage : récupère le FBX et ses textures dans le clone Rocketbox, convertit
 * avec FBX2glTF (qui jette les textures), puis ré-attache des textures redimensionnées
 * (JPEG pour les cartes opaques, PNG avec alpha pour cheveux/cils), corrige les matériaux
 * (cheveux en alpha test double face, pas de métal) et renomme les os (voir lib/bones.mjs).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAST_SOURCES, FBX2GLTF, OUT, TEX, WORK } from './config.mjs';
import { avatarDir, fetchFiles, lsTree, releaseFiles } from './lib/rocketbox.mjs';
import { addView, compact, readGlb, writeGlb } from './lib/glb.mjs';
import { boneName } from './lib/bones.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TEXTURES_PY = join(HERE, 'lib', 'textures.py');
const WITH_NORMALS = process.env.CAST_NORMALS !== '0';

function prepTexture(mode, src, dst, size, quality) {
  if (!existsSync(dst)) execFileSync('python3', ['-I', TEXTURES_PY, mode, src, dst, String(size), ...(quality ? [String(quality)] : [])], { stdio: 'inherit' });
  return readFileSync(dst);
}

export function buildAvatar(castId) {
  const name = CAST_SOURCES[castId];
  const dir = avatarDir(name);
  const files = lsTree().filter((p) => p.startsWith(`${dir}/Textures/`));
  const fbx = `${dir}/Export/${name}.fbx`;
  const [fbxAbs] = fetchFiles([fbx]);
  const work = join(WORK, 'avatars');
  mkdirSync(work, { recursive: true });
  const raw = join(work, `${name}`);
  execFileSync(FBX2GLTF, ['-b', '-k', 'position', '-k', 'normal', '-k', 'uv0', '-i', fbxAbs, '-o', raw], { stdio: 'pipe' });
  const doc = readGlb(`${raw}.glb`);
  const j = doc.json;

  // ── Os et nœuds ──
  for (const n of j.nodes) {
    n.name = boneName(n.name);
    if (n.mesh !== undefined) n.name = 'Avatar';
  }
  j.meshes.forEach((m) => (m.name = 'Avatar'));

  // ── Textures : matériau « f001_head » → f001_head_color.tga (+ _normal) ; « f001_opacity » →
  // f001_opacity_color.tga (RGBA) ; « f015_glasses » → f015_glasses_opacity_color.tga (verres) ──
  j.images = [];
  j.textures = [];
  j.samplers = [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }];
  const addImage = (buf, mimeType, label) => {
    const view = addView(doc, buf);
    j.images.push({ name: label, bufferView: view, mimeType });
    j.textures.push({ sampler: 0, source: j.images.length - 1 });
    return j.textures.length - 1;
  };
  const fetched = [];
  const texFile = (fileName) => {
    const rel = files.find((p) => p.endsWith(`/${fileName}`));
    if (!rel) return null;
    fetched.push(rel);
    return fetchFiles([rel])[0];
  };
  const t = (k) => join(work, `${castId}_${k}`);
  j.materials = j.materials.map((m) => {
    const kind = /_opacity$/i.test(m.name) ? 'hair' : /_glasses$/i.test(m.name) ? 'glasses' : /_head$/i.test(m.name) ? 'head' : 'body';
    const out = { name: kind, pbrMetallicRoughness: { metallicFactor: 0, roughnessFactor: kind === 'hair' ? 0.65 : kind === 'glasses' ? 0.2 : 0.82 } };
    const alpha = kind === 'hair' || kind === 'glasses';
    const color = alpha ? texFile(`${m.name.replace(/_opacity$/i, '')}_opacity_color.tga`) : texFile(`${m.name}_color.tga`);
    if (color) {
      const buf = alpha ? prepTexture('alpha', color, t(`${kind}.png`), kind === 'glasses' ? TEX.glasses : TEX.hair) : prepTexture('color', color, t(`${kind}.jpg`), TEX[kind] ?? TEX.body, kind === 'head' ? 86 : 84);
      out.pbrMetallicRoughness.baseColorTexture = { index: addImage(buf, alpha ? 'image/png' : 'image/jpeg', kind) };
    }
    const normal = WITH_NORMALS && !alpha ? texFile(`${m.name}_normal.tga`) : null;
    if (normal) out.normalTexture = { index: addImage(prepTexture('normal', normal, t(`${kind}_n.jpg`), TEX.normal, 80), 'image/jpeg', `${kind}_normal`), scale: 1 };
    if (kind === 'hair') {
      out.alphaMode = 'MASK';
      out.alphaCutoff = 0.4;
      out.doubleSided = true;
    }
    if (kind === 'glasses') {
      out.alphaMode = 'BLEND';
      out.doubleSided = true;
    }
    return out;
  });
  delete j.extensionsUsed;
  delete j.extensionsRequired;
  for (const m of j.meshes)
    for (const p of m.primitives) {
      delete p.attributes.COLOR_0;
      delete p.extensions;
    }
  delete j.animations;
  j.asset = { version: '2.0', generator: 'EveryoneHasSecret cast pipeline (Microsoft Rocketbox, MIT)' };
  j.extras = { source: name, castId };
  compact(doc);
  mkdirSync(OUT, { recursive: true });
  const out = join(OUT, `${castId}.glb`);
  writeGlb(doc, out);
  // libère le disque : les TGA font ~12 Mo chacun
  releaseFiles(fetched);
  return { castId, name, bytes: statSync(out).size };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CAST_SOURCES);
  for (const id of ids) {
    const r = buildAvatar(id);
    console.log(`${r.castId}  ${r.name.padEnd(20)} ${(r.bytes / 1024).toFixed(0)} Ko`);
  }
}
