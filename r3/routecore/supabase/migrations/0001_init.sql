-- RouteCore Platform — initial schema
-- Apply with: supabase db push  (or psql -f) — see docs/BACKEND_SETUP.md

create extension if not exists postgis;
create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type product_context as enum ('common', 'terroir', 'ecodrive');
create type trip_status as enum ('draft', 'planned', 'active', 'completed', 'cancelled');
create type route_mode as enum ('fastest', 'shortest', 'eco', 'discovery');
create type favorite_target as enum ('poi', 'route', 'trip');
create type app_role as enum ('user', 'admin', 'partner', 'organization_manager');

-- ---------------------------------------------------------------------------
-- profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  preferred_product_mode product_context,
  privacy_consent_accepted boolean not null default false,
  location_consent_accepted boolean not null default false,
  role app_role not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- auto-create a profile on signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

create or replace function is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

-- ---------------------------------------------------------------------------
-- partner_organizations
-- ---------------------------------------------------------------------------
create table partner_organizations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  kind text not null default 'other', -- tourism_office / region / company / insurer / other
  contact_email text,
  product_context product_context not null default 'common',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- poi_categories
-- ---------------------------------------------------------------------------
create table poi_categories (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text not null unique,
  parent_category_id uuid references poi_categories(id),
  product_context product_context not null default 'common',
  icon_name text
);

-- ---------------------------------------------------------------------------
-- pois
-- ---------------------------------------------------------------------------
create table pois (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  category_id uuid not null references poi_categories(id),
  location geography(Point, 4326) not null,
  address text,
  city text,
  region text,
  country text not null default 'FR',
  phone text,
  website_url text,
  image_url text,
  opening_hours jsonb,
  tags text[] not null default '{}',
  source text not null default 'manual',
  product_context product_context not null default 'common',
  is_verified boolean not null default false,
  is_sponsored boolean not null default false,
  partner_organization_id uuid references partner_organizations(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index pois_location_idx on pois using gist (location);
create index pois_category_idx on pois (category_id);
create index pois_product_context_idx on pois (product_context);

-- ---------------------------------------------------------------------------
-- sponsored_placements (no payment logic — placement metadata only)
-- ---------------------------------------------------------------------------
create table sponsored_placements (
  id uuid primary key default uuid_generate_v4(),
  poi_id uuid not null references pois(id) on delete cascade,
  partner_organization_id uuid references partner_organizations(id),
  rank_boost numeric not null default 0,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index sponsored_placements_poi_idx on sponsored_placements (poi_id);

-- ---------------------------------------------------------------------------
-- trips
-- ---------------------------------------------------------------------------
create table trips (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  origin_label text,
  destination_label text,
  origin geography(Point, 4326) not null,
  destination geography(Point, 4326) not null,
  selected_route_id uuid,
  status trip_status not null default 'draft',
  product_context product_context not null default 'common',
  created_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz
);
create index trips_user_idx on trips (user_id);

-- ---------------------------------------------------------------------------
-- route_options
-- ---------------------------------------------------------------------------
create table route_options (
  id uuid primary key default uuid_generate_v4(),
  trip_id uuid references trips(id) on delete cascade,
  origin geography(Point, 4326) not null,
  destination geography(Point, 4326) not null,
  polyline text not null, -- encoded polyline (provider format documented in metadata)
  distance_meters integer not null,
  duration_seconds integer not null,
  estimated_fuel_liters numeric,
  estimated_co2_kg numeric,
  route_mode route_mode not null,
  provider text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index route_options_trip_idx on route_options (trip_id);

alter table trips
  add constraint trips_selected_route_fk
  foreign key (selected_route_id) references route_options(id);

-- ---------------------------------------------------------------------------
-- gps_track_points
-- ---------------------------------------------------------------------------
create table gps_track_points (
  id uuid primary key default uuid_generate_v4(),
  trip_id uuid not null references trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  location geography(Point, 4326) not null,
  speed_mps numeric,
  accuracy_meters numeric,
  altitude_meters numeric,
  heading numeric,
  recorded_at timestamptz not null
);
create index gps_track_points_trip_idx on gps_track_points (trip_id);

-- ---------------------------------------------------------------------------
-- favorites
-- ---------------------------------------------------------------------------
create table favorites (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  target_type favorite_target not null,
  target_id uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, target_type, target_id)
);
create index favorites_user_idx on favorites (user_id);

-- ---------------------------------------------------------------------------
-- eco_scores
-- ---------------------------------------------------------------------------
create table eco_scores (
  id uuid primary key default uuid_generate_v4(),
  trip_id uuid not null references trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  score_overall integer not null check (score_overall between 0 and 100),
  score_acceleration integer,
  score_braking integer,
  score_speed_stability integer,
  score_speed_limit integer,
  estimated_fuel_saved_liters numeric,
  estimated_co2_saved_kg numeric,
  advice_text text,
  metrics jsonb not null default '{}', -- harshAccelerationCount, harshBrakingCount, averageSpeed, speedVariance, ...
  created_at timestamptz not null default now()
);
create index eco_scores_trip_idx on eco_scores (trip_id);
create index eco_scores_user_idx on eco_scores (user_id);

-- ---------------------------------------------------------------------------
-- analytics_events
-- ---------------------------------------------------------------------------
create table analytics_events (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete set null,
  event_name text not null,
  product_context product_context not null default 'common',
  properties jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index analytics_events_name_idx on analytics_events (event_name);
