# EVERYONE HAS A SECRET

> Les joueurs créent l’histoire. La villa garde la vérité.

Jeu social narratif multijoueur à événements émergents. Prototype jouable (V0.1) : compte → personnage → lobby → nuit à la Villa Beaumont → drame → enquête à rôles asymétriques → accusation → épilogue qui révèle la vérité → on rejoue.

## Démarrer

Prérequis : **Node.js ≥ 22.5** (utilise le SQLite intégré `node:sqlite`, aucune dépendance native).

```bash
npm install
npm run dev          # serveur (3001) + client Vite (5173) → http://localhost:5173
```

Production locale (un seul processus sert l’API, le temps réel et le client compilé) :

```bash
npm run build
npm start            # → http://localhost:3001
```

Le jeu se joue uniquement entre joueurs humains (minimum 2, idéal 4 à 6). Pour tester seul : une fenêtre privée par joueur.

### Variables d’environnement

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT` | `3001` | Port du serveur |
| `EHAS_DB` | `data/ehas.sqlite` | Fichier SQLite (`:memory:` possible) |
| `EHAS_TIME_SCALE` | `1` | < 1 accélère toute la nuit (ex. `0.2` pour tester une partie en ~3 min) |
| `EHAS_TRANSITION_MS` | `20000` | Durée de la cinématique d'arrivée avant la villa (15–25 s conseillé) |

### Scripts

| Commande | Effet |
|---|---|
| `npm run dev` | Serveur (rechargement auto) + client |
| `npm run build` | Compile le client dans `dist/client` |
| `npm start` | Lance le serveur de production |
| `npm run typecheck` | Vérification TypeScript (client + serveur + tests) |
| `npm test` | Tests moteur + test d’intégration multijoueur (4 clients Socket.IO réels) |

## Mettre en ligne

Voir [DEPLOY.md](DEPLOY.md) : Render en quelques clics (`render.yaml`), Docker (`Dockerfile`) ou serveur personnel.

## Contrôles en partie

Le jeu est en **3D** dans le navigateur (Three.js).

**Chat vocal** : bouton 🎙 en haut (micro coupé/ouvert avec `N`) — on n’entend que les joueurs qu’on voit.

`ZQSD` / `WASD` / flèches : se déplacer (relatif à la caméra) · **souris** : cliquer dans la vue pour orienter la caméra (`Échap` libère le pointeur), molette pour la distance · **`V`** : troisième ↔ première personne · `E` : interagir · `Entrée` : chat · `1`–`4` : menus (tiroir) · `Échap` : fermer · `M` : plan 2D de la villa · maintenir **Mon secret** pour le relire.

## Documentation

- [GAME_DESIGN.md](GAME_DESIGN.md) — vision, boucle de jeu, règles de la V1
- [ARCHITECTURE.md](ARCHITECTURE.md) — audit, stack, organisation, flux serveur autoritaire, comment étendre
- [GAME_BACKLOG.md](GAME_BACKLOG.md) — mémoire du projet : tout ce qui est fait et tout ce qui reste (P0 → P3)
- Systèmes : [personnage](docs/CHARACTER_SYSTEM.md) · [social](docs/SOCIAL_SYSTEM.md) · [événements](docs/EVENT_SYSTEM.md) · [preuves](docs/EVIDENCE_SYSTEM.md) · [scénarios](docs/SCENARIO_SYSTEM.md)

Le nom du jeu est centralisé dans `src/shared/config.ts` (`GAME_NAME`).
