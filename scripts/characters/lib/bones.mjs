/**
 * Noms d'os : squelette Biped 3ds Max (« Bip01 L Thigh »…) → noms courts sans espaces
 * (« L_Thigh »), le bassin devient « Hips » (convention reprise par le reste du jeu).
 * Appliqué de la même façon aux avatars et aux animations.
 */
export function boneName(name) {
  if (name === 'Bip01') return 'Bip01';
  if (name === 'Bip01 Pelvis') return 'Hips';
  if (!name.startsWith('Bip01 ')) return name;
  return name.slice(6).replace(/\s+/g, '_');
}

/** Os du corps dont on garde les rotations animées (le visage reste au repos : pas de facial). */
export function isBodyBone(short) {
  return /^(Bip01|Hips|Spine\d?|Neck|Head|[LR]_(Clavicle|UpperArm|Forearm|Hand|Finger\d+|Thigh|Calf|Foot|Toe0))$/.test(short);
}
