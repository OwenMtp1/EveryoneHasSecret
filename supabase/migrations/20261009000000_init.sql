-- EVERYONE HAS A SECRET — schéma META sur Supabase Postgres.
--
-- Les comptes (e-mail, mot de passe haché, sessions, récupération) sont gérés par Supabase Auth
-- (schéma auth). Ce fichier crée uniquement les données du jeu, liées à auth.users.
--
-- Accès :
--  * le serveur du jeu se connecte avec DATABASE_URL (rôle propriétaire des tables : RLS contourné,
--    il applique lui-même les autorisations) ;
--  * le navigateur ne détient que la clé « anon » publique : la RLS ci-dessous garantit qu'avec elle,
--    un utilisateur authentifié ne lit/modifie QUE ses propres données, et qu'un anonyme ne lit rien.

-- ───────────────────────── profils ─────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null check (char_length(username) between 3 and 20 and username ~ '^[A-Za-z0-9_.-]+$'),
  games_played integer not null default 0 check (games_played >= 0),
  games_won integer not null default 0 check (games_won >= 0),
  created_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);
create unique index if not exists profiles_username_lower on public.profiles (lower(username));

-- ───────────────────────── amis ─────────────────────────
create table if not exists public.friendships (
  user_a uuid not null references public.profiles (id) on delete cascade,
  user_b uuid not null references public.profiles (id) on delete cascade,
  status text not null check (status in ('pending', 'accepted')),
  requested_by uuid not null references public.profiles (id) on delete cascade,
  created_at bigint not null,
  primary key (user_a, user_b),
  check (user_a < user_b),
  check (requested_by in (user_a, user_b))
);
create index if not exists friendships_user_b on public.friendships (user_b);

-- ───────────────────────── notifications ─────────────────────────
create table if not exists public.notifications (
  id text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  payload jsonb,
  read boolean not null default false,
  created_at bigint not null
);
create index if not exists notifications_user on public.notifications (user_id, created_at desc);

-- ───────────────────────── historique des parties ─────────────────────────
create table if not exists public.game_history (
  id text primary key,
  lobby_name text not null,
  case_type text not null,
  summary text not null,
  players jsonb not null,
  ended_at bigint not null
);
create table if not exists public.game_participants (
  game_id text not null references public.game_history (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (game_id, user_id)
);
create index if not exists game_participants_user on public.game_participants (user_id);

-- ───────────────────────── Row Level Security ─────────────────────────
alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.notifications enable row level security;
alter table public.game_history enable row level security;
alter table public.game_participants enable row level security;

-- Aucun accès anonyme ; les privilèges par défaut de Supabase sont restreints au strict nécessaire.
revoke all on public.profiles, public.friendships, public.notifications, public.game_history, public.game_participants from anon;
revoke all on public.profiles, public.friendships, public.notifications, public.game_history, public.game_participants from authenticated;
grant select on public.profiles, public.friendships, public.notifications, public.game_history, public.game_participants to authenticated;
grant update (read) on public.notifications to authenticated;

-- Profils : chacun lit le sien (les recherches de joueurs passent par le serveur du jeu).
drop policy if exists "profil : lecture du sien" on public.profiles;
create policy "profil : lecture du sien" on public.profiles
  for select to authenticated using (id = (select auth.uid()));

-- Amitiés : visibles par les deux personnes concernées seulement.
drop policy if exists "amis : lecture des siennes" on public.friendships;
create policy "amis : lecture des siennes" on public.friendships
  for select to authenticated using ((select auth.uid()) in (user_a, user_b));

-- Notifications : lecture et marquage « lu » de ses propres notifications.
drop policy if exists "notifications : lecture des siennes" on public.notifications;
create policy "notifications : lecture des siennes" on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "notifications : marquer lues" on public.notifications;
create policy "notifications : marquer lues" on public.notifications
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Historique : seulement les parties auxquelles on a participé.
drop policy if exists "participations : les siennes" on public.game_participants;
create policy "participations : les siennes" on public.game_participants
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "historique : parties jouées" on public.game_history;
create policy "historique : parties jouées" on public.game_history
  for select to authenticated using (
    exists (select 1 from public.game_participants p where p.game_id = id and p.user_id = (select auth.uid()))
  );
