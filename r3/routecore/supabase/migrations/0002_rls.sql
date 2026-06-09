-- RouteCore Platform — Row Level Security

alter table profiles enable row level security;
alter table poi_categories enable row level security;
alter table pois enable row level security;
alter table sponsored_placements enable row level security;
alter table partner_organizations enable row level security;
alter table trips enable row level security;
alter table route_options enable row level security;
alter table gps_track_points enable row level security;
alter table favorites enable row level security;
alter table eco_scores enable row level security;
alter table analytics_events enable row level security;

-- profiles: owner read/update
create policy "profiles_select_own" on profiles for select using (auth.uid() = id);
create policy "profiles_update_own" on profiles for update using (auth.uid() = id);

-- poi_categories: readable by any authenticated user; admin writes
create policy "poi_categories_select" on poi_categories for select to authenticated using (true);
create policy "poi_categories_admin_write" on poi_categories for all using (is_admin());

-- pois: verified POIs readable by authenticated users; admin full access
create policy "pois_select_verified" on pois for select to authenticated using (is_verified or is_admin());
create policy "pois_admin_write" on pois for insert with check (is_admin());
create policy "pois_admin_update" on pois for update using (is_admin());
create policy "pois_admin_delete" on pois for delete using (is_admin());

-- sponsored placements / partners: readable when active; admin writes
create policy "sponsored_select" on sponsored_placements for select to authenticated using (is_active);
create policy "sponsored_admin_write" on sponsored_placements for all using (is_admin());
create policy "partners_select" on partner_organizations for select to authenticated using (true);
create policy "partners_admin_write" on partner_organizations for all using (is_admin());

-- trips: owner CRUD
create policy "trips_select_own" on trips for select using (auth.uid() = user_id);
create policy "trips_insert_own" on trips for insert with check (auth.uid() = user_id);
create policy "trips_update_own" on trips for update using (auth.uid() = user_id);
create policy "trips_delete_own" on trips for delete using (auth.uid() = user_id);

-- route_options: visible/creatable through the owning trip
create policy "route_options_select_own" on route_options for select
  using (trip_id is null or exists (select 1 from trips t where t.id = trip_id and t.user_id = auth.uid()));
create policy "route_options_insert_own" on route_options for insert
  with check (trip_id is null or exists (select 1 from trips t where t.id = trip_id and t.user_id = auth.uid()));

-- gps_track_points: owner read/insert (no update — track points are immutable)
create policy "gps_select_own" on gps_track_points for select using (auth.uid() = user_id);
create policy "gps_insert_own" on gps_track_points for insert with check (auth.uid() = user_id);
create policy "gps_delete_own" on gps_track_points for delete using (auth.uid() = user_id);

-- favorites: owner CRUD
create policy "favorites_select_own" on favorites for select using (auth.uid() = user_id);
create policy "favorites_insert_own" on favorites for insert with check (auth.uid() = user_id);
create policy "favorites_delete_own" on favorites for delete using (auth.uid() = user_id);

-- eco_scores: owner read; insert by owner (server-side scoring can use service role)
create policy "eco_scores_select_own" on eco_scores for select using (auth.uid() = user_id);
create policy "eco_scores_insert_own" on eco_scores for insert with check (auth.uid() = user_id);

-- analytics_events: insert by authenticated user (own id or anonymous), never readable by clients
create policy "analytics_insert" on analytics_events for insert to authenticated
  with check (user_id is null or user_id = auth.uid());
-- no select policy on purpose: analytics are write-only from the app
