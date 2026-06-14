-- RouteCore Platform — partage de trajet en direct (« ETA partagée »)
--
-- SÉCURITÉ : l'accès se fait STRICTEMENT par token, via des fonctions
-- SECURITY DEFINER. L'accès direct à la table est REFUSÉ (RLS activée sans
-- politique permissive + REVOKE). Chaque fonction filtre `token = p_token`
-- exact -> aucune énumération, aucune lecture/écriture des partages d'autrui.
-- La table n'est PAS publiée en Realtime (pas de fan-out d'informations) : le
-- viewer interroge get_trip_share() en polling. Le token (≥ 16 octets
-- aléatoires, fourni par le client) est la capacité, transmis via le lien.
--
-- Limite assumée : create_trip_share est ouvert au rôle anon (app sans
-- compte) -> risque de spam d'insertion à mitiger côté edge (rate-limit) ;
-- les lignes expirent par défaut en 6 h. Le DURCISSEMENT authentifié
-- (owner_id = auth.uid()) reste possible en restreignant les GRANT.

create table trip_shares (
  id uuid primary key default uuid_generate_v4(),
  token text not null unique,
  owner_id uuid references auth.users(id) on delete cascade,
  origin_label text,
  destination_label text,
  dest_lat double precision,
  dest_lng double precision,
  last_lat double precision,
  last_lng double precision,
  eta_epoch_ms bigint,
  remaining_meters double precision,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '6 hours')
);

create unique index trip_shares_token_idx on trip_shares(token);

-- RLS activée SANS politique permissive : aucun accès direct par PostgREST.
alter table trip_shares enable row level security;
revoke all on trip_shares from anon, authenticated;

-- Lecture par token EXACT, uniquement tant que le partage est vivant.
create or replace function get_trip_share(p_token text)
returns table (
  token text,
  origin_label text,
  destination_label text,
  dest_lat double precision,
  dest_lng double precision,
  last_lat double precision,
  last_lng double precision,
  eta_epoch_ms bigint,
  remaining_meters double precision,
  active boolean
)
language sql security definer set search_path = public as $$
  select token, origin_label, destination_label, dest_lat, dest_lng,
         last_lat, last_lng, eta_epoch_ms, remaining_meters, active
  from trip_shares
  where token = p_token and active and expires_at > now();
$$;

-- Création (token aléatoire fourni par le client).
create or replace function create_trip_share(
  p_token text,
  p_origin_label text,
  p_destination_label text,
  p_dest_lat double precision,
  p_dest_lng double precision
) returns void
language sql security definer set search_path = public as $$
  insert into trip_shares (token, origin_label, destination_label,
                           dest_lat, dest_lng)
  values (p_token, p_origin_label, p_destination_label, p_dest_lat, p_dest_lng);
$$;

-- MAJ position/ETA par token (colonnes bornées : ni token, ni owner_id, ni
-- expires_at ne sont modifiables par le client).
create or replace function update_trip_progress(
  p_token text,
  p_lat double precision,
  p_lng double precision,
  p_eta_epoch_ms bigint,
  p_remaining double precision
) returns void
language sql security definer set search_path = public as $$
  update trip_shares
     set last_lat = p_lat, last_lng = p_lng,
         eta_epoch_ms = p_eta_epoch_ms, remaining_meters = p_remaining,
         updated_at = now()
   where token = p_token and active and expires_at > now();
$$;

-- Clôture par token.
create or replace function end_trip_share(p_token text) returns void
language sql security definer set search_path = public as $$
  update trip_shares set active = false, updated_at = now()
   where token = p_token;
$$;

-- N'exposer QUE les RPC token-scoped au client (jamais la table).
revoke all on function get_trip_share(text) from public;
revoke all on function create_trip_share(text, text, text, double precision, double precision) from public;
revoke all on function update_trip_progress(text, double precision, double precision, bigint, double precision) from public;
revoke all on function end_trip_share(text) from public;
grant execute on function get_trip_share(text) to anon, authenticated;
grant execute on function create_trip_share(text, text, text, double precision, double precision) to anon, authenticated;
grant execute on function update_trip_progress(text, double precision, double precision, bigint, double precision) to anon, authenticated;
grant execute on function end_trip_share(text) to anon, authenticated;
