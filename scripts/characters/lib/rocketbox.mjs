/**
 * Accès au dépôt Rocketbox (clone « blobless » sans checkout) : on ne matérialise que les fichiers utiles.
 * Chemin du clone : variable ROCKETBOX_DIR (défaut /home/user/microsoft/microsoft-rocketbox).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export const ROCKETBOX = process.env.ROCKETBOX_DIR ?? '/home/user/microsoft/microsoft-rocketbox';

const GIT = 'git';
let tree = null;
/** Liste (mise en cache) de tous les fichiers du dépôt. */
export function lsTree() {
  if (!tree) tree = execFileSync(GIT, ['-C', ROCKETBOX, 'ls-tree', '-r', '--name-only', 'HEAD', 'Assets'], { maxBuffer: 64 << 20 }).toString().trim().split('\n');
  return tree;
}

/** Matérialise les fichiers demandés (s'ils ne sont pas déjà présents) et renvoie leurs chemins absolus. */
export function fetchFiles(paths) {
  const missing = paths.filter((p) => !existsSync(join(ROCKETBOX, p)));
  for (let i = 0; i < missing.length; i += 40) {
    execFileSync(GIT, ['-c', 'gc.auto=0', '-c', 'maintenance.auto=false', '-C', ROCKETBOX, 'checkout', 'HEAD', '--', ...missing.slice(i, i + 40)], { stdio: 'inherit' });
  }
  return paths.map((p) => join(ROCKETBOX, p));
}

/** Supprime les fichiers matérialisés (gros TGA) pour libérer le disque. */
export function releaseFiles(paths) {
  for (const p of paths) rmSync(join(ROCKETBOX, p), { force: true });
}

/** Dossier d'un avatar (Adults/… ou Professions/…). */
export function avatarDir(name) {
  const hit = lsTree().find((p) => p.endsWith(`/${name}/Export/${name}.fbx`));
  if (!hit) throw new Error(`Avatar Rocketbox introuvable : ${name}`);
  return hit.replace(`/Export/${name}.fbx`, '');
}
