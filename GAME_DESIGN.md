# EVERYONE HAS A SECRET — Game Design

## 1. Vision

Un jeu social narratif multijoueur à **événements émergents**. Des joueurs entrent dans une villa. Personne ne sait ce qui va arriver : il n’y a ni tueur désigné, ni détective désigné, ni scénario écrit, ni solution prédéterminée. Les joueurs explorent, parlent, s’allient, se trahissent, ramassent et cachent des objets, mentent… et ces actions finissent par **produire une histoire**.

> **Les joueurs créent l’histoire, le système conserve la vérité.**

Le cœur : **SOCIAL + CHOIX + CONSÉQUENCES + SECRETS + ÉVÉNEMENTS ÉMERGENTS + ENQUÊTE.**

La courbe émotionnelle visée :
« Je ne sais pas ce qui va se passer » → « Je dois parler aux autres » → « Cette preuve contredit ce qu’il vient de dire » → « Je crois savoir » → « J’avais complètement tort » → « Il faut rejouer ».

## 2. Trois niveaux d’information

| Niveau | Où | Qui y accède |
|---|---|---|
| **Vérité** | Journal append-only du serveur (`GameInstance.truth`) | Le serveur seul. Révélée à l’épilogue. |
| **Connaissance** | Carnet de chaque joueur (`player.knowledge`) | Le joueur : ce qu’il a vu, entendu, déduit, reçu, découvert via son rôle. |
| **Déclaration** | Chat, tableau d’enquête (claims, témoignages) | Tout le monde — vrai ou faux. |

Le tableau d’enquête distingue un **constat** (connaissance réelle partagée telle quelle) d’un **rapporté** (information reçue d’un tiers) et d’une **déclaration** (texte libre, potentiellement mensonger).

## 3. Parcours du joueur (implémenté)

```
Ouverture (fond vivant : villa de nuit, pluie, fenêtres, éclairs)
→ Connexion / Inscription
→ CREATE YOUR CHARACTER (1re connexion)
→ Menu principal (JOUER · SERVEURS · AMIS · PROFIL · PARAMÈTRES)
→ Créer une partie (publique/privée + code) / Rejoindre par code / Serveurs publics
→ Lobby (personnages en scène, READY, chat, invitations, hôte)
→ Transition cinématique (écran noir · 23:47 · Villa Beaumont · …)
→ Villa → Exploration → Relations → Objets → Événements → Drame
→ Enquête (rôles) → Accusation → Épilogue (la vérité) → Retour lobby / Rejouer
```

## 4. La nuit : phases (souples, pilotées par événements)

| Phase | Déclencheur (données, `events.ts`) | Effet |
|---|---|---|
| ARRIVAL | début | narration d’introduction, secrets distribués |
| EXPLORATION | 20 s | découverte libre |
| SOCIAL | 100 s | « le dîner n’est jamais servi » |
| ESCALATION | 1re hostilité/trahison après 60 s, sinon 210 s | les opportunités deviennent possibles |
| (blackout) | 300 s si aucun drame | 45 s de noir : on ne voit plus personne sans lampe |
| MAJOR_EVENT | corps découvert / collier disparu | annonce, l’affaire est ouverte |
| INVESTIGATION | 8 s après | rôles distribués, outils exclusifs, 300 s |
| RESOLUTION | fin d’enquête | vote d’accusation (75 s ou tous votants) |
| EPILOGUE | fin du vote | révélation : coupable, chronologie vraie, secrets, votes |

Les phases ne sont pas une histoire linéaire : ce sont des **gardes** que les règles d’événements consultent. Si rien n’arrive, la nuit peut finir sur un **vol** découvert (si le collier a bougé) ou une **aube calme** qui révèle tous les secrets.

## 5. Le meurtre est une conséquence du monde

Il n’y a **pas de bouton « tuer »**. Une **opportunité** n’apparaît (discrètement, en rouge) que si **toutes** ces conditions sont réunies :

1. vous tenez un objet `weapon` + `lethal` ;
2. une cible vivante est à portée, dans la même pièce ;
3. **aucun témoin capable de vous voir** (ou le noir complet) ;
4. le contexte s’y prête : phase de tension, coupure de courant, ou **mobile** (vendetta / secret de rancune).

Le joueur peut l’ignorer (« Chasser cette pensée ») ou la saisir en deux temps. Conséquences physiques automatiques : sang sur l’arme, vêtements tachés, flaque de sang, bruit entendu dans les pièces voisines, fibres de la tenue du tueur sous les ongles de la victime, inventaire de la victime au sol.

**Le meurtrier joue l’enquête** : il reçoit un rôle comme les autres (il peut même être médecin légiste), peut mentir, se laver (laisse du sang dilué dans le siphon), essuyer l’arme (laisse des résidus), nettoyer le sol (laisse une zone frottée), accuser quelqu’un.

## 6. Enquête : asymétrie et coopération

Aucun rôle ne peut tout découvrir seul.

| Rôle | Sait faire | Limite |
|---|---|---|
| Enquêteur·rice | interroger (témoignage public), vérifier un témoignage contre les faits (2×) | ne voit pas les traces |
| Médecin légiste | autopsie : cause, fenêtre horaire, fibres sous les ongles | 1 autopsie, doit être près du corps |
| Scientifique | codes d’empreintes sur un objet, relevé des empreintes d’un joueur | un code ne dit pas à qui il appartient |
| Inspecteur·rice | traces de la pièce (motifs de semelles, sang dilué, zones frottées, cachettes), semelles d’un joueur | doit se rendre dans chaque pièce |
| Technicien·ne | caméras du hall et de l’allée (au moniteur du bureau) | 2 consultations, trous pendant les coupures |
| Profileur·se | lecture des tensions sociales (hostilités, trahisons, liens discrets) | 2 analyses, pas de preuve matérielle |

Les rôles sont **distribués dynamiquement** selon ce que chacun a fait pendant la nuit (le découvreur du corps → légiste, celui qui a passé du temps au bureau → technicien, etc.), avec une part d’aléatoire.

## 7. Relations

| Type | Consentement | Utilité concrète |
|---|---|---|
| FRIEND | mutuel, en face à face | signal social, historique |
| ALLY | mutuel, en face à face | canal privé, position partagée sur la carte, partage de connaissances en un clic |
| PACT | mutuel, secret | tout ALLY + poches visibles ; le rompre = **TRAHISON** |
| ENEMY | unilatéral, la cible est prévenue | dispute visible des témoins, fait monter la tension |
| VENDETTA | unilatéral, **secret**, exige un mobile | ouvre l’opportunité dès la phase sociale contre cette cible |

Le système ne force jamais un joueur à agir contre son ennemi.

## 8. Rejouabilité (V1)

À chaque partie : objets tirés dans des pièces différentes (et parfois absents), secrets différents et ciblant d’autres joueurs, graines de scénario (vol, conspiration) présentes ou non, empreintes et semelles réattribuées, téléphone avec un message différent, lettre anonyme révélant le secret d’un joueur au hasard, événements aléatoires (téléphone qui sonne…), rôles qui dépendent de la nuit jouée.

## 9. Contenu V1

- **Villa Beaumont** : jardin, cuisine, salon, bureau, salle de bain, cave & garage (verrouillée), hall, couloir, chambre bleue, chambre de maître, allée extérieure ; 24 meubles (dont 18 cachettes).
- **17 types d’objets** : couteau, chandelier, corde, coupe-papier, bouteille, clé de la cave, tournevis, lampe torche, torchon, briquet, téléphone, somnifères, montre, badge, collier, lettre, photo.
- **12 secrets**, **6 rôles**, **15 règles d’événements**, **3 familles de scénarios** actives (meurtre, vol, conspiration) + 2 prévues.
- **Personnages** : 2 apparences, 8 teintes de peau, 10 coiffures, 8 couleurs de cheveux, 20 tenues.

## 10. Garde-fous de design (règle finale)

Avant d’intégrer une fonctionnalité : sert-elle la vision ? marche-t-elle à plusieurs ? est-elle générique ? peut-elle évoluer ? préserve-t-elle l’émergence ? **sépare-t-elle vérité serveur et connaissance joueur ?** Ne pas transformer le jeu en scénario linéaire, en simple murder mystery, ni en clone.
