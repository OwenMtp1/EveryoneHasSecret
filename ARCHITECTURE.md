# Architecture — EVERYONE HAS A SECRET

## 1. Stack

| Couche | Choix | Pourquoi |
|---|---|---|
| Langage | **TypeScript** strict partout | types partagés client/serveur (protocole, vues) |
| Serveur | **Node.js 22 + Express + Socket.IO** | temps réel, ack requête/réponse, reconnexion, compression des messages |
| Comptes | **Supabase Auth** (production) ou comptes locaux (développement) | sessions persistantes, récupération de mot de passe, aucun mot de passe stocké par le jeu en mode Supabase |
| Données META | **Supabase Postgres** (`DATABASE_URL`, RLS) ou **SQLite** (`node:sqlite`) | même interface asynchrone `MetaStore` |
| État de partie | **mémoire serveur** (`GameInstance`) | simulation autoritaire 20 Hz, vues filtrées 12 Hz ; résumé persisté en fin de partie |
| Client | **React 19 + Vite + Zustand** | menus, salon, interface de jeu |
| 3D | **Three.js r170** | villa sur 4 niveaux, 40 personnages Rocketbox (MIT), cinématique, photos d’enquête |
| Audio | **Web Audio procédural** | partition d’enquête originale (aucun fichier, aucun droit tiers), effets |
| Tests | `node:test` + `tsx` (+ PGlite, Playwright) | règles, simulations, multijoueur réel, Postgres/RLS, audio, navigateur réel |

## 2. Organisation

```
src/
  shared/                       commun client/serveur — AUCUN contenu d'enquête secret
    config.ts                   nom du jeu, réglages, durées de nuit, horloge
    types.ts / protocol.ts      vues envoyées aux clients et événements Socket.IO (GameAction typée)
    content/
      cast.ts                   40 personnages (identifiant stable, métadonnées visuelles, fibre du vêtement)
      character.ts              personnage de partie à partir du catalogue (+ repli procédural)
      objects.ts                catalogue visuel et générique des objets (tags, capacités, modèles)
      roles.ts                  spécialités d'enquête
      villa.ts / levels.ts      pièces sur 4 niveaux, portes, mobilier, escaliers/échelles, stepMove partagé
      furnishing.ts             ameublement et décoration
      intro.ts / vehicles.ts    cinématique d'arrivée
      events.ts                 types de faits du journal de vérité
  server/
    app.ts                      HTTP + Socket.IO, en-têtes de sécurité, limitation de débit
    meta/
      store.ts                  MetaStore asynchrone : SqliteStore | PostgresStore
      auth.ts                   Supabase (vérification JWT par JWKS/HS256) ou comptes locaux (scrypt)
      profiles, friends, notifications, presence
      lobbies.ts                salons, réservation atomique des personnages, chargement, cinématique, lancement
    game/
      GameInstance.ts           simulation, perception, chat, vues filtrées, diffusion
      actions.ts                interactions physiques (prendre, cacher, fouiller, essuyer, brûler, gants…)
      relationships.ts          relations entre joueurs
      case/                     ★ L'AFFAIRE (serveur uniquement) ★
        scenarios.ts            les 3 scénarios : histoire, mobiles, secrets, documents, pièces décisives
        director.ts             génère la vérité pour les joueurs réels (soirée, alibis, preuves, codes)
        model.ts                types de la vérité (faits, verrous, contenus, emplacements)
        system.ts               phases, lectures/verrous, dossier commun, alibis, opposition officielle,
                                accusations, votes, éliminations, spécialités, épilogue, vues
  client/
    net/auth.ts                 Supabase Auth ou jeton local ; jeton relu à chaque (re)connexion
    store.ts                    état client (aucune vérité) ; restauration de session tolérante aux pannes
    music.ts / musicRouter.ts   musique d'enquête, une seule piste à la fois, fondus
    three/
      cast3d.ts                 personnages du catalogue (chargés à la demande, animations Rocketbox)
      photo.ts                  photos d'enquête rendues avec les VRAIS personnages de la partie
      GameView3D.ts             vue de jeu, ciblage par raycast (E/F), plan de découverte du corps
      villa3d.ts, furnishing3d.ts, objects3d.ts, character3d.ts (repli procédural)
    ui/
      lobby/CharacterGallery    galerie : Disponible / Sélectionné par vous / Indisponible
      game/                     invite d'interaction, dossier, inventaire, vote, pause, épilogue
      investigation/            affaire, dossier commun, alibis, accusation, outils de spécialité
supabase/migrations/            schéma Postgres + politiques RLS
scripts/                        partie automatisée (navigateur réel), mesure de charge, pipeline des personnages
tests/                          engine, villa, intro, multiplayer, supabase, audio
```

## 3. Serveur autoritaire

```
Client : intention   →  game:input (direction bornée, débit limité) / game:action (typée)
Serveur : valide      →  portée, pièce, verrous, camp, phase, délais, limites, droits
Serveur : applique    →  état du monde + journal de vérité
Serveur : perception  →  témoins capables de voir / entendre
Serveur : diffuse     →  à chaque joueur SA vue : complète si modifiée, sinon instantané léger
```

Ce qui ne quitte jamais le serveur : identité du meurtrier et des protecteurs, faits des preuves, codes et mots de
passe, contenus non lus, emplacement des objets non trouvés, souvenirs et secrets des autres. Le client reçoit le
texte d'une pièce **après** l'avoir lue, et les pièces versées au dossier commun. Vérifié par tests (aucun secret, code
ou fait dans les vues, pour les 3 scénarios et 3 à 8 joueurs) et par inspection du bundle client (aucun texte de scénario).

## 4. Sécurité

- Authentification vérifiée côté serveur à chaque requête HTTP et à chaque connexion temps réel ; jetons expirés,
  falsifiés, anonymes ou d'un autre projet refusés.
- Clé `service_role` jamais utilisée ; clé anon publique protégée par la RLS (`supabase/migrations`) ; anonymes sans aucun accès.
- Historique limité aux parties jouées par l'utilisateur. Profils : stats publiques, aucune donnée privée.
- En-têtes : `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, HSTS en production.
- Limitation : authentification (par IP), requêtes avec accusé (par connexion), flux sans accusé (≈60/s), tailles de messages.
- Socket.IO en même origine par défaut (origines supplémentaires explicites). Requêtes forgées : chaque action est revalidée.
- Codes : 3 erreurs → verrouillage de 30 s. Accusations : limitées, espacées, pièce lue obligatoire (sans oracle sur son sens).
- `npm audit` : 0 vulnérabilité (rollup épinglé en 4.59.1).

## 5. Performance

- Simulation 8 joueurs : ~0,03 ms par tick, ~0,2 ms pour construire toutes les vues (`scripts/bench-server.ts`).
- Instantanés sans description des personnages + compression WebSocket au-delà de 1 Ko.
- Client : qualité adaptative (halo, ombres, résolution), niveaux éloignés masqués, lumières du seul niveau du joueur,
  géométries/matériaux partagés entre personnages, chargement des modèles à la demande, envoi des entrées ≤ 30/s.
- Le bundle principal fait ~1,5 Mo (≈ 425 Ko gzip), Three.js compris.

## 6. Étendre le jeu

| Je veux ajouter… | Où |
|---|---|
| un secret d'innocent, un document, une histoire | `server/game/case/scenarios.ts` |
| un scénario complet | `scenarios.ts` (nouvelle entrée `ScenarioDef`) |
| un type d'objet (visuel + capacités) | `shared/content/objects.ts` |
| une nouvelle interaction d'objet | `server/game/case/system.ts` ou `actions.ts` + bouton dans `ui/game/helpers.ts` |
| une pièce, une cachette, un meuble verrouillé | `shared/content/villa.ts` / `furnishing.ts` |
| un personnage | pipeline `scripts/characters/` + `shared/content/cast.ts` |

## 7. Limites connues

Voir [docs/VALIDATION.md](docs/VALIDATION.md), catégorie E.
