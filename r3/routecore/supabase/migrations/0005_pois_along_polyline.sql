-- RouteCore Platform — corridor POI sur la vraie géométrie routière.
-- Lève la LIMITATION documentée de pois_along_route (0003) : le client passe
-- désormais la polyline réelle (OSRM) en jsonb [[lat,lng], ...] et le couloir
-- suit la route, plus le segment droit origine->destination.

create or replace function pois_along_polyline(
  polyline jsonb,
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
  with line as (
    select st_makeline(
      array(
        select st_setsrid(
          -- jsonb est [lat, lng] (format app) ; st_makepoint veut (lng, lat).
          st_makepoint((pt->>1)::double precision, (pt->>0)::double precision),
          4326
        )
        from jsonb_array_elements(polyline) as pt
      )
    )::geography as geom
  )
  select
    p.id,
    p.name,
    c.slug,
    st_y(p.location::geometry),
    st_x(p.location::geometry),
    st_distance(p.location, line.geom),
    p.is_sponsored
  from pois p
  join poi_categories c on c.id = p.category_id
  cross join line
  where p.is_verified
    and st_dwithin(p.location, line.geom, corridor_meters)
    and (category_slugs is null or c.slug = any(category_slugs))
  order by 6 asc;
$$;
