-- RouteCore — security fixes from the r3 audit
-- 1) privilege escalation, 2) cross-user inserts via trip_id,
-- 3) orphan route_options, 4) explicit WITH CHECK on admin policies.

-- ---------------------------------------------------------------------------
-- 1) Users must not be able to change their own role (profiles.role).
-- RLS cannot restrict columns, so use column-level privileges: revoke the
-- blanket UPDATE and re-grant only the user-editable columns.
-- ---------------------------------------------------------------------------
revoke update on table profiles from authenticated;
revoke update on table profiles from anon;
-- email excluded on purpose: it is synced from auth.users by the signup
-- trigger and must not drift via client updates.
grant update (display_name, preferred_product_mode,
              privacy_consent_accepted, location_consent_accepted)
  on table profiles to authenticated;

-- Explicit WITH CHECK so an owner cannot re-point their row's id.
drop policy "profiles_update_own" on profiles;
create policy "profiles_update_own" on profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- 2) gps_track_points / eco_scores: inserting requires owning the parent trip
-- (before: only user_id was checked, allowing rows attached to another
-- user's trip).
-- ---------------------------------------------------------------------------
drop policy "gps_insert_own" on gps_track_points;
create policy "gps_insert_own" on gps_track_points for insert
  with check (
    auth.uid() = user_id
    and exists (select 1 from trips t where t.id = trip_id and t.user_id = auth.uid())
  );

drop policy "eco_scores_insert_own" on eco_scores;
create policy "eco_scores_insert_own" on eco_scores for insert
  with check (
    auth.uid() = user_id
    and exists (select 1 from trips t where t.id = trip_id and t.user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 3) route_options: no orphan rows (trip_id null) readable/insertable by
-- every authenticated user. Options are always attached to an owned trip.
-- ---------------------------------------------------------------------------
drop policy "route_options_select_own" on route_options;
drop policy "route_options_insert_own" on route_options;
create policy "route_options_select_own" on route_options for select
  using (exists (select 1 from trips t where t.id = trip_id and t.user_id = auth.uid()));
create policy "route_options_insert_own" on route_options for insert
  with check (
    trip_id is not null
    and exists (select 1 from trips t where t.id = trip_id and t.user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 4) Admin policies: make WITH CHECK explicit (FOR ALL/UPDATE without
-- WITH CHECK silently reuses USING — fine today, fragile under refactor).
-- ---------------------------------------------------------------------------
drop policy "poi_categories_admin_write" on poi_categories;
create policy "poi_categories_admin_write" on poi_categories for all
  using (is_admin()) with check (is_admin());

drop policy "pois_admin_update" on pois;
create policy "pois_admin_update" on pois for update
  using (is_admin()) with check (is_admin());

drop policy "sponsored_admin_write" on sponsored_placements;
create policy "sponsored_admin_write" on sponsored_placements for all
  using (is_admin()) with check (is_admin());

drop policy "partners_admin_write" on partner_organizations;
create policy "partners_admin_write" on partner_organizations for all
  using (is_admin()) with check (is_admin());
