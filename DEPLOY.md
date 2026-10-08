# Mettre EVERYONE HAS A SECRET en ligne

Un seul processus Node sert tout : l’API, le temps réel (WebSocket) et le jeu compilé.
Il suffit donc d’un hébergeur capable de lancer `npm start` et d’accepter les WebSockets.

## Option 1 — Render (le plus simple, gratuit pour tester)

1. Le code doit être sur la branche que Render déploiera (par défaut `main`) : fusionner la branche de travail dans `main`, ou choisir la branche dans Render à l’étape 4.
2. Créer un compte sur https://render.com et connecter GitHub.
3. **New → Blueprint** → sélectionner le dépôt `EveryoneHasSecret`. Render lit `render.yaml` (build, démarrage, santé).
4. Valider. Au bout de quelques minutes : une adresse du type `https://everyone-has-a-secret.onrender.com`.
5. Partager ce lien avec vos amis : chacun crée son compte, l’un crée une partie, les autres rejoignent avec le code.

Limites de l’offre gratuite :
- le serveur **s’endort après 15 min sans visite** (le premier chargement suivant prend ~1 min) ;
- le disque est **éphémère** : comptes, personnages et amis sont remis à zéro à chaque redéploiement/redémarrage.
  Pour les conserver : offre payante + **Disk** monté sur `/var/data`, et `EHAS_DB=/var/data/ehas.sqlite`.

## Option 2 — Docker (n’importe quel hébergeur : Fly.io, Railway, un VPS…)

```bash
docker build -t ehas .
docker run -d -p 80:3001 -v ehas-data:/app/data --name ehas ehas
```
Le volume `ehas-data` conserve la base (comptes, amis, historique).

## Option 3 — Un serveur à soi (VPS)

```bash
git clone <dépôt> && cd EveryoneHasSecret
npm ci && npm run build
PORT=3001 EHAS_DB=/var/lib/ehas/ehas.sqlite npm start
```
Mettre un reverse proxy (Caddy, Nginx) devant pour le HTTPS, en laissant passer les WebSockets (`/socket.io`).

## Variables d’environnement

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT` | `3001` | Port d’écoute (fourni automatiquement par Render/Fly/Railway) |
| `EHAS_DB` | `data/ehas.sqlite` | Fichier de base de données |
| `EHAS_TIME_SCALE` | `1` | Accélère la nuit (< 1) — tests uniquement |
| `EHAS_TRANSITION_MS` | `6500` | Durée de la transition cinématique |

## À savoir avant une ouverture publique
- Les modèles 3D provisoires (`public/models`) viennent des exemples Three.js (origine Mixamo / Ready Player Me) : licence à valider avant une diffusion publique.
- Une partie en cours vit en mémoire : un redémarrage du serveur la termine (les comptes restent si le disque est persistant).
- Node.js ≥ 22.5 requis (SQLite intégré).
