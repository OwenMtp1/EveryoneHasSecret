# EVERYONE HAS A SECRET — Game Design

## 1. Vision

Un groupe d’amis, une villa coupée du monde par l’orage, et l’un d’eux mort : un ami du groupe, pas un inconnu.
**Un des joueurs l’a tué.** Les autres ont chacun un secret qui les rend suspects. On enquête, on ment, on se
couvre, on s’allie, on trahit, on vote — et chaque acte officiel a des conséquences.

## 2. Parcours du joueur

```
Compte (Supabase ou local) → Menu → Créer / rejoindre une partie (code privé ou serveurs publics)
→ Salon : galerie des 40 personnages (réservation unique), prêt·e, lancement par l’hôte (3 à 8 joueurs)
→ Chargement de la villa et des personnages → Cinématique d’arrivée (22h00) → plan sur le corps
→ Enquête (fouilles, lectures, codes, alibis, dossier commun, accusations, votes)
→ Délibération finale à l’arrivée de la police → Épilogue (toute la vérité) → retour au salon
```

## 3. Rôles secrets (distribués par le serveur, indépendamment de l’apparence)

| Camp | Qui | Sait | Gagne si |
|---|---|---|---|
| Meurtrier·ère | 1 joueur, tiré au sort | sa vraie soirée, sa version à défendre, la liste des preuves qui peuvent le trahir | il ou elle n’est pas arrêté·e à l’issue de la délibération finale, ou s’il ne reste qu’un joueur libre face à lui |
| Protecteur·rice | 1 joueur à partir de 6, 2 à 8 | l’identité du meurtrier, qui détient la preuve de son secret | le meurtrier reste libre — sauf s’il s’est opposé officiellement à lui ou si son secret a été révélé publiquement : il rejoint alors les innocents |
| Innocent·e | tous les autres | sa soirée, ses souvenirs (qui s’est absenté, quand) | le meurtrier est arrêté |

Chaque joueur reçoit aussi une **spécialité d’enquête** (le meurtrier aussi, et il peut mentir sur ses résultats) :
médecin légiste (autopsie : heure, arme, fibres), scientifique (empreintes), inspecteur·rice (traces, semelles),
analyste numérique (contourne un verrou), enquêteur·rice (exige / vérifie un alibi), profileur·se (tensions sociales).

## 4. Les trois scénarios (vérité générée une fois, stable toute la partie)

Commun : à 20h45 le groupe part en ville, la victime reste seule à la villa. Le meurtrier quitte son groupe vers
21h10 (« cigarettes »), passe à la station-service du col, tue la victime vers 21h25–21h36, cache l’arme, se lave les
mains et rentre vers 21h50, chaussures boueuses. À 22h, tout le monde rentre et découvre le corps.

| | A — Le Pacte / Le Prix du Silence | B — La Nuit des mensonges / Les Dernières Confidences | C — Le Dernier Testament / 180 000 euros disparus |
|---|---|---|---|
| Passé | Il y a 3 ans, chute de Théo à la falaise ; le groupe a menti aux gendarmes | Il y a 8 mois, vidéo d’un baiser qui a brisé un couple et annulé un mariage | Il y a 6 mois, mort de Bernard Aubert puis 180 000 € virés avec ses identifiants |
| Mobile | le meurtrier a poussé Théo ; la victime avait une photo de 23h42 | le meurtrier, amoureux en secret, a filmé et publié la vidéo | le meurtrier a détourné l’argent ; la victime avait l’ordre falsifié et les connexions |
| Pièce décisive | photo de la falaise (clé USB) | fichier original et adresse de récupération du compte (clé USB) | journaux de connexion de la banque (clé USB) |
| Secrets des innocents (7 possibles) | fausse déposition, téléphone jeté, photos effacées, liaison secrète, assurance, dispute entendue, voiture déplacée | ex trahi·e, personne de la vidéo, premier partage, vente à un site, liaison avec l’ex, témoin muet, cagnotte gardée | identifiants perdus, 5 000 € anonymes, signature imitée, héritier·ère, caisse empruntée, dispute avec Bernard, audit caché |

Le directeur (`server/game/case/director.ts`) adapte tout au nombre réel de joueurs (groupes de la soirée, témoins
de l’absence du meurtrier, absences d’innocents qui servent de fausses pistes, protecteurs) et aux identifiants internes.

## 5. Chaînes d’enquête (plusieurs pièces à recouper, jamais le hasard seul)

- **corps** → clé dorée → **boîte cadenassée** (chambre de la victime) → **journal** : code du téléphone, mot de passe de l’ordinateur, code du coffre-fort
- **téléphone** (code) → messages signés de **surnoms** → **photo de groupe** (surnoms au dos) → identité de l’expéditeur
- **tiroir du bureau** (clé sur le corps) → **ordinateur** (mot de passe) → notes sur chacun + code du coffret → **malle du grenier** (clé cachée) → **coffret** → **clé USB** → (lue dans l’ordinateur) **mobile**
- **coffre-fort** (code du journal) → documents de l’histoire passée (impliquent plusieurs personnes)
- **appareil photo + carte mémoire** → photo horodatée du groupe du meurtrier… sans lui (rendue avec les vrais personnages)
- **tickets** → station-service à 21h1x au nom du meurtrier ; additions et selfies qui confirment les alibis des autres
- **autopsie / empreintes / semelles / sang dilué / empreintes de boue** → heure, arme essuyée avec empreinte partielle, fibres du vêtement du meurtrier (visible sur son personnage), trajet jardin → pièce du crime

## 6. Alibis et dossier commun

- **Déclaration d’alibi** (publique) : lieu entre 21h et 22h + précisions. On peut mentir.
- **Verser une pièce au dossier commun** : texte authentique tiré de la preuve (impossible à falsifier), photos comprises.
  Le serveur recoupe automatiquement : « ⚠ contredit l’alibi de X » / « ✓ confirme l’alibi de Y ».
- Une pièce révélant le **secret** d’un joueur le rend public : crédibilité entamée (une accusation de moins),
  et un protecteur dont le secret est révélé est libéré du chantage.

## 7. Opposition officielle (irrévocable)

Seuls trois actes l’enregistrent : **accusation formelle**, **vote « coupable »**, **pièce versée « contre » quelqu’un**.
Soupçons, messages privés, questions et discussions n’en créent jamais. La liste est publique.
**Le meurtrier ne peut éliminer que ses opposants officiels**, seul à seul, sans témoin, arme en main, avec un délai entre deux éliminations.
Ses alliés qui ne l’ont jamais dénoncé ne peuvent pas être visés.

## 8. Votes

| | Vote d’accusation | Délibération finale |
|---|---|---|
| Déclencheur | accusation formelle (au moins une pièce lue jointe) | fin du temps d’enquête (« la police arrive à l’aube ») |
| Participants | joueurs libres sauf l’accusé·e (l’accusateur vote « coupable ») | tous les joueurs libres |
| Informations | accusateur, raisonnement, pièces jointes, défense publique de l’accusé·e | dossier commun, alibis, oppositions |
| Durée | 60 s (ou dès que tous ont voté) | 90 s (ou dès que tous ont voté) |
| Résultat | arrestation si plus de la moitié des votants possibles votent « coupable » | la personne la plus désignée est livrée ; égalité = personne |
| Conséquences | meurtrier arrêté → victoire des innocents ; innocent arrêté → secret révélé, il devient spectateur, **la nuit continue** | meurtrier livré → innocents ; sinon → meurtrier |
| Limites | 2 accusations par joueur, 75 s entre deux, un seul vote à la fois, aucune pendant la découverte du corps | — |

Votes définitifs. Égalité au vote d’accusation = relâché·e. Déconnexions : le vote se termine au délai.

## 9. Objets

Inventaire détaillé (fonction, interactions, conditions, conséquences) : `docs/VALIDATION.md`, section « Inventaire des objets ».
Objets volontairement absents : horloge, montre, enregistreur audio, dictaphone, disque dur externe, tableau blanc,
plateau à boissons, badge d’accès, disjoncteur secondaire, sonnette connectée, caméra de surveillance (vérifié par un test).

## 10. La villa

Quatre niveaux : sous-sol (chaufferie, cave à vin fermée à clé), rez-de-chaussée (hall, salon avec cheminée, salle à
manger, cuisine, salle de jeux, bureau, toilettes séparées, buanderie, vestiaire de jardin, couloir, garage), étage (palier, bibliothèque, salon de
musique, chambres, suite, salles de bains, chambre d’enfant, atelier), grenier ; jardin, verger avec deux cabanes dans
les arbres, allée. Chaque pièce a au moins deux cachettes ; trois meubles sont verrouillés (coffre-fort à code, tiroir et malle à clé).

## 11. Relations entre joueurs

| Type | Consentement | Effet concret |
|---|---|---|
| Ami·e | mutuel, face à face | signal social |
| Allié·e | mutuel, face à face | canal privé, position partagée sur le plan, transmission de notes en un clic |
| Pacte | mutuel, secret | comme l’alliance ; le rompre est une trahison visible du profileur |
| Ennemi·e | unilatéral, la cible est prévenue | hostilité visible |

Les relations ne créent **jamais** d’opposition officielle : seuls les trois actes du §7 le font.

## 12. Garde-fous

- La vérité (meurtrier, faits, codes, contenus non lus) reste sur le serveur ; le client ne reçoit que ce que le joueur a découvert.
- Aucun objet décoratif cliquable « pour rien » : chaque interaction informe, change un état ou a une conséquence.
- Aucun vote aléatoire : seulement l’accusation formelle et la délibération finale.
- Le meurtrier ne gagne jamais parce qu’un innocent a été soupçonné ou arrêté.
