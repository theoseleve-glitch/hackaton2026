-- RouteCore Platform — SQL helper functions

-- 1) nearby_pois: verified POIs within radius, optional category filter
create or replace function nearby_pois(
  lat double precision,
  lng double precision,
  radius_meters double precision default 5000,
  category_slugs text[] default null
)
returns table (
  poi_id uuid,
  name text,
  category_slug text,
  latitude double precision,
  longitude double precision,
  distance_meters double precision,
  is_sponsored boolean
)
language sql stable security invoker as $$
  select
    p.id,
    p.name,
    c.slug,
    st_y(p.location::geometry),
    st_x(p.location::geometry),
    st_distance(p.location, st_setsrid(st_makepoint(lng, lat), 4326)::geography),
    p.is_sponsored
  from pois p
  join poi_categories c on c.id = p.category_id
  where p.is_verified
    and st_dwithin(p.location, st_setsrid(st_makepoint(lng, lat), 4326)::geography, radius_meters)
    and (category_slugs is null or c.slug = any(category_slugs))
  order by 6 asc;
$$;

-- 2) pois_along_route — MVP version.
-- LIMITATION (documented): instead of true distance-to-polyline, we use the
-- corridor around the straight origin->destination segment, expanded by
-- corridor_meters. Good enough for MVP; replace by passing the real route
-- linestring (st_linefromencodedpolyline) later. See docs/ARCHITECTURE.md.
create or replace function pois_along_route(
  origin_lat double precision,
  origin_lng double precision,
  dest_lat double precision,
  dest_lng double precision,
  corridor_meters double precision default 3000,
  category_slugs text[] default null
)
returns table (
  poi_id uuid,
  name text,
  category_slug text,
  latitude double precision,
  longitude double precision,
  distance_from_route_meters double precision,
  is_sponsored boolean
)
language sql stable security invoker as $$
  with seg as (
    select st_makeline(
      st_setsrid(st_makepoint(origin_lng, origin_lat), 4326),
      st_setsrid(st_makepoint(dest_lng, dest_lat), 4326)
    )::geography as line
  )
  select
    p.id,
    p.name,
    c.slug,
    st_y(p.location::geometry),
    st_x(p.location::geometry),
    st_distance(p.location, seg.line),
    p.is_sponsored
  from pois p
  join poi_categories c on c.id = p.category_id
  cross join seg
  where p.is_verified
    and st_dwithin(p.location, seg.line, corridor_meters)
    and (category_slugs is null or c.slug = any(category_slugs))
  order by 6 asc;
$$;

-- 3) create_trip
create or replace function create_trip(
  origin_lat double precision,
  origin_lng double precision,
  dest_lat double precision,
  dest_lng double precision,
  origin_label text default null,
  destination_label text default null,
  p_product_context product_context default 'common'
)
returns uuid
language plpgsql security invoker as $$
declare new_id uuid;
begin
  insert into trips (user_id, origin, destination, origin_label, destination_label, product_context, status)
  values (
    auth.uid(),
    st_setsrid(st_makepoint(origin_lng, origin_lat), 4326)::geography,
    st_setsrid(st_makepoint(dest_lng, dest_lat), 4326)::geography,
    origin_label, destination_label, p_product_context, 'planned'
  )
  returning id into new_id;
  return new_id;
end; $$;

-- 4) add_gps_track_point
create or replace function add_gps_track_point(
  p_trip_id uuid,
  lat double precision,
  lng double precision,
  p_speed_mps double precision default null,
  p_accuracy_meters double precision default null,
  p_altitude_meters double precision default null,
  p_heading double precision default null,
  p_recorded_at timestamptz default now()
)
returns uuid
language plpgsql security invoker as $$
declare new_id uuid;
begin
  insert into gps_track_points (trip_id, user_id, location, speed_mps, accuracy_meters, altitude_meters, heading, recorded_at)
  values (
    p_trip_id, auth.uid(),
    st_setsrid(st_makepoint(lng, lat), 4326)::geography,
    p_speed_mps, p_accuracy_meters, p_altitude_meters, p_heading, p_recorded_at
  )
  returning id into new_id;
  return new_id;
end; $$;
