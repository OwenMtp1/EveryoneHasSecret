# EVERYONE HAS A SECRET

> Les joueurs créent l’histoire. La villa garde la vérité.

Jeu d’enquête multijoueur en 3D dans le navigateur (3 à 8 joueurs, uniquement humains). Un groupe d’amis rentre à la
villa et découvre le corps d’un des leurs. **L’un des joueurs est le meurtrier.** Chacun a un secret. On fouille,
on déverrouille, on recoupe les alibis, on accuse, on vote — et chaque opposition officielle a un prix.

## Démarrer

Prérequis : **Node.js ≥ 22.5**.

```bash
npm install
npm run dev          # serveur (3001) + client Vite (5173) → http://localhost:5173
```

Production (un seul processus sert l’API, le temps réel et le client compilé) :

```bash
npm run build
npm start            # → http://localhost:3001
```

Sans configuration, les comptes sont **locaux** (SQLite, `data/ehas.sqlite`). En ligne, utilisez **Supabase**
pour des comptes qui ne disparaissent jamais : [docs/SUPABASE.md](docs/SUPABASE.md).

### Variables d’environnement

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT` | `3001` | Port du serveur |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | — | Comptes Supabase (clé anon publique) |
| `SUPABASE_JWT_SECRET` | — | Seulement projets Supabase « legacy » (sinon JWKS) — **secret** |
| `DATABASE_URL` | — | Postgres Supabase (pooler, port 6543) — **secret** |
| `EHAS_DB` | `data/ehas.sqlite` | Fichier SQLite du mode local |
| `EHAS_ALLOWED_ORIGINS` | — | Origines supplémentaires autorisées pour le temps réel |
| `EHAS_TIME_SCALE` | `1` | < 1 accélère toute la nuit (tests) |
| `EHAS_TRANSITION_MS` | `20000` | Durée de la cinématique d’arrivée |
| `EHAS_LOAD_TIMEOUT_MS` | `30000` | Attente maximale du chargement de tous les joueurs |
| `EHAS_AUTH_RATE_PER_MIN` | `20` | Tentatives d’authentification par minute et par IP |

Un fichier `.env` (non versionné, modèle : `.env.example`) est lu au démarrage.

### Scripts

| Commande | Effet |
|---|---|
| `npm run dev` | Serveur (rechargement auto) + client |
| `npm run build` | Compile le client dans `dist/client` |
| `npm start` | Serveur de production |
| `npm run typecheck` | TypeScript strict (client, serveur, tests) |
| `npm test` | 79 tests : règles et simulations des 3 scénarios (3–8 joueurs), villa, cinématique, multijoueur réel, Supabase/RLS (Postgres en mémoire), audio |
| `node --import tsx scripts/e2e-playthrough.ts` | Partie complète dans un vrai navigateur (voir l’en-tête du script) |
| `node --import tsx scripts/bench-server.ts` | Mesure de charge du serveur (8 joueurs) |

## Contrôles en partie

`ZQSD` / `WASD` / flèches : se déplacer · `Maj` : courir · souris : orienter la caméra (clic pour verrouiller) ·
`V` : 1re / 3e personne · **`E` : action principale sur la cible visée** · `F` : autres actions sur cette cible ·
`1` dossier · `2` inventaire · `3` enquête · `4` relations · `Entrée` : chat · `M` : plan · `Échap` : menu pause
(reprendre, dossier, volumes musique / effets, quitter). Chat vocal de proximité : bouton 🎙 (`N` coupe le micro).

## Mettre en ligne

[DEPLOY.md](DEPLOY.md) (Render, Docker, serveur personnel) et [docs/SUPABASE.md](docs/SUPABASE.md) (comptes persistants).

## Documentation

- [GAME_DESIGN.md](GAME_DESIGN.md) — règles : camps, scénarios, preuves, opposition officielle, votes, victoire
- [ARCHITECTURE.md](ARCHITECTURE.md) — stack, organisation du code, serveur autoritaire, sécurité
- [docs/VALIDATION.md](docs/VALIDATION.md) — **rapport de validation** : ce qui est testé, ce qui reste à vérifier, inventaire des objets
- [docs/SUPABASE.md](docs/SUPABASE.md) · [docs/AUDIO.md](docs/AUDIO.md) · [docs/INTRO_CINEMATIC.md](docs/INTRO_CINEMATIC.md) · [public/characters/README.md](public/characters/README.md)
- [GAME_BACKLOG.md](GAME_BACKLOG.md) — historique et suite
