# Personnages du catalogue (CAST)

40 personnages adultes distincts (20 femmes `f01`–`f20`, 20 hommes `m01`–`m20`), décrits dans
`src/shared/content/cast.ts` et rendus par `src/client/three/cast3d.ts`.

## Origine et licence

Modèles et animations : **Microsoft Rocketbox Avatar Library** — <https://github.com/microsoft/Microsoft-Rocketbox>,
licence **MIT** (texte complet et attribution : `LICENSE-ROCKETBOX.txt`). Les fichiers ont été convertis
(FBX → glTF), leurs textures redimensionnées / recompressées et leurs os renommés ; aucun autre contenu tiers.

| castId | Avatar Rocketbox | castId | Avatar Rocketbox |
|---|---|---|---|
| f01 | Female_Adult_01 | m01 | Male_Adult_01 |
| f02 | Female_Adult_02 | m02 | Male_Adult_02 |
| f03 | Female_Adult_03 | m03 | Male_Adult_03 |
| f04 | Female_Adult_04 | m04 | Male_Adult_04 |
| f05 | Female_Adult_05 | m05 | Male_Adult_05 |
| f06 | Female_Adult_06 | m06 | Male_Adult_06 |
| f07 | Female_Adult_07 | m07 | Male_Adult_07 |
| f08 | Female_Adult_08 | m08 | Male_Adult_08 |
| f09 | Female_Adult_09 | m09 | Male_Adult_09 |
| f10 | Female_Adult_11 | m10 | Male_Adult_10 |
| f11 | Female_Adult_12 | m11 | Male_Adult_12 |
| f12 | Female_Adult_13 | m12 | Male_Adult_13 |
| f13 | Female_Adult_14 | m13 | Male_Adult_17 |
| f14 | Female_Adult_15 | m14 | Male_Adult_18 |
| f15 | Female_Adult_17 | m15 | Male_Adult_20 |
| f16 | Female_Party_01 | m16 | Business_Male_04 |
| f17 | Female_Party_02 | m17 | Business_Male_05 |
| f18 | Business_Female_01 | m18 | Business_Male_07 |
| f19 | Business_Female_02 | m19 | Wood_Male_01 |
| f20 | Business_Female_03 | m20 | Delivery_Male_01 |

## Fichiers

- `<castId>.glb` (0,55–1 Mo) : maillage skinné (~8,7 k triangles, squelette Biped 81 os), 3 ou 4 matériaux :
  `body` / `head` (JPEG 1024 + carte de normales JPEG 512), `hair` (cheveux et cils, PNG 512 en palette avec
  alpha, alpha test 0,4, double face, couleur dilatée sous la transparence), `glasses` (f19, alpha blend).
  Os renommés : « Bip01 Pelvis » → `Hips`, « Bip01 L Thigh » → `L_Thigh`… (`scripts/characters/lib/bones.mjs`).
- `anims-f.glb`, `anims-m.glb` (~0,9 Mo) : clips partagés (rotations des os du corps + translation de `Bip01`).
  `extras.hipHeight` = hauteur de bassin du squelette des animations ; `extras.clips[nom].speed` = vitesse
  de locomotion sans glissement (m/s, cadence 1), la translation horizontale ayant été retirée (en place).

  | clip | source (f / m) | vitesse f | vitesse m |
  |---|---|---|---|
  | idle, idle2 | idle_neutral_01, idle_look_around_01 | | |
  | walk_slow | walk_neutral_01 | 1,21 m/s | 1,01 m/s |
  | walk | walk_fast_02 | 1,92 m/s | 2,00 m/s |
  | run | run_neutral_01 | 2,77 m/s | 2,88 m/s |
  | crouch, search | crouch_idle, crouch_gestic | | |
  | talk, listen | gestic_talk_neutral_01, gestic_listen_neutral_01 | | |
  | point, wave, shrug, laugh | gestic_presentation_right_01, wave_01, gestic_shrug_01, gestic_laugh_low | | |
  | examine | documents_check | | |
  | sit, sit_talk | sit_chair_idle_neutral_01, sit_chair_gestic_shrug_01 | | |

  Ces vitesses valent pour le squelette des animations ; le client les multiplie par (bassin de l'avatar ×
  échelle) / `hipHeight`. Rocketbox n'a pas d'animation « mort / allongé » : le corps est couché par le code.
- `thumbs/<castId>.jpg` (256×320, tête et épaules) et `cards/<castId>.jpg` (240×480, en pied) : rendus des
  vrais modèles, fond et éclairage identiques pour tous.

## Reconstruire

Prérequis : clone Rocketbox (`ROCKETBOX_DIR`, défaut `/home/user/microsoft/microsoft-rocketbox`, un clone
« blobless » sans checkout suffit : seuls les fichiers utiles sont matérialisés puis supprimés), le binaire
`FBX2glTF` (paquet npm `fbx2gltf`, variable `FBX2GLTF`), `python3` avec Pillow et numpy, Chromium (`CHROMIUM_PATH`).

```sh
node scripts/characters/build.mjs          # tout
node scripts/characters/build-avatars.mjs f03 m12   # quelques avatars
node scripts/characters/build-anims.mjs
node scripts/characters/render-thumbs.mjs
node scripts/characters/verify.mjs         # captures + mesure du glissement → screenshots/characters/
```

Le choix des avatars et des clips est dans `scripts/characters/config.mjs`.
