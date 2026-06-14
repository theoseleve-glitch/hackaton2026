-- RouteCore Platform — partage de trajet en direct (« ETA partagée »)
--
-- Un trajet est partageable par TOKEN public non devinable : le destinataire
-- (non authentifié) lit la position et l'ETA en temps réel via Supabase
-- Realtime. Le token fait office de CAPACITÉ d'accès — l'app étant anonyme
-- (pas de comptes), il n'y a pas d'owner authentifié à corréler.
--
-- Modèle de sécurité (assumé pour un déploiement anonyme) :
--   * lecture/écriture gardées par `active AND expires_at > now()` ;
--   * le token aléatoire (≥ 16 octets) est le secret partagé via le lien ;
--   * DURCISSEMENT recommandé en prod : activer l'auth anonyme Supabase et
--     corréler owner_id = auth.uid() sur insert/update (voir politiques en
--     commentaire plus bas).

create table trip_shares (
  id uuid primary key default uuid_generate_v4(),
  token text not null unique,
  owner_id uuid references auth.users(id) on delete cascade, -- null en anonyme
  origin_label text,
  destination_label text,
  dest_lat double precision,
  dest_lng double precision,
  last_lat double precision,
  last_lng double precision,
  eta_epoch_ms bigint,                 -- heure d'arrivée estimée (ms epoch)
  remaining_meters double precision,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '6 hours')
);

create unique index trip_shares_token_idx on trip_shares(token);

alter table trip_shares enable row level security;

-- Lecture publique par token, uniquement tant que le partage est vivant.
create policy "trip_shares_public_read" on trip_shares
  for select using (active and expires_at > now());

-- App anonyme : création/MAJ ouvertes mais bornées à la fenêtre de validité.
-- Le token (non devinable) protège l'accès en écriture côté client.
create policy "trip_shares_anon_insert" on trip_shares
  for insert with check (active and expires_at > now());
create policy "trip_shares_anon_update" on trip_shares
  for update using (active and expires_at > now());

-- DURCISSEMENT (déploiement authentifié) — remplacer les deux politiques
-- ci-dessus par :
--   create policy "trip_shares_owner_insert" on trip_shares
--     for insert with check (auth.uid() = owner_id);
--   create policy "trip_shares_owner_update" on trip_shares
--     for update using (auth.uid() = owner_id);

-- Realtime pour le viewer.
alter publication supabase_realtime add table trip_shares;
