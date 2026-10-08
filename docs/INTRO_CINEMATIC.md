# Cinématique d'arrivée — Villa Beaumont

Vraie scène 3D temps réel (pas une vidéo), 15–25 s (`EHAS_TRANSITION_MS`, 20 s par défaut), qui sert à la fois
d'introduction narrative et d'écran de chargement. Ton : 90 % soirée, 10 % malaise.

## Autorité serveur

`LobbyManager.start()` :
1. **fige la composition** : les joueurs présents à cet instant sont ceux de la cinématique et de la partie ;
2. construit un `IntroPlan` (`buildIntroPlan`, `src/shared/content/intro.ts`) : véhicule selon le nombre de joueurs,
   conducteur tiré au sort, une place par passager, une animation par passager, une graine commune ;
3. envoie `lobby:intro { plan, serverNow }` à chacun, puis cadence les états avec `lobby:intro-state` ;
4. à `GAME_START`, crée la partie avec exactement ces joueurs.

États : `INTRO_START → INTRO_CAR → INTRO_POINT → INTRO_REVEAL → INTRO_VILLA → GAME_START` (parts de durée dans `INTRO_TIMELINE`).

Pendant la cinématique :
- **déconnexion** : le personnage reste ; à la reconnexion, le serveur renvoie `lobby:intro` et le client reprend au bon moment ;
- **départ du salon** : la cinématique continue, le personnage reste dans l'histoire (joueur considéré déconnecté) ;
- **arrivée tardive / expulsion** : refusées (la partie a commencé).

Côté client, `reconcile()` (`IntroSequence.ts`) suit l'horloge serveur (décalage recalé à chaque état) sans jamais
devancer ni retarder l'état annoncé par le serveur.

## Véhicules (données)

`src/shared/content/vehicles.ts` — `VehicleDefinition { id, minPlayers, maxPlayers, seats, cinematicConfig, assets }`.

| Véhicule | Joueurs | Places |
|---|---|---|
| `car` (berline) | 2–4 | `driver`, `passenger_front`, `passenger_back_left`, `passenger_back_right` |
| `minibus` | 5–8 | `driver`, `passenger_1` … `passenger_7` |

`getVehicleForPlayerCount(n)` choisit le plus petit véhicule qui convient. `VehicleCinematicConfig`
(`interiorCamera`, `exteriorCamera`, `revealDistance`, `revealHeight`, `revealOffset`) règle les cadrages ; le minibus
recule et monte davantage. Ajouter un véhicule = ajouter une entrée (et, si besoin, un gabarit dans `IntroVehicle.ts`).

## Client (`src/client/game/intro/`)

| Fichier | Rôle |
|---|---|
| `IntroScreen.tsx` | écran React : monte la séquence, fondu, attente de fin de chargement, repli sans WebGL |
| `IntroSequence.ts` | scène (villa, route, portail, arbres, pluie), véhicule en mouvement, fenêtres, silhouette, horloge |
| `IntroCamera.ts` | plans par état (habitacle, épaule du conducteur, sortie par le pare-brise, révélation, villa) |
| `IntroVehicle.ts` | véhicule procédural depuis sa définition (habitacle ouvert, sièges, volant, phares) |
| `IntroCharacters.ts` | les vrais personnages des joueurs, assis, animations `drive/talk/laugh/dance/look`, regard vers la villa, bras du conducteur |
| `IntroAudio.ts` | couches Music / Car / Road / Voices / Cinematic, mixées par état avec transitions douces |
| `IntroText.tsx` | textes jaunes en bas, tapés lettre à lettre selon l'horloge commune |
| `IntroLoader.ts` | chargement masqué par priorité : personnages → textures/HDR → shaders |
| `VehicleSelector.ts` | véhicule du plan côté client |

Les poses sont des rotations procédurales en espace monde superposées à l'animation d'attente capturée
(`GesturePlayer.hold`, `src/client/three/gestures.ts`).

## Mise en scène

- **INTRO_CAR** : 3 plans d'habitacle (vue générale, un passager en gros plan, l'avant filmé depuis le capot).
- **INTRO_POINT** : par-dessus l'épaule du conducteur qui tend le bras ; les passagers se tournent vers l'avant.
- **INTRO_REVEAL** : la caméra traverse le pare-brise, recule, se décale à droite et monte : véhicule + route + villa.
  Texte : « Villa Beaumont — 22h00 — Soirée entre potes. » (40 ms/caractère).
- **INTRO_VILLA** : la caméra se détache et glisse vers la façade ; les fenêtres s'allument une à une, la brume se lève ;
  une silhouette floue passe derrière un rideau ~1 s (même fenêtre et même instant pour tous, aucun jumpscare).
  Texte : « Personne ne savait encore ce qui allait arriver. » (75 ms/caractère). Fondu au noir.

## Limites connues / à venir

- Véhicules et animations assises procéduraux (aucun modèle de véhicule ni animation assise capturée dans le projet).
- Voix : brouhaha synthétique indistinct, aucune parole.
- Le personnage de repli (procédural) n'a pas de genoux : il s'assoit jambes tendues.
