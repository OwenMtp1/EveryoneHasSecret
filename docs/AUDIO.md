# Audio — musique d'enquête et effets

La pluie musicale (bruit blanc filtré en boucle), le drone grave, le tonnerre et l'autoradio « groove »
de la cinématique ont été **supprimés**. Ils sont remplacés par un underscore d'enquête très discret :
quelques notes de piano espacées, des nappes douces, une légère tension. Composition **originale**,
entièrement procédurale (Web Audio) : aucun fichier, aucun droit tiers.

La pluie **visuelle** (menus, cinématique, partie) est inchangée : seul le son est concerné.

## Architecture

```
AudioContext (un seul, créé au premier geste — audio.ts)
 ├─ MusicDirector (music.ts) ─ cue active ┐
 │                            cue en fondu ┴→ réverb (convolution, RI générée) → bus MUSIQUE → limiteur → atténuation onglet masqué → sortie
 └─ sons d'UI, moteur / route / voix de la cinématique ───────────────────────→ bus EFFETS ───────────────────────────────→ sortie
```

| Fichier | Rôle |
|---|---|
| `src/client/music.ts` | instruments (piano de synthèse, nappe, note grave), cues, réverb, bus + limiteur, `MusicDirector`. Marche aussi avec un `OfflineAudioContext` (tests). |
| `src/client/audio.ts` | contexte unique, bus Musique / Effets liés aux réglages, déblocage autoplay, onglet masqué, sons d'UI, `music`, `audioDebug()` |
| `src/client/musicRouter.ts` | choisit la cue selon l'écran (abonnement direct au store, indépendant de React) |
| `src/client/game/intro/IntroAudio.ts` | effets de la cinématique (moteur, route, brouhaha) + repères musicaux par état |

Le chat vocal (`voice.ts`) a son propre contexte et n'est pas touché.

## API

```ts
import { music, audioDebug } from './audio';
music.play('investigation', { fade: 6 }); // 'menu' | 'intro' | 'investigation' | 'silence'
music.stop({ fade: 3 });
music.mark('bodyDiscovered');
music.current; // cue active (ou demandée avant le déblocage)
audioDebug();  // { state, settings, buses, music, cues: [{ name, role, gain, liveSources, section }], loops }
```

- **Une seule cue active.** `play` d'une autre cue : l'ancienne descend linéairement à 0 en `fade` s, la
  nouvelle n'entre qu'à **mi-fondu** et monte en `fade` s → la somme des gains ne dépasse jamais 1
  (au milieu elle vaut 0,5) ; une cue qui s'éteint encore après un `stop` retarde de même la suivante.
- `play` de la cue déjà active ne fait rien. Les sources d'une cue arrêtée sont stoppées à la fin du fondu,
  puis ses nœuds sont déconnectés (la queue de réverb s'éteint naturellement).
- Avant le premier geste, `play` mémorise la cue ; elle démarre au déblocage (fondu 2,5 s).
- Onglet masqué : le bus musique s'efface (0,15 s) et plus rien n'est planifié ; au retour il remonte
  (0,6 s) et les cues repartent de « maintenant » sans rattraper. Les effets restent actifs.

### Cues

| Cue | Quand | Contenu |
|---|---|---|
| `menu` | menus, salon, paramètres | nappe Dsus2 / B♭maj7 / Gm9, une note de piano toutes les 11–22 s |
| `intro` | cinématique (après le chargement) | sections pilotées par les repères ci-dessous |
| `investigation` | en partie, une fois la cinématique refermée | 8 accords lents (13–19 s chacun), phrases de 1–3 notes toutes les 7–16 s, note grave un accord sur deux |
| `silence` | chargement de la cinématique | — |

Harmonie : ré dorien / la mineur, accords suspendus, triton discret (B♭maj7♯11) pour la tension. Aucune
percussion, aucun bruit large bande (l'unique bruit est l'attaque de marteau du piano, 30 ms filtrée).

### Repères (`music.mark`)

| Repère | Envoyé par | Effet sur `intro` |
|---|---|---|
| `drive` | INTRO_CAR | premières notes (la4, mi5, ré5), nappe Dsus2 |
| `pointing` | INTRO_POINT | B♭maj7♯11, la4 répété : légère tension |
| `villaReveal` | INTRO_REVEAL | la nappe s'ouvre (filtre), motif ré5–fa5–mi5–la4 |
| `silhouette` | passage de la silhouette | une seule note aiguë pianissimo (mi6) — pas de « jump scare » |
| `arrival` | INTRO_VILLA | Asus4, do5–si4 (couleur dorienne) |
| `enterHouse` | fondu au noir (INTRO_VILLA, u > 0,84) | quinte à vide, le piano se tait |
| `bodyDiscovered` | **à appeler** par le plan de découverte du corps | B♭maj7 sombre, fa4–mi4–ré4 descendant puis ré2+ré3 |
| `end` | GAME_START | quinte très douce, la musique s'amincit avant le passage en jeu |
| `tension` | en partie, message « danger » (store) | `investigation` : accord à triton + une note grave isolée |

Sur `investigation`, `bodyDiscovered` équivaut à `tension`. Un repère inconnu de la cue est ignoré ; les
repères peuvent arriver dans n'importe quel ordre.

**Pour le plan de découverte du corps** : `import { music } from '../../audio'; music.mark('bodyDiscovered');`
au début du plan. Si ce plan rallonge la cinématique, garder `end` (GAME_START) après lui.

### Enchaînements

- Lancement : silence jusqu'au premier geste, puis `menu` (fondu 2,5 s).
- Salon → cinématique : `menu` s'éteint (2,5 s) pendant le chargement ; `intro` entre au début de la scène.
- Cinématique → partie : `investigation` (fondu 6 s) seulement quand l'écran de cinématique est refermé
  (`intro === null`) : l'intro descend pendant 6 s, l'enquête entre à +3 s. Pas de coupure, pas de superposition à plein volume.
- Partie → menus : retour à `menu` (fondu 4 s).

## Volumes

| Réglage | Gain du bus | Défaut |
|---|---|---|
| Musique | `v² × 1,6` | 0,4 → 0,256 (−11,8 dB) |
| Effets sonores | `v` (inchangé) | 0,6 |

Les deux s'appliquent **en direct** (rampe de 30 ms, sans clic), y compris pendant la cinématique et en
partie. Couper la musique ne touche pas aux effets (et inversement). Niveau propre à chaque cue
(`CUE_TRIM` dans `music.ts`) ; limiteur (−14 dBFS, ratio 16) sur le bus musique.

## Vérification (mesurée, `tests/audio.test.ts`)

Rendu hors ligne dans Chromium headless (`OfflineAudioContext`, même chaîne que le jeu), réglage par
défaut 0,4. Sonie ≈ LUFS (pondération K approchée + porte BS.1770).

| Rendu | Crête | RMS | Sonie | Platitude spectrale (méd.) | Énergie > 5 kHz |
|---|---|---|---|---|---|
| ancienne pluie (témoin) | −19 dBFS | −31,5 dBFS | −25,8 | **0,45** | **26 %** |
| `menu` (70 s) | −18,5 | −31,7 | −29,1 | 8·10⁻⁶ | 0,00 % |
| `intro` (repères, 32 s) | −17,1 | −31,0 | −28,1 | 2·10⁻⁵ | 0,00 % |
| `investigation` (90 s) | −18,3 | −31,7 | −28,9 | 1·10⁻⁵ | 0,00 % |
| intro → investigation | −17,1 | −32,0 | −29,0 | 2·10⁻⁵ | 0,00 % |
| `menu` à 100 % | −4,9 | −16,4 | −13,6 | — | — |

Contrôles automatiques : crête < −14 dBFS et sonie entre −36 et −24 au défaut ; platitude médiane < 0,05
et énergie > 5 kHz < 1 % (la pluie témoin est détectée à 0,45 / 26 %) ; fondu intro → partie : aucune
fenêtre de 0,5 s au-dessus du niveau d'une cue seule (+1 dB de marge ; mesuré −30,8 dB contre −27,2) et pas de
chute brutale au début du fondu ; réglage 0 = silence numérique ; dans un vrai `AudioContext` (via
`audioDebug()`) : après `music.play('investigation')` il ne reste que la cue `investigation`, aucune
boucle (ni pluie, ni moteur, ni route), les gains des bus suivent les réglages, et 6 parties enchaînées
ne laissent qu'une cue et un nombre borné de sources.

Parcours réel vérifié aussi à la main dans Chromium (2 joueurs, serveur local, sans WebGL → repli 2D) :
menu → salon → cinématique (sections `drive` → `pointing` → `villaReveal` → `arrival` → `end` au bon
moment) → partie (`investigation`, fondu linéaire 6 s, somme des gains ≤ 1), aucune boucle restante.

Débogage en jeu (`?debug` ou dev) : `__ehasAudio()` dans la console.

## À vérifier à l'oreille (non mesurable ici)

- Le timbre du piano de synthèse (crédibilité, aigus pas trop « sinus ») et l'équilibre piano / nappe.
- Le niveau ressenti par rapport aux effets et au chat vocal, sur haut-parleurs de portable et au casque
  (les notes graves ré2 / la1 peuvent disparaître sur petits haut-parleurs — c'est voulu, elles sont discrètes).
- La synchronisation fine des repères avec l'image (surtout `villaReveal`, `silhouette`, `enterHouse`).
- Le passage cinématique → partie (6 s) : assez long pour être invisible, assez court pour ne pas traîner.
- Que la musique de partie reste en retrait pendant les discussions (sinon baisser `CUE_TRIM.investigation`).
- Firefox / Safari : `cancelAndHoldAtTime` absent sur Firefox (repli prévu) ; déblocage au premier geste sur iOS.
