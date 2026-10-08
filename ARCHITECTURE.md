# Architecture — EVERYONE HAS A SECRET

## 0. Audit initial (étape 1)

Le dépôt était **vide** (aucun commit, aucun fichier) : projet démarré de zéro, rien n’a été supprimé. Les choix ci-dessous sont donc libres et motivés par la vision : multijoueur temps réel, serveur autoritaire, contenu data-driven, prototype rapide à itérer.

## 1. Stack

| Couche | Choix | Pourquoi |
|---|---|---|
| Langage | **TypeScript** partout | types partagés client/serveur (protocole, vues, contenu) |
| Serveur | **Node.js 22 + Express + Socket.IO** | temps réel bidirectionnel, ack requête/réponse, reconnexion automatique |
| Persistance META | **`node:sqlite`** (SQLite intégré) | zéro dépendance native, fichier unique ; remplaçable par Postgres |
| État de partie | **mémoire serveur** (`GameInstance`) | simulation 20 Hz autoritaire ; seul le résumé de fin est persisté |
| Client | **React 19 + Vite + Zustand** | interface (menus, HUD, panneaux) en React |
| Rendu 3D | **Three.js 0.170** | villa, personnages, créateur, lobby, fond du menu ; caméra 3e personne + 1re personne (`V`) |
| Personnages 3D | **procéduraux, depuis les données** | aucune ressource externe : coiffures décrites en primitives (`parts3d`), tenues en briques réutilisables |
| Portraits UI | SVG composé depuis les mêmes données | petites vignettes (amis, relations, vote) |
| Audio | **Web Audio procédural** | pluie / drone / sons d’UI sans assets (remplaçables) |
| Tests | `node:test` + `tsx` | moteur (horloge injectée) + intégration multijoueur réelle |

> Note build : `rollup` est épinglé à 4.40.2 (`overrides` dans `package.json`) — la 4.64.2 tirée par Vite 6 bloque indéfiniment sur `react-dom` dans cet environnement.

## 2. Organisation

```
src/
  shared/                     ← commun client/serveur (aucune logique réseau)
    config.ts                 nom du jeu, réglages META/GAME, formatClock
    types.ts                  vues envoyées aux clients (jamais la vérité)
    protocol.ts               événements Socket.IO + GameAction (union typée)
    content/                  ★ CONTENU DATA-DRIVEN ★
      character.ts            teintes, coiffures, couleurs, tenues, validation
      villa.ts                pièces, portes, mobilier, spawns → grille
      objects.ts              types d’objets (tags + useEffect)
      secrets.ts              secrets (cibles, objets confiés, mobiles, graines)
      roles.ts                rôles d’enquête (affinités, outils)
      events.ts               types de faits + règles d’événements (conditions/effets)
      scenarios.ts            familles de scénarios, motifs de semelles

  server/
    index.ts / app.ts         assemblage HTTP + Socket.IO
    util.ts                   ids, codes, RNG déterministe, UserError
    meta/                     ── META GAME ──
      db.ts                   schéma SQLite
      auth.ts                 comptes, scrypt, sessions à jeton
      profiles.ts             personnage + statistiques
      presence.ts             OFFLINE / ONLINE / IN_LOBBY / IN_GAME
      friends.ts              recherche, demandes, amis
      notifications.ts        notifications persistées + push temps réel
      lobbies.ts              salons, codes, ready, hôte, invitations, lancement, cycle de vie
    game/                     ── GAME ──
      GameInstance.ts         simulation, perception, vues filtrées, chat, diffusion
      state.ts                types de la VÉRITÉ (joueurs, objets, traces, corps, relations…)
      director.ts             graines : objets, secrets, identités physiques
      actions.ts              interactions physiques génériques + opportunité/passage à l’acte
      relationships.ts        relations, historique social, trahisons
      investigation.ts        affaire, rôles dynamiques, outils, témoignages, vote, épilogue
      events/engine.ts        moteur de règles générique
      pathfinding.ts          portes entre pièces (ligne de vue)

  client/
    store.ts                  état client (Zustand) + abonnements socket
    net/                      api REST, socket + call() typé
    three/                    ★ RENDU 3D ★
      character3d.ts          personnage procédural animé (marche, attente, mort)
      villa3d.ts              villa générée depuis le plan : sols, murs instanciés, plafonds, portes,
                              fenêtres, mobilier, lampes par pièce, toit (vue du menu)
      GameView3D.ts           scène de jeu : caméra 3e/1re personne avec collision murs, souris,
                              déplacements relatifs à la caméra, interpolation, pluie, éclairs, coupure + lampes torches
      sprites.ts              icônes d'objets et étiquettes de nom
    game/intro/               cinématique d'arrivée (scène, caméra, véhicule, personnages assis, son,
                              textes, chargement masqué) — voir docs/INTRO_CINEMATIC.md
    render/                   avatar SVG (portraits) + plan 2D (touche M)
    ui/                       home, auth, character-creation, profile, friends, servers,
                              lobby, settings, game, investigation, common
tests/
  engine.test.ts              règles du monde, boucle complète, relations, traces
  intro.test.ts               cinématique : véhicules, places, chronologie, synchro 2/4/5/8 joueurs, composition figée
  multiplayer.test.ts         4 clients réels : lobby, sync, chat privé, reconnexion, amis
```

META et GAME sont séparés : `meta/lobbies.ts` est le **seul** point de contact (il crée une `GameInstance` et relaie ses émissions). Une partie ne connaît ni les comptes ni la base.

## 3. Serveur autoritaire

```
Client : demande          →  socket.emit('game:action', {type:'take', objectId}, ack)
Serveur : valide          →  portée, propriété, phase, permissions, état du monde
Serveur : applique        →  modifie l’état
Serveur : journalise      →  truth.push(TRUTH_EVENT) → moteur d’événements
Serveur : perception      →  témoins capables de voir/entendre → connaissances
Serveur : diffuse         →  à chaque joueur SA vue (game:full si modifiée, sinon game:snapshot)
```

Le client n’envoie **que des intentions** : direction de déplacement (`game:input`, bornée), actions typées. Positions, inventaires, relations, preuves, résultats, état du lobby et lancement sont décidés par le serveur. Le déplacement est simulé à 20 Hz avec collisions (murs, mobilier, portes verrouillées) ; les vues partent à 12 Hz et le client interpole.

### Filtrage vérité → vue (`GameInstance.buildSelfView`)
- joueurs : position seulement si **même pièce + visible** (lumière pendant les coupures), ou **allié** (position partagée) ; les morts et l’épilogue passent en spectateur ;
- objets : au sol dans votre pièce (si vous voyez), ou cachés **que vous avez trouvés** ;
- traces : visibles à l’œil nu dans votre pièce, ou révélées par **votre** inspection ;
- inventaire : le vôtre (+ poches des partenaires de pacte) ;
- connaissances, rôle, secret : les vôtres ; chat : canaux auxquels vous appartenez.

Un test vérifie que la vue d’un joueur ne contient ni le secret ni l’empreinte d’un autre.

## 4. Protocole (extrait — `shared/protocol.ts`)

- Requête/réponse (ack `{ok,data}|{ok:false,error}`) : `friends:*`, `notifications:*`, `invite:respond`, `servers:list`, `lobby:create|join|leave|ready|kick|settings|close|start|invite|chat`, `game:action`, `game:chat`, `game:leave`.
- Flux : `game:input` (sans ack).
- Poussées serveur : `session:state`, `lobby:state`, `lobby:intro`, `lobby:intro-state` (cinématique, voir `docs/INTRO_CINEMATIC.md`), `notification`, `friends:changed`, `game:full`, `game:snapshot`, `game:ended`.
- REST : `/api/auth/register|login|logout`, `/api/me`, `PUT /api/character`, `/api/profile/:id`, `/api/history`, `/api/health`.

Les erreurs métier lèvent `UserError` (message affiché tel quel) ; toute autre exception est journalisée et renvoyée comme « Erreur serveur inattendue ».

## 5. Étendre le jeu sans toucher au moteur

| Je veux ajouter… | Fichier | Moteur à modifier ? |
|---|---|---|
| une coiffure / tenue / teinte | `content/character.ts` | non |
| une pièce, une porte, un meuble / une cachette | `content/villa.ts` | non |
| un objet avec des tags existants | `content/objects.ts` | non |
| un secret (cible, objet confié, mobile) | `content/secrets.ts` | non |
| un événement émergent | `content/events.ts` (règle) | non, si conditions/effets existants |
| un rôle avec des outils existants | `content/roles.ts` | non |
| une nouvelle condition / un nouvel effet | `events/engine.ts` (`CONDITIONS` / `EFFECTS`) | 1 handler |
| un nouvel outil de rôle | `investigation.ts` (`runTool`) | 1 case |
| un nouvel usage d’objet | `actions.ts` (`use`) | 1 case `useEffect` |

## 6. Qualité & vérification

- `npm run typecheck` : strict, `noUnusedLocals`.
- `npm test` : 12 tests — dont la boucle complète arme → opportunité → meurtre → lavage → découverte → rôles → autopsie → témoignage mensonger détecté → partage → vote → épilogue, et un parcours multijoueur réel à 4 clients (code privé, permissions d’hôte, sync des positions, chat privé non diffusé, actions invalides rejetées, déconnexion/reconnexion).
- Vérifié manuellement dans Chromium (Playwright) : inscription, création de personnage, menu, serveurs, lobby, transition, partie complète jusqu’à l’épilogue et retour au lobby, sans erreur JS.

## 7. Limites connues (voir backlog)

- Une partie vit en mémoire : un redémarrage du serveur la perd (les comptes/amis/historique sont persistés).
- Un seul processus serveur (pas de répartition horizontale des parties).
- Un seul meurtre par partie (`maxMurders = 1`).
- Pas de pathfinding/clic-pour-aller ; contrôles clavier + souris (mobile non optimisé).
- Personnages en primitives (style « figurine ») : à remplacer par des modèles riggés (glTF) sans changer les données.
