# Rapport de validation — version 1.0

Branche : `claude/youthful-euler-h8o139`. Environnement de test : conteneur Linux sans GPU (Chromium avec rendu
logiciel SwiftShader, Node 22.22). **Aucun test n'a été fait sur un vrai GPU, avec un casque ou des haut-parleurs, sur un
projet Supabase réel, ni avec plusieurs personnes réelles.** Ce qui en dépend est classé en C ou D.

Preuves dans ce dossier : `e2e-log.txt` (journal de la partie automatisée), `e2e/*.jpg` (captures de la partie),
`cast-femmes.jpg` / `cast-hommes.jpg` (planches des 40 personnages), `photo-groupe.jpg` + `photo-groupe-reference.jpg`
et `photo-falaise.jpg` (photos d'enquête rendues avec les personnages).

---

## A. Corrigé et testé

| Sujet | Modification | Test réellement exécuté | Résultat |
|---|---|---|---|
| **Comptes à recréer** | Cause n° 1 : `render.yaml` stockait SQLite dans `/tmp` (disque effacé à chaque mise en veille de Render). Cause n° 2 : le client effaçait le jeton à la moindre erreur réseau au réveil du serveur. → Supabase Auth + Postgres, mode local conservé ; le client ne se déconnecte que sur un refus 401 et affiche « Le serveur se réveille… » | Navigateur réel (mode local) : inscription, rechargement, fermeture/réouverture (même stockage), autre navigateur, mauvais mot de passe, doublon de pseudo, déconnexion persistante ; **redémarrage du serveur puis connexion** | 7/7 scénarios + compte retrouvé après redémarrage |
| Mode Supabase | Vérification JWT (JWKS ou HS256 : émetteur, audience, expiration, rôle), création du profil au 1er passage, choix d'un autre pseudo si pris, récupération de mot de passe côté client | `tests/supabase.test.ts` : Postgres réel en mémoire (PGlite), **migration du dépôt**, faux schéma `auth` identique à Supabase, jetons signés | 6/6 (jetons expirés / falsifiés / anonymes / d'un autre projet refusés, profil retrouvé, pseudo en double, historique limité) |
| RLS | Politiques sur les 5 tables, privilèges par défaut révoqués | Requêtes exécutées sous les rôles `authenticated` et `anon` | lecture limitée à ses données, écritures interdites, anonyme : « permission denied » |
| Données existantes | Schéma SQLite étendu sans rien supprimer | `tests/migration.test.ts` sur une base au format de la version précédente | comptes, sessions, statistiques conservés |
| 40 personnages | Catalogue Rocketbox (MIT), pipeline reproductible, vignettes, cartes, animations sur le même squelette | 40 modèles chargés et animés dans Chromium (agent de rendu) ; planches de contrôle inspectées | aucun T-pose, textures et cheveux corrects (voir E pour le glissement des pieds en course) |
| Sélection en salon | Réservation **atomique** côté serveur, libération au départ/expulsion/délai de reconnexion, réinitialisation après chaque partie, état versionné contre les réponses tardives | `tests/multiplayer.test.ts` : sélection simultanée (un seul gagnant), changement, libération, refus d'un personnage pris ou inconnu ; navigateur : galerie et retour au salon | réussi |
| Règles de l'affaire | Meurtrier désigné, protecteurs, 3 scénarios, chaînes de preuves, verrous (codes, clés, meubles), dossier commun, alibis recoupés, opposition officielle, accusations, votes, éliminations, délibération finale, épilogue | `tests/engine.test.ts` : **36 cas**, dont les 3 scénarios × 3 à 8 joueurs | réussi (détail en B) |
| Interaction E | Une seule cible : raycast depuis le centre de l'écran (murs = obstacles), repli dans un cône devant le personnage, E = action principale, F = autres actions ; une seule requête à la fois | Partie réelle dans Chromium : invite « Corps de … / E Fouiller le corps », appui sur E, objets trouvés | réussi |
| Objets cachés sous un grand meuble | Bug trouvé par la partie automatisée : « Trop loin » → distance mesurée au bord du meuble | relance de la partie complète | corrigé |
| Erreur `isReady` (three.js) | Compilation asynchrone des shaders poursuivie sur une scène libérée → compilation synchrone pendant le chargement | relance de la partie complète | 0 erreur navigateur |
| Plan sur le corps | Joué à la fermeture de la cinématique (il se jouait caché derrière elle) | partie réelle : légende affichée (journal) | réussi |
| Pluie sonore | Boucle de pluie, drone, tonnerre et groove radio supprimés ; partition d'enquête procédurale originale (piano, nappes) ; musique et effets séparés | `tests/audio.test.ts` (9) : rendu hors ligne de chaque piste, absence de bruit large bande, fondus sans dépassement, 6 lancements successifs sans accumulation, réglages appliqués en direct | crête −17 à −18 dBFS, ≈ −28 LUFS au réglage par défaut ; 0 % d'énergie au-dessus de 5 kHz (pluie : 26 %) |
| Villa | Sous-sol (chaufferie, cave), rez-de-chaussée (dont salle à manger, salle de jeux, garage, buanderie, toilettes), étage, grenier, verger + 2 cabanes ; 5 escaliers/échelles ; meubles verrouillés intégrés à l'enquête | `tests/villa.test.ts` (12) : toutes les tuiles de toutes les pièces accessibles avec les règles du serveur, rampes dans les deux sens, pas d'accès latéral, portes/cachettes dégagées ; partie réelle : montée à l'étage, fouilles | réussi |
| Sécurité | En-têtes HTTP, limitation de débit (auth, requêtes, flux), même origine par défaut, `npm audit` (rollup 4.59.1) | tests d'accès hors partie, socket sans jeton, requêtes forgées ; `npm audit` | 0 vulnérabilité ; accès refusés |
| Réseau | Instantanés sans description des personnages, compression WebSocket | `scripts/bench-server.ts` + partie réelle | débit brut −34 % (346 → 228 Ko/s pour 8 joueurs avant compression), affichage correct |
| Licences | Anciens modèles d'exemple (Mixamo / Ready Player Me) supprimés | build + partie réelle sans eux | réussi |

## B. Testé sans anomalie détectée

Conditions : tests automatisés (`npm test`), partie de bout en bout dans Chromium (1280×720, rendu logiciel) avec
3 joueurs (1 navigateur + 2 clients temps réel), serveur de production local (`NODE_ENV=production`).

- **Distribution des rôles** : exactement 1 meurtrier humain ; 0 / 1 / 2 protecteurs à 3–5 / 6–7 / 8 joueurs ; victime = personnage non choisi ; secrets, empreintes et semelles uniques.
- **Cohérence** : absence du meurtrier qui encadre l'heure du crime, remarquée par un compagnon ; mobile, ticket de la station et photo sans le meurtrier toujours présents ; chaque secret d'innocent prouvé par un document ; vérité identique après 20 s de partie.
- **Aucune fuite** dans les vues : secrets des autres, identité du meurtrier, faits, verrous et codes absents (3 scénarios × 3–8 joueurs) ; aucun texte de scénario dans le JavaScript envoyé au navigateur.
- **Chaîne complète** corps → clé → boîte → journal → téléphone → ordinateur → coffret → clé USB lue dans l'ordinateur ; coffre-fort (code du journal), tiroir (clé du corps).
- **Codes** : 3 erreurs → blocage 30 s (pas de force brute).
- **Appareil photo** : photo du groupe sans le meurtrier ; la carte peut être retirée et brûlée (cendres).
- **Gants** : plus d'empreintes. **Arme** : empreinte partielle du meurtrier après essuyage. **Autopsie** : fibres du vêtement réel du meurtrier.
- **Alibis** : une pièce versée au dossier contredit ou confirme une déclaration ; impossible de verser une pièce non lue.
- **Accusations** : interdites pendant la découverte du corps, pièce lue obligatoire, une seule à la fois, accusé·e exclu·e du vote, vote définitif, majorité absolue, égalité = relâché·e, délai et limite par joueur.
- **Victoire / défaite** : meurtrier arrêté → innocents ; innocent arrêté → la nuit continue ; égalité ou mauvais choix à la délibération finale → meurtrier ; un seul joueur libre face au meurtrier → meurtrier.
- **Éliminations** : seulement le meurtrier, seulement contre un opposant officiel, sans témoin, avec délai.
- **Protecteur** : connaît le meurtrier, qui détient la preuve de son secret ; la dénonciation le fait passer chez les innocents.
- **Joueur arrêté ou mort** : ne bouge plus, ne parle qu'aux spectateurs, ne vote pas.
- **Déconnexion / reconnexion** : le personnage reste ; vue complète retrouvée ; reprise de la cinématique en cours.
- **Accès** : joueur d'une autre partie ou sans partie, socket sans jeton, actions inconnues ou forgées : tous refusés.
- **Parcours complet** : inscription → session restaurée → salon privé → galerie → réservation refusée pour un personnage pris → chargement → cinématique → plan sur le corps → enquête (E, escaliers, fouilles, journal, code) → dossier commun → accusation → défense → vote → épilogue → retour au salon avec sélections réinitialisées, **0 erreur navigateur** (`e2e-log.txt`).
- **Photos d'enquête** : les personnages des photos sont exactement ceux de la partie (`photo-groupe.jpg` vs `photo-groupe-reference.jpg`).
- **Serveur** : 8 joueurs = 0,03 ms par tick (budget 50 ms), 0,2 ms par diffusion (budget 83 ms), 12 Mo de tas.

## C. Vérification manuelle nécessaire

| À vérifier | Pourquoi ce n'est pas automatisable ici | Comment |
|---|---|---|
| Musique et effets **à l'écoute** (casque et haut-parleurs) : légèreté, crédibilité du piano, synchronisation avec l'image, équilibre avec le chat vocal | Aucune sortie audio dans le conteneur ; seules des mesures ont été faites | Lancer une partie, écouter la cinématique et 2 minutes d'enquête (liste dans `docs/AUDIO.md`) |
| Fluidité réelle (FPS) sur un PC ordinaire et un portable | Pas de GPU : rendu logiciel ≈ 1 image / 5 s | Ouvrir une partie, vérifier la qualité adaptative (halo, ombres) |
| Partie à **plusieurs vraies personnes** (4 à 8) : lisibilité, équilibre des scénarios, durée | Une seule personne pilotée en navigateur | Une session de test par scénario |
| Plan sur le corps et cinématique sur un vrai GPU | Les captures en rendu logiciel arrivent après la fin du plan (6 s) | Observer la fin de la cinématique |
| Petits écrans et mobile | Testé seulement en 1280×720 | Ouvrir en 1366×768, 1920×1080 et sur une tablette |
| Firefox et Safari | Testé seulement sous Chromium | Parcours complet dans chaque navigateur |
| Chat vocal entre deux appareils | Nécessite deux micros réels | Deux joueurs, bouton 🎙 |

## D. Bloqué par une autorisation ou une ressource

| Élément | Ce qui manque | Ce qui est prêt |
|---|---|---|
| **Projet Supabase en ligne** | Accès à votre compte Supabase | Migration SQL + RLS (`supabase/migrations/`), procédure complète (`docs/SUPABASE.md`), variables listées dans `render.yaml` et `.env.example` |
| Tests de persistance **sur Supabase réel** : e-mail de confirmation, lien « mot de passe oublié », autre appareil, expiration de session (1 h) | Un projet Supabase et une boîte mail | Le code client gère ces cas ; tableau de vérification dans `docs/SUPABASE.md` §5 |
| **Mise en ligne** (Render ou autre) | Votre compte d'hébergement | `render.yaml`, `Dockerfile`, `DEPLOY.md` |
| E-mails en volume | Un SMTP (le service intégré de Supabase est limité à quelques e-mails/heure) | Étape décrite dans `docs/SUPABASE.md` |

## E. Limites connues

- **Personnages** : diversité limitée par la bibliothèque Rocketbox : teints variés mais peu de peaux foncées chez les femmes (1 foncée, 2 métisses, 2 mates, 15 claires sur 20) ; pas d'animation de corps allongé (pose calculée) ; léger glissement des pieds en course (≈ 0,35 m/s).
- **Photos d'enquête** : décors simples (table, fond coloré), visages lisibles mais cadrage basique.
- **Ciblage E** : vise ce que regarde la caméra. Un objet au sol, sous le personnage, demande de baisser la caméra (le repli « devant le personnage » ne s'applique que si le rayon ne touche rien).
- **Une partie en cours vit en mémoire** : un redémarrage du serveur la termine (les comptes sont conservés).
- **Un seul processus serveur** : pas de répartition des parties sur plusieurs machines.
- **Bundle client** ≈ 1,48 Mo (425 Ko compressé) : pas encore découpé ; modèles des personnages ≈ 34 Mo au total, chargés seulement pour les personnages de la partie (≤ 1 Mo chacun).
- **Équilibrage** : durées, nombre d'accusations, délais et difficulté des chaînes de preuves sont à régler en jouant.
- **Pluie visuelle** conservée (la consigne portait sur le son) ; le verger reste très sombre la nuit.
- **Scénario imposé par l'hôte** : non proposé (tirage au sort à chaque partie).

---

## Inventaire des objets réellement présents

Chaque objet a un identifiant stable (type + identifiant d'instance serveur), un emplacement, des états et une conséquence.
Les textes, codes et personnes visées sont générés par le serveur à chaque partie.

| Objet | Où | Interactions (conditions) | États | Ce qu'il apporte / conséquences |
|---|---|---|---|---|
| Téléphone de la victime | sur le corps | fouiller le corps, prendre, saisir le code (4 chiffres, du journal) ; analyste : contourner | verrouillé → ouvert | messages signés de surnoms (meurtrier et fausses pistes), appel manqué ; 3 erreurs = blocage 30 s |
| Petite clé dorée | sur le corps | prendre ; ouvre la boîte cadenassée | — | accès au journal |
| Petite clé de bureau | sur le corps | prendre ; ouvre le tiroir du bureau | — | accès à l'ordinateur |
| Boîte cadenassée | cachée dans la chambre de la victime | fouiller, prendre, ouvrir avec la clé | fermée → ouverte | contient le journal |
| Journal intime | dans la boîte | lire | non lu → lu | code du téléphone, mot de passe de l'ordinateur, code du coffre-fort, soupçons sur les joueurs |
| Ordinateur portable | tiroir verrouillé du bureau | mot de passe (journal) ; lit cartes mémoire et clés USB | verrouillé → ouvert | brouillon à la police, notes sur le secret de chaque innocent, code du coffret |
| Coffret à code | malle verrouillée du grenier | code (ordinateur) ; analyste : contourner | fermé → ouvert | contient la clé USB |
| Clé de la malle du grenier | cachée (garage, sous-sol, buanderie…) | prendre ; ouvre la malle | — | accès au coffret |
| Clé USB | dans le coffret | lire dans l'ordinateur | — | **pièce décisive** : mobile du meurtrier |
| Appareil photo | salon / chambre d'amis / hall | lire, retirer la carte | carte insérée / retirée | lecture de la carte |
| Carte mémoire | dans l'appareil | lire (appareil ou ordinateur), cacher, brûler | lue / détruite | photo horodatée du groupe… sans le meurtrier ; la détruire laisse des cendres |
| Photo de groupe | salon ou hall | lire | — | surnoms au dos → qui a écrit les messages |
| Ticket de la station | veste près d'une entrée | fouiller, lire, cacher, brûler | — | place le meurtrier sur la route de la villa (contredit son alibi) |
| Selfie / ticket d'un innocent absent | chambres, cabanes, vestiaire | lire | — | confirme où l'innocent était (lève une fausse piste) |
| Additions | cuisine / salon / hall | lire | — | confirment les alibis d'un groupe |
| Documents de l'histoire passée (coupure de presse, carte annotée, PV, captures, relevés, ordre de virement, lettres…) | coffre-fort du bureau | code (journal), lire, verser au dossier | — | impliquent plusieurs personnes ; certains désignent le meurtrier (initiale, écriture) |
| Preuve du secret de chaque innocent (lettre, relevé, note, photo…) | cachée dans la villa ; **dans les poches du meurtrier** pour un protecteur | lire, cacher, brûler, verser au dossier | secret privé → révélé | révélation publique : une accusation de moins ; protecteur libéré du chantage |
| Arme du crime (chandelier, statuette, tisonnier ou coupe-papier) | cachée hors de la pièce du crime | fouiller, prendre, analyser (scientifique), essuyer | — | sang de la victime (lavé), empreinte partielle du meurtrier ; arme utilisable par le meurtrier contre un opposant |
| Couteau de cuisine, corde | cuisine ; cave / jardin | prendre | — | armes possibles du meurtrier pour une élimination (rien pour les autres) |
| Clé de la cave | une pièce tirée au sort | utiliser près de la porte | porte fermée → ouverte | ouvre la cave à vin et la porte du garage |
| Briquet | salon / jardin / bureau / atelier | brûler un document ou une carte mémoire | — | destruction de preuve (cendres visibles, témoins) |
| Cheminée du salon | meuble | jeter au feu | — | idem sans briquet |
| Torchon | cuisine / salles de bain | essuyer un objet ou une trace | — | efface des empreintes / traces mais laisse une zone frottée détectable |
| Gants de jardinage | jardin / cave / atelier | enfiler / retirer | portés / non | plus aucune empreinte laissée |
| Lampe torche | cuisine / hall / chambres | allumer / éteindre | allumée / éteinte | voir et être vu pendant la coupure de courant |
| Coffre-fort, tiroir du bureau, malle du grenier | meubles | code / clé, puis fouiller | verrouillé → ouvert | contenus décrits ci-dessus |
| Cachettes (≥ 2 par pièce), éviers et lavabos | meubles | fouiller, cacher ; se laver les mains | — | dissimulation ; se laver laisse du sang dilué détectable |
| Corps de la victime | pièce du crime | fouiller, autopsie (légiste) | — | objets, heure de la mort, arme, fibres |

**Objets interdits — absence confirmée** (code, catalogue, mobilier, décor ; test `aucun objet interdit…`) : horloge
et montre (horloge de parquet, pendule et montre à gousset retirées), enregistreur audio, dictaphone, disque dur externe,
tableau blanc (le « tableau d'enquête » de l'interface est devenu le « dossier commun », sans objet en jeu), plateau à
boissons, badge d'accès (retiré), disjoncteur secondaire, sonnette connectée, caméra de surveillance (moniteur et
spécialité « technicien » retirés, remplacés par l'analyste numérique).

**Objets annoncés mais non implémentés** : aucun. Bracelet, écharpe et clés de voiture, prévus un temps, n'avaient pas
de fonction : ils ont été retirés du catalogue plutôt que laissés décoratifs.

---

## Contrôle final (§18)

| Critère | Statut | Preuve / remarque |
|---|---|---|
| Parcours complet inscription → fin de partie | Réussi et testé | `e2e-log.txt`, captures `e2e/` |
| 3 scénarios × plusieurs configurations | Réussi et testé | 18 simulations (3–8 joueurs) ; parties réelles tirées sur les 3 scénarios |
| Victoire, défaite, élimination, égalité, déconnexion | Réussi et testé | `tests/engine.test.ts` |
| Contournement (répétitions, concurrence, client modifié) | Réussi et testé | double vote, sélection simultanée, actions forgées, verrous, limites de débit |
| Galerie de contrôle des 40 personnages | Réussi et testé | `cast-femmes.jpg`, `cast-hommes.jpg` (inspectées) |
| Visages, cheveux, vêtements, animations | Vérification manuelle nécessaire | contrôlés en rendu logiciel ; à revoir sur GPU (glissement en course, voir E) |
| Photos cohérentes avec les personnages | Réussi et testé | `photo-groupe*.jpg` |
| Chaque pièce : collisions, accès, interactions | Réussi et testé | `tests/villa.test.ts` (accès de toutes les tuiles) ; visite visuelle partielle (pièces traversées pendant la partie) |
| Inventaire des objets, interdits absents | Réussi et testé | section ci-dessus + test |
| Autorisations (non connecté, connecté, autre partie) | Réussi et testé | `tests/multiplayer.test.ts`, `tests/supabase.test.ts` |
| RLS, secrets non exposés | Réussi et testé | tests RLS ; `/api/config` sans secret ; bundle sans scénario |
| Comptes, sessions après rechargement / reconnexion | Réussi et testé (mode local) · Bloqué (Supabase réel) | voir D |
| Migrations qui préservent les données | Réussi et testé | `tests/migration.test.ts` ; SQL Supabase en `if not exists` |
| Production sans secrets de développement | Réussi et testé | secrets uniquement par variables d'environnement ; `.env` ignoré par git |
| Plus aucun son de pluie | Réussi et testé | mesures `tests/audio.test.ts`, recherche dans le code |
| Musique légère et synchronisée | Vérification manuelle nécessaire | mesures OK ; écoute requise |
| Fondus, pas de superposition après plusieurs lancements | Réussi et testé | `tests/audio.test.ts` (6 parties successives) |
| Temps de chargement, FPS | Non testé (GPU réel) | serveur mesuré ; bundle 425 Ko compressé |
| Erreurs console, fuites, requêtes répétées | Réussi et testé | 0 erreur navigateur ; 6 parties audio sans accumulation ; entrées limitées à 30/s |
| Résolutions prises en charge | Non testé | seulement 1280×720 |

## Commandes exécutées (dernière exécution)

```
npm run typecheck                         → aucune erreur
npm test                                  → 80 tests, 80 réussis, 0 échec
npm audit                                 → found 0 vulnerabilities
npm run build                             → OK (JS 1 481 Ko, 425 Ko gzip ; CSS 37 Ko)
node --import tsx scripts/bench-server.ts → 0,031 ms/tick, 0,23 ms/diffusion (8 joueurs)
node --import tsx scripts/e2e-playthrough.ts (serveur de production local) → partie complète, 0 erreur navigateur
```

## Lancer et vérifier

```bash
npm ci && npm run build
npm start                                   # http://localhost:3001 (comptes locaux)
# avec Supabase : renseigner SUPABASE_URL, SUPABASE_ANON_KEY, DATABASE_URL (voir docs/SUPABASE.md)
curl http://localhost:3001/api/health       # "storage" et "auth" indiquent le mode actif
```

Partie automatisée : en-tête de `scripts/e2e-playthrough.ts`.
