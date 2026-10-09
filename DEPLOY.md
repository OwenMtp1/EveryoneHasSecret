# Mettre EVERYONE HAS A SECRET en ligne

Un seul processus Node sert tout : l’API, le temps réel (WebSocket) et le jeu compilé.
Il suffit donc d’un hébergeur capable de lancer `npm start` et d’accepter les WebSockets.

## Option 1 — Render (le plus simple, gratuit pour tester)

1. Le code doit être sur la branche que Render déploiera (par défaut `main`) : fusionner la branche de travail dans `main`, ou choisir la branche dans Render à l’étape 4.
2. Créer un compte sur https://render.com et connecter GitHub.
3. **New → Blueprint** → sélectionner le dépôt `EveryoneHasSecret`. Render lit `render.yaml` (build, démarrage, santé).
4. Valider. Au bout de quelques minutes : une adresse du type `https://everyone-has-a-secret.onrender.com`.
5. Partager ce lien avec vos amis : chacun crée son compte, l’un crée une partie, les autres rejoignent avec le code.

6. **Comptes persistants (indispensable)** : suivre [docs/SUPABASE.md](docs/SUPABASE.md) puis renseigner dans
   *Environment* : `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `DATABASE_URL` (et `SUPABASE_JWT_SECRET` pour un projet « legacy »).
   Sans cela, l’offre gratuite efface la base à chaque mise en veille : c’était la cause des comptes à recréer.

Limites de l’offre gratuite :
- le serveur **s’endort après 15 min sans visite** : le premier chargement suivant prend ~1 min (le jeu affiche
  « Le serveur se réveille… » et garde la session ouverte) ;
- une partie en cours est perdue si le serveur redémarre (les comptes, amis et historique sont dans Supabase).

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

Voir le tableau du [README](README.md#variables-denvironnement). Secrets : `DATABASE_URL`, `SUPABASE_JWT_SECRET`
(jamais dans le dépôt). Publiques : `SUPABASE_URL`, `SUPABASE_ANON_KEY`.

## À savoir avant une ouverture publique
- Les 40 personnages viennent de Microsoft Rocketbox (licence MIT, attribution dans `public/characters/LICENSE-ROCKETBOX.txt`).
  La musique est une composition procédurale originale. Les anciens modèles d’exemple à licence incertaine ont été retirés.
- Une partie en cours vit en mémoire : un redémarrage du serveur la termine.
- Node.js ≥ 22.5 requis.
- Le service d’e-mails intégré de Supabase est limité : configurer un SMTP pour l’inscription de nombreux joueurs.
