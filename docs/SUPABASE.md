# Comptes persistants avec Supabase

## 1. Pourquoi les joueurs devaient recréer leur compte

Diagnostic (vérifié dans le code et la configuration du dépôt) :

1. **Base effacée** — `render.yaml` plaçait la base SQLite dans `/tmp/ehas.sqlite`. Sur l'offre gratuite
   de Render, le disque est éphémère : le serveur s'endort après 15 min sans visite et repart d'un
   disque vierge, et chaque redéploiement aussi. Comptes, sessions, amis et historique disparaissaient :
   le pseudo « n'existait plus », il fallait se réinscrire.
2. **Déconnexion sur panne réseau** — au démarrage, le client supprimait le jeton de session à la
   moindre erreur de `/api/me`, y compris quand le serveur endormi mettait une minute à répondre.
   Corrigé : le client ne se déconnecte plus que sur un refus explicite (HTTP 401) ; sinon il patiente
   (« Le serveur se réveille… ») et réessaie.

Correctif durable : les comptes et les données du jeu vivent dans **Supabase** (Auth + Postgres),
hors du serveur de jeu, qui peut redémarrer ou être redéployé sans rien perdre.

## 2. Architecture

| Élément | Où | Détail |
|---|---|---|
| Inscription, connexion, déconnexion, mot de passe oublié, sessions | **Supabase Auth** (dans le navigateur, `@supabase/supabase-js`) | session conservée dans le navigateur, jeton renouvelé automatiquement ; mots de passe hachés par Supabase |
| Vérification de l'identité | serveur du jeu (`src/server/meta/auth.ts`) | chaque requête HTTP et chaque connexion temps réel présente le jeton d'accès (JWT) ; vérifié par JWKS (clés asymétriques) ou secret HS256 ; émetteur, audience, expiration et rôle contrôlés |
| Profils (pseudo, statistiques), amis, notifications, historique | **Supabase Postgres** (`supabase/migrations/…_init.sql`) | le serveur s'y connecte via `DATABASE_URL` ; RLS activée sur toutes les tables |
| Parties en cours, rôles secrets, preuves | mémoire du serveur de jeu | jamais en base, jamais envoyés au client sans filtrage |

Le navigateur ne reçoit que l'URL du projet et la clé **anon** (publique par conception). La clé
`service_role` n'est utilisée nulle part. Sans Supabase configuré, le serveur fonctionne en **mode local**
(SQLite + comptes par pseudo) : pratique en développement, mais à n'utiliser en ligne qu'avec un disque persistant.

## 3. Étapes dans le tableau de bord Supabase (à faire par le propriétaire du projet)

Je n'ai pas accès à votre compte Supabase : ces étapes ne peuvent pas être faites depuis le dépôt.

1. **Créer le projet** : https://supabase.com/dashboard → *New project* (région proche des joueurs, ex. `eu-west-3` Paris). Notez le mot de passe de la base.
2. **Créer les tables** : *SQL Editor* → *New query* → coller le contenu de
   `supabase/migrations/20261009000000_init.sql` → *Run*. (Ou, avec la CLI : `supabase link` puis `supabase db push`.)
   Vérifier dans *Table Editor* que `profiles`, `friendships`, `notifications`, `game_history`, `game_participants`
   existent avec le badge **RLS enabled**.
3. **Authentification** : *Authentication* →
   - *Sign In / Providers* → **Email** activé. « Confirm email » : recommandé (le jeu gère le message « confirmez votre e-mail »).
   - *URL Configuration* → **Site URL** = l'adresse publique du jeu (ex. `https://everyone-has-a-secret.onrender.com`),
     et ajouter la même adresse dans **Redirect URLs** (nécessaire pour les liens de confirmation et de réinitialisation).
   - *Emails* : le service d'e-mails intégré est limité (quelques e-mails/heure) ; pour plus de joueurs,
     configurer un SMTP (*Authentication → Emails → SMTP Settings*).
4. **Récupérer les valeurs** :
   - *Project Settings → API* (ou *Data API*) : **Project URL** → `SUPABASE_URL` ; clé **anon public** (ou *publishable*) → `SUPABASE_ANON_KEY`.
   - *Project Settings → JWT Keys* : si le projet utilise encore le **Legacy JWT secret** (HS256), le copier dans
     `SUPABASE_JWT_SECRET`. Si le projet utilise les nouvelles clés de signature asymétriques, **ne rien mettre** :
     le serveur vérifie les jetons via `SUPABASE_URL/auth/v1/.well-known/jwks.json`.
   - *Connect* (en haut) → *Connection string* → **Transaction pooler** (port 6543, compatible IPv4, adapté à Render)
     → `DATABASE_URL` (remplacer `[YOUR-PASSWORD]`).

## 4. Variables d'environnement du serveur de jeu

| Variable | Exemple | Secret ? |
|---|---|---|
| `SUPABASE_URL` | `https://abcd1234.supabase.co` | non (public) |
| `SUPABASE_ANON_KEY` | `eyJhbGciOi…` / `sb_publishable_…` | non (public, protégé par la RLS) |
| `SUPABASE_JWT_SECRET` | *(seulement projets « legacy »)* | **oui** |
| `DATABASE_URL` | `postgresql://postgres.abcd1234:MOTDEPASSE@aws-0-eu-west-3.pooler.supabase.com:6543/postgres` | **oui** |
| `EHAS_ALLOWED_ORIGINS` | *(vide)* | non — origines supplémentaires autorisées pour le temps réel, sinon même origine |

Sur Render : *Dashboard → service → Environment* → ajouter ces variables (les secrets n'apparaissent jamais
dans le dépôt), puis *Manual Deploy*. Avec `DATABASE_URL`, la variable `EHAS_DB` n'est plus utilisée.
Le serveur refuse de démarrer avec une configuration incohérente (Supabase Auth sans `DATABASE_URL`, ou l'inverse).

## 5. Vérification après mise en ligne (manuelle)

| Test | Attendu |
|---|---|
| `GET /api/health` | `"storage":"postgres","auth":"supabase"` |
| Créer un compte (e-mail + pseudo + mot de passe) | e-mail de confirmation, puis connexion possible |
| Recharger la page, fermer/rouvrir le navigateur | toujours connecté |
| Se connecter depuis un autre navigateur / téléphone | même pseudo, mêmes amis, même historique |
| Redéployer le serveur sur Render | les comptes sont toujours là |
| Mauvais mot de passe | « E-mail ou mot de passe incorrect. » |
| Même e-mail une 2e fois | « Un compte existe déjà avec cet e-mail… » |
| Pseudo déjà pris | « Ce pseudo est déjà pris. » |
| « Mot de passe oublié ? » | e-mail reçu, le lien ouvre « Nouveau mot de passe », connexion avec le nouveau |
| Laisser l'onglet ouvert plus d'une heure | le jeton est renouvelé automatiquement, la partie continue |

Les mêmes comportements côté serveur sont couverts par `tests/supabase.test.ts` (Postgres réel en mémoire,
migration du dépôt, jetons signés au format Supabase, politiques RLS).
