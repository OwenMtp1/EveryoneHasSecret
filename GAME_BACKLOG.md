# GAME_BACKLOG — EVERYONE HAS A SECRET

Mémoire globale du projet. **On ne supprime jamais une idée** parce qu’elle n’est pas prioritaire : on la classe.

**Priorités** — P0 indispensable · P1 bonne expérience · P2 amélioration · P3 évolution future
**Statut** — ✅ fait (V0.1) · 🟡 partiel · ⬜ à faire

Processus pour chaque tâche : lire ce fichier → dépendances → petite fonctionnalité → implémenter → tester → vérifier le multijoueur → vérifier les régressions (`npm test`) → mettre à jour ce fichier → noter problèmes et idées.

---

## Journal

### V0.1 — vertical slice (ce lot)
Parcours complet jouable : compte → personnage → menu → création/rejoindre → lobby → transition → villa → exploration → relations → objets → tension → opportunité → meurtre → découverte → rôles → enquête → preuves → discussion → vote → épilogue → retour lobby.

### V0.2 — passage en 3D (demande du joueur)
Rendu entièrement en 3D dans le navigateur (Three.js) : villa générée depuis le plan, personnages 3D procéduraux animés, caméra **troisième personne** par défaut et **première personne** avec `V`, souris pour orienter, collision caméra/murs, plafonds, fenêtres, lampes par pièce, pluie, éclairs, coupure de courant avec lampes torches ; créateur, profil, lobby, épilogue et fond du menu en 3D. Serveur et moteur de jeu inchangés.

### V0.3 — personnages réalistes, étape 1
Modèles humains riggés et texturés (homme Ready Player Me, femme Mixamo) avec animations capturées (attente, marche, course) transférées en espace monde depuis le mannequin Mixamo ; mélange des animations selon la vitesse ; teinte de peau et couleurs de tenue appliquées à l'homme. Repli automatique sur le personnage procédural. Voir `public/models/README.md`.

### V0.4 — jouer seul : invités IA + partie rapide
- **Invités IA** (`server/game/bots.ts`) : mêmes actions validées que les humains ; exploration (pathfinding), mémoire des objets aperçus, relations, rancunes (un bot avec mobile va chercher une arme et suit sa cible), meurtre opportuniste, nettoyage après coup, témoignages (le coupable ment), rôles d'enquête joués (autopsie, inspection, caméras, empreintes, interrogatoires) et résultats partagés, vote d'après ses connaissances.
- **Partie rapide** : vous + 4 invités IA, nuit courte, un clic. L'hôte peut aussi ajouter/retirer des invités IA dans n'importe quel lobby.
- **Durée de la nuit** : courte (~8 min) ou normale (~15 min).
- **Ligne de vue** : on voit (et on est vu) à travers une porte ouverte, près de celle-ci ; les témoins à travers une porte empêchent l'opportunité.

### Problèmes découverts pendant le développement
- `rollup@4.64.2` (tiré par Vite 6.3) bloque indéfiniment en bundlant `react-dom` → épinglé à 4.40.2 via `overrides`. À réévaluer à la prochaine montée de Vite.
- Le serveur émet `session:state` dès la connexion : un client doit brancher ses écouteurs **avant** `connect` (corrigé dans les tests).
- Les animations CSS utilisant `transform` écrasaient les centrages `translateX(-50%)` → les keyframes utilisent `translate`.
- Avec une échelle de temps très courte, le chien découvre le corps avant les joueurs : réglage `body_found_by_dog` à surveiller en playtest réel.
- Le meurtrier peut recevoir le rôle de médecin légiste (voulu, mais à équilibrer : lui permettre de falsifier l’autopsie ? voir EVIDENCE P2).

---

## ACCOUNT
- ✅ [P0] Inscription / connexion / déconnexion (pseudo + mot de passe, scrypt salé)
- ✅ [P0] Persistance de session (jeton opaque 30 j, localStorage)
- ✅ [P0] Gestion des erreurs (messages lisibles, 401 → reconnexion)
- ✅ [P1] Limitation des tentatives de connexion (5 / min / pseudo)
- ⬜ [P1] E-mail + vérification + mot de passe oublié
- ⬜ [P1] Changement de mot de passe / suppression de compte (RGPD)
- ⬜ [P2] Connexion OAuth (Discord, Google)
- ⬜ [P2] Comptes invités (jouer sans inscription, conversion ensuite)

## PROFILE
- ✅ [P0] Profil (pseudo, date d’inscription, personnage)
- ✅ [P2] Statistiques (nuits jouées, victoires)
- ✅ [P2] Historique des dernières parties (global)
- ⬜ [P2] Historique personnel détaillé (rôle tenu, coupable, vote)
- ⬜ [P2] Badges · ⬜ [P2] Réputation · ⬜ [P3] Succès
- ⬜ [P2] Consulter le profil d’un autre joueur depuis amis/lobby (API prête : `/api/profile/:id`)

## CHARACTER
- ✅ [P0] Création de personnage à la 1re connexion (pas de personnage générique)
- ✅ [P0] Prénom / nom validés (2–20, lettres/espaces/tirets/apostrophes, filtrage basique)
- ✅ [P0] Apparence masculine / féminine (purement visuelle)
- ✅ [P0] 8 teintes de peau (`skinTone`, données)
- ✅ [P0] 10 coiffures (`hairStyleId`, données) + 8 couleurs de cheveux
- ✅ [P0] 20 tenues (`outfitId`, 6 catégories, motifs rayures/carreaux/pois)
- ✅ [P0] Sauvegarde · ✅ [P0] Affichage lobby · ✅ [P0] Affichage villa
- ✅ [P1] SURPRENDS-MOI (randomisation) · ✅ [P1] Rotation (glisser, vue de dos) · ✅ [P1] Animation idle · ✅ [P1] Modification depuis le profil
- ⬜ [P2] Accessoires · ⬜ [P2] Barbe · ⬜ [P2] Lunettes · ⬜ [P2] Bijoux · ⬜ [P2] Tatouages
- ⬜ [P2] Morphologies / tailles · ⬜ [P2] Expressions faciales en jeu (peur, colère)
- ✅ [P0] Personnage 3D procédural (data-driven, coiffures en primitives `parts3d`) avec marche et attente animées
- ✅ [P0] Étape 1 — modèles réalistes riggés + animations (attente, marche, course), transfert d'animation en espace monde
- ⬜ [P0] Étape 2 — pipeline MakeHuman (CC0) → Blender (bpy) → glTF : corps H/F, morphologies, teintes de peau, 10 coiffures et 20 tenues modulaires sur un squelette commun
- ⬜ [P0] Licence : remplacer les modèles provisoires (Mixamo / Ready Player Me) avant toute sortie publique
- ⬜ [P1] Visages expressifs (morph targets : clignement, parole, peur)
- ⬜ [P2] Animations d'interaction (ramasser, fouiller, se laver, s'effondrer)

## SOCIAL
- ✅ [P0] Historique social (« X a aidé Y », « X a trahi Y », accusations, hostilités)
- ⬜ [P2] Groupes / équipes persistantes · ⬜ [P3] Réputation inter-parties (« connu pour trahir »)

## FRIENDS
- ✅ [P1] Recherche, demande, acceptation, refus, suppression, demande croisée = acceptation
- ✅ [P1] Statuts OFFLINE / ONLINE / IN_LOBBY / IN_GAME en temps réel
- ✅ [P1] Inviter un ami dans une partie (ACCEPT / DECLINE)
- ✅ [P1] Rejoindre le lobby d’un ami
- ⬜ [P2] Bloquer un joueur · ⬜ [P2] Messages privés hors partie

## NOTIFICATIONS
- ✅ [P1] Système global animé (toasts) + persistance
- ✅ [P1] Demande d’ami, demande acceptée, invitation, ami connecté, ami rejoint une partie, expulsion, partie fermée
- ⬜ [P2] Centre de notifications (liste + marquer lu ; API prête) · ⬜ [P3] Notifications push navigateur

## SERVERS
- ✅ [P0] Écran SERVERS : nom, hôte, joueurs/max, statut, REJOINDRE, rafraîchissement
- ✅ [P0] Filtres : toutes / disponibles, nombre de joueurs, avec amis
- ⬜ [P2] Filtres langue, type de partie, difficulté, scénario, mode (structure `ServerFilters` extensible)

## LOBBY
- ✅ [P0] Invités IA ajoutables/retirables par l'hôte · ✅ [P0] Partie rapide (solo + IA) · ✅ [P1] Durée de nuit (courte/normale)
- ⬜ [P1] Niveau des invités IA (naïf / rusé), personnalités
- ✅ [P0] Créer une partie (nom, max joueurs 2–8, PUBLIC / PRIVATE)
- ✅ [P0] Code de partie (6 caractères non ambigus) · ✅ [P0] JOIN GAME par code
- ✅ [P0] Lobby en scène (personnages, READY ✓ / NOT READY, places libres)
- ✅ [P0] READY · ✅ [P0] Lancement (hôte, tous prêts, minimum configurable)
- ✅ [P0] Hôte : inviter, expulser, paramètres, fermer, lancer — vérifié serveur
- ✅ [P0] Transfert d’hôte si l’hôte part · ✅ [P1] Chat de lobby · ✅ [P1] Délai de grâce de 45 s en cas de déconnexion
- ✅ [P1] Retour au même lobby après l’épilogue (rejouer avec le même groupe)
- ⬜ [P1] Paramètres de partie avancés (durées, scénarios autorisés, langue)
- ⬜ [P2] Lobby 3D/2.5D (salon de la villa), emotes
- ⬜ [P2] Spectateurs

## MULTIPLAYER
- ✅ [P0] Serveur autoritaire (identité, permissions, positions, inventaire, objets, relations, événements, preuves, lobby, lancement)
- ✅ [P0] Synchronisation des joueurs (20 Hz simulation, 12 Hz vues, interpolation client)
- ✅ [P0] Vues filtrées par joueur (aucune vérité côté client)
- ✅ [P1] Reconnexion en cours de partie (session:state + game:full)
- ✅ [P1] Plusieurs onglets par compte (présence agrégée)
- ⬜ [P1] Persistance/reprise des parties après redémarrage serveur (snapshot périodique)
- ⬜ [P1] Anti-flood plus fin (limiteur par action) · ⬜ [P2] Prédiction client du déplacement
- ⬜ [P2] Répartition horizontale (une partie = un worker ; adaptateur Redis Socket.IO)

## WORLD
- ✅ [P0] Villa data-driven (11 zones, 16 portes, 24 meubles, 18 cachettes)
- ✅ [P0] Zones verrouillées (cave & garage : clé ou tournevis)
- ✅ [P1] Brouillard : seules la pièce courante et ce qui s’y trouve sont visibles
- ✅ [P1] Météo : pluie sur l’extérieur, coupure de courant (blackout)
- ⬜ [P1] Étage (chambres à l’étage, escalier) · ⬜ [P2] Fenêtres (voir dans le jardin) · ⬜ [P2] Portes qu’on ferme à clé de l’intérieur
- ⬜ [P2] Pièces secrètes / passages · ⬜ [P2] Variantes de villa (agencements tirés au sort)
- ⬜ [P3] Jardin étendu → quartier → village → ville → autres bâtiments → véhicules

## MOVEMENT
- ✅ [P0] Déplacement clavier (ZQSD/WASD/flèches), collisions, portes
- ✅ [P0] Changement de pièce journalisé (PLAYER_ENTERED_ROOM / LEFT_ROOM)
- ✅ [P0] 3D : déplacements relatifs à la caméra, troisième personne + première personne (`V`), souris (verrouillage du pointeur), molette, collision caméra/murs
- ✅ [P1] Plan 2D de la villa (touche M)
- ⬜ [P1] Sensibilité souris / inversion dans les paramètres · ⬜ [P2] Manette
- ⬜ [P1] Clic-pour-aller (pathfinding) · ⬜ [P1] Contrôles tactiles (joystick)
- ⬜ [P2] Courir (bruyant) / marcher discrètement · ⬜ [P2] Se cacher (armoire)

## OBJECTS
- ✅ [P0] Système générique (tags + useEffect, aucune condition par objet)
- ✅ [P0] 17 types : couteau, chandelier, corde, coupe-papier, bouteille, clé, tournevis, lampe, torchon, briquet, téléphone, somnifères, montre, badge, collier, lettre, photo
- ✅ [P0] Propriétés : id, type, owner/location, state, history, traces, props
- ✅ [P0] Prendre, poser, déplacer, cacher, donner, utiliser, examiner, détruire (brûler), nettoyer
- ✅ [P1] Historique complet de chaque objet
- ✅ [P1] Apparition aléatoire (pièces candidates, probabilité)
- ⬜ [P1] Voler (prendre dans la poche de quelqu’un, risque d’être vu)
- ⬜ [P2] Contaminer / falsifier un objet (déposer les empreintes d’un autre ?)
- ⬜ [P2] Conteneurs (sac, coffre à code) · ⬜ [P2] Poison (verre, bouteille) · ⬜ [P2] Objets combinables

## INVENTORY
- ✅ [P0] Inventaire privé (4 emplacements), invisible des autres
- ✅ [P0] Prendre, déposer, donner, cacher, utiliser, examiner
- ✅ [P1] Poches visibles entre partenaires de pacte
- ⬜ [P2] Fouiller quelqu’un (consentement ou rôle) · ⬜ [P2] Objets volumineux visibles en main

## RELATIONSHIPS
- ✅ [P0] NONE / FRIEND / ALLY / PACT / ENEMY / VENDETTA avec type, date, historique, origine
- ✅ [P0] Consentement en face à face pour FRIEND/ALLY/PACT ; ENEMY notifie la cible ; VENDETTA secrète avec mobile
- ✅ [P0] Alliances utiles : canal privé, positions partagées, partage de connaissances en un clic
- ✅ [P1] Pacte : poches partagées ; rupture = TRAHISON (événement, débloque la vendetta)
- ✅ [P1] Pacte ancien caché (graine de conspiration)
- ⬜ [P1] Alliances de groupe (>2) · ⬜ [P2] Opportunités réservées aux alliés (événements)
- ⬜ [P2] Influence des relations sur les dialogues PNJ / événements ciblés

## EVENTS
- ✅ [P0] Journal de vérité global append-only, horodaté (réel + horloge de jeu), lié joueurs/objets/lieux
- ✅ [P0] ~40 types de faits (PLAYER_ENTERED_ROOM, OBJECT_PICKED_UP, PLAYER_TOUCHED_OBJECT, RELATION_CREATED, BETRAYAL, SECRET_DISCOVERED, PLAYER_ATTACKED, PLAYER_DIED, EVIDENCE_CREATED/DESTROYED…)
- ✅ [P0] Moteur de règles générique (on / when / effects, once, cooldown, délais, garde-fou de récursion)
- ✅ [P0] Conditions : phase, temps, flags, champs du fait, tags d’objet, hasard, corps non découvert, objet déplacé, relations, joueurs vivants
- ✅ [P0] Effets : annonce, murmure ciblé, phase, flag, blackout, affaire, rôles, lettre anonyme, découverte PNJ, vote, fin, délai
- ✅ [P0] Événement majeur : découverte du corps · ✅ [P1] Alternatives : vol du collier, aube calme
- ✅ [P1] Événements aléatoires : téléphone qui sonne, lettre anonyme, murmure à la prise d’arme
- ⬜ [P1] Éditeur/visualiseur de règles (debug) · ⬜ [P2] Événements rares · ⬜ [P2] Événements secrets (ciblant un joueur)
- ⬜ [P2] Conditions composées (OR / NOT) · ⬜ [P2] PNJ (majordome, chien) avec comportements

## SCENARIOS
- ✅ [P0] Événement générique + conditions + conséquences
- ✅ [P0] MURDER prototype (opportunité émergente, pas de tueur désigné)
- ✅ [P1] HEIST (graine « voleur » + collier, révélation si déplacé)
- ✅ [P1] CONSPIRACY (graine « pacte ancien »)
- 🟡 [P2] Scénarios hybrides (vol + meurtre coexistent ; une seule affaire ouverte à la fois)
- ⬜ [P1] DISAPPEARANCE · ⬜ [P1] SURVIVAL (incendie, inondation, tempête)
- ⬜ [P2] Chaînes d’affaires (vol → conflit → meurtre → conspiration) · ⬜ [P2] Plusieurs meurtres (`maxMurders`)
- ⬜ [P2] Branches complexes · ⬜ [P3] Méta-histoire (Victor Beaumont, Beaumont Industries) sur plusieurs parties

## EVIDENCE
- ✅ [P1] Empreintes digitales (codes uniques par joueur, ordre chronologique, effaçables)
- ✅ [P1] Empreintes de chaussures (boue du jardin → traces intérieures, motif + pointure)
- ✅ [P1] Sang (arme, flaque, vêtements, sang dilué dans le siphon)
- ✅ [P1] Fibres (tenue du tueur sous les ongles de la victime)
- ✅ [P1] Historique des objets et des déplacements · ✅ [P1] Caméras (hall, allée ; trous pendant les coupures)
- ✅ [P1] Témoignages + contradictions (vérification contre les faits)
- ✅ [P1] Nettoyage (objet, sol) laissant des résidus · ✅ [P2] Destruction (brûler un document → cendres)
- ⬜ [P2] ADN · ⬜ [P2] Téléphones (journal d’appels, messages entre joueurs) · ⬜ [P2] Falsification (déposer une fausse trace)
- ⬜ [P2] Dégradation des traces dans le temps · ⬜ [P2] Contamination (piétiner la scène)
- ⬜ [P2] Heure de la mort influencée par l’environnement (froid de la cave)

## INVESTIGATION
- ✅ [P0] Première enquête complète (affaire, tableau public, déclarations, témoignages, vote, épilogue)
- ✅ [P0] Tableau d’enquête : constat (vrai) / rapporté / déclaration (peut être faux)
- ✅ [P0] Le meurtrier participe à l’enquête (rôle, mensonge, nettoyage, accusation)
- ✅ [P1] Épilogue : coupable, chronologie de la vérité, secrets, votes, rôles
- ⬜ [P1] Mini-jeux par rôle (comparer des empreintes, monter une chronologie)
- ⬜ [P1] Confrontation (deux témoignages face à face) · ⬜ [P2] Reconstitution de chronologie interactive
- ⬜ [P2] Score détaillé (meilleur enquêteur, meilleur menteur)

## ROLES
- ✅ [P1] 6 rôles : Enquêteur·rice, Médecin légiste, Scientifique, Inspecteur·rice, Technicien·ne, Profileur·se
- ✅ [P1] Asymétrie (infos et outils exclusifs, usages limités)
- ✅ [P1] Distribution dynamique (affinités calculées depuis la nuit jouée)
- ⬜ [P1] Analyste (timelines croisées) · ⬜ [P1] Journaliste (archives, passé des invités)
- ⬜ [P2] Choix du rôle parmi 2 proposés · ⬜ [P2] Rôles débloqués par objet (badge → accès archives)

## COMMUNICATION
- ✅ [P0] Chat général · ✅ [P0] Chat privé (et les témoins vous voient « murmurer ») · ✅ [P1] Canaux d’alliance/pacte · ✅ [P1] Canal des morts
- ✅ [P1] Chat de lobby
- ⬜ [P2] Chat de proximité (même pièce) en option · ⬜ [P2] Chat vocal · ⬜ [P2] Communications coupées (orage, téléphone)
- ⬜ [P2] Modération (filtre, signalement, mute)

## REPLAYABILITY
- ✅ [P1] Objets, secrets, cibles, graines, identités physiques, messages et événements tirés à chaque partie
- ✅ [P1] Rôles dépendants de la nuit jouée · ✅ [P1] RNG à graine (rejouer une graine précise en test)
- ⬜ [P2] Lieux accessibles variables · ⬜ [P2] Pool de secrets étendu (50+) · ⬜ [P2] Météo variable · ⬜ [P3] Saisons / événements temporaires

## IMMERSION
- ✅ [P1] Écran d’accueil vivant (villa de nuit, pluie, fenêtres, silhouettes, éclairs, horloge)
- ✅ [P1] Transition cinématique (23:47 · Villa Beaumont · …)
- ✅ [P1] Narration (annonces centrales, journal), coupure de courant, sons d’orage
- ⬜ [P2] Cinématique de découverte du corps · ⬜ [P2] Particules (poussière, bougies) · ⬜ [P2] Éclairage dynamique par pièce

## UX
- ✅ [P0] Barre d’interactions contextuelle (ce qui est à portée), sélecteur de cible, retours d’action
- ✅ [P1] Onglets Inventaire / Relations / Carnet / Enquête, raccourcis clavier
- ✅ [P1] Carnet filtrable (vu, entendu, indices, rôle, reçu) + partage
- ⬜ [P1] Tutoriel / première nuit guidée · ⬜ [P1] Interface mobile dédiée · ⬜ [P2] Internationalisation (EN)
- ⬜ [P2] Accessibilité (lecteur d’écran, contrastes) — 🟡 option « réduire les animations » faite

## AUDIO
- ✅ [P1] Ambiance procédurale (pluie, drone), sons d’UI, tonnerre, réglages de volume
- ⬜ [P2] Musique composée par phase · ⬜ [P2] Sons spatialisés (pas, portes) · ⬜ [P2] Bruits révélateurs (cri) audibles

## VISUAL
- ✅ [P1] Direction artistique sombre/élégante (Cormorant + Inter, or ancien/cramoisi)
- ✅ [P0] Villa 3D (sols texturés par matériau, murs, plafonds, portes, fenêtres, mobilier composé, lampes, cheminée animée, traces au sol, corps)
- ✅ [P1] Menu, créateur, lobby, profil et épilogue en 3D
- ⬜ [P1] Ombres dynamiques (performance à mesurer) · ✅ [P1] Ligne de vue : voir les joueurs à travers les portes ouvertes (filtrage serveur)
- ⬜ [P2] Modèles 3D d'objets au lieu d'icônes · ⬜ [P2] Post-traitement (bloom, grain) · ⬜ [P3] Graphismes définitifs

## TECHNICAL
- ✅ [P0] TypeScript partagé client/serveur, protocole typé
- ✅ [P0] Contenu data-driven (personnages, villa, objets, secrets, rôles, événements, scénarios)
- ✅ [P0] Tests moteur + intégration multijoueur ; build de production servi par le serveur
- ⬜ [P1] CI (typecheck + tests + build) · ⬜ [P1] Lint/format (ESLint, Prettier)
- ⬜ [P1] Migrations de schéma versionnées · ⬜ [P2] Docker / déploiement · ⬜ [P2] Outil de replay depuis le journal de vérité
- ⬜ [P2] Contenu en JSON chargé à chaud (éditeur de contenu)

## SECURITY
- ✅ [P0] Mots de passe scrypt + sel, comparaison à temps constant, jetons aléatoires 256 bits
- ✅ [P0] Toutes les actions validées serveur (portée, propriété, phase, rôle, hôte)
- ✅ [P0] Aucune vérité envoyée au client (testé) · ✅ [P1] Limites de taille (JSON 32 ko, chat 280)
- ⬜ [P1] Rate limiting HTTP global · ⬜ [P1] En-têtes de sécurité (helmet), CORS restreint en production
- ⬜ [P2] Rotation/révocation des sessions depuis le profil

## PERFORMANCE
- ✅ [P1] Vues complètes seulement si modifiées, snapshots légers sinon ; couche statique pré-rendue
- ⬜ [P2] Deltas binaires · ⬜ [P2] Index spatial pour la perception · ⬜ [P2] Bornage mémoire du journal de vérité sur les longues parties

---

## Tâches demandées — suivi (prompt maître §66–69)

**Personnage** : création ✅ prénom ✅ nom ✅ apparence ✅ 8 teintes ✅ 10 coiffures ✅ 20 tenues ✅ sauvegarde ✅ lobby ✅ monde ✅ randomisation ✅ rotation ✅ idle ✅ modification profil ✅ · accessoires ⬜ barbe ⬜ lunettes ⬜ bijoux ⬜ tatouages ⬜

**Meta** : auth ✅ profil ✅ menu ✅ création partie ✅ code ✅ serveurs publics ✅ rejoindre ✅ lobby ✅ ready ✅ lancement ✅ amis ✅ demandes ✅ invitations ✅ notifications ✅ présence ✅ reconnexion ✅ statistiques ✅ historique 🟡 badges ⬜ réputation ⬜

**Gameplay** : mouvement ✅ sync ✅ villa ✅ pièces ✅ objets ✅ inventaire ✅ interactions ✅ relations ✅ chat ✅ événement majeur ✅ première enquête ✅ empreintes ✅ traces ✅ historique objets ✅ rôles ✅ témoignages ✅ contradictions ✅ · ADN ⬜ caméras ✅ téléphones 🟡 falsification ⬜ destruction preuves ✅

**Scénarios** : événement générique ✅ conditions ✅ conséquences ✅ murder ✅ · disappearance ⬜ heist ✅ conspiracy ✅ survival ⬜ · hybrides 🟡 rares ⬜ secrets ⬜ branches ⬜ · méta-histoire ⬜

## Prochaines étapes recommandées
1. Playtest réel à 4–6 joueurs, mesurer la durée des phases et la fréquence des meurtres (réglages dans `events.ts`).
2. [P1] Tutoriel de la première nuit + clic-pour-aller (accessibilité, mobile).
3. [P1] DISAPPEARANCE et SURVIVAL comme nouvelles graines (réutiliser le moteur d’événements).
4. [P1] Snapshot des parties pour survivre à un redémarrage.
5. [P1] CI + lint.
