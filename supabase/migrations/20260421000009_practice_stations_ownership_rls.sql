-- ============================================================================
-- Practice Engine — Tier 2 Coaching Collaboration (Phase A)
-- Migration: tighten practice_stations / practice_station_assignments RLS for
-- per-station ownership.
--
-- Rules:
--   - practice_stations:
--       INSERT / DELETE:  block owner (HC/AD or assigned_coach_id) only.
--       UPDATE:           block owner OR station coach_id = auth.uid().
--         - A station coach who is NOT the block owner can only change `name`
--           and `notes` (annotation fields). Structural columns are reserved
--           to the block owner.
--       SELECT:           unchanged (all active team members).
--   - practice_station_assignments: HC/AD or block owner only (these are
--     compositional, analogous to practice_block_players).
-- ============================================================================

-- ─── practice_stations: split policies ───────────────────────────────────────

drop policy if exists "practice_stations_coach_manage" on public.practice_stations;

create policy "practice_stations_insert"
  on public.practice_stations for insert
  with check ( public.can_edit_block(public.practice_stations.block_id) );

create policy "practice_stations_delete"
  on public.practice_stations for delete
  using ( public.can_edit_block(public.practice_stations.block_id) );

-- UPDATE: block owner OR the station's own coach.
create policy "practice_stations_update"
  on public.practice_stations for update
  using (
    public.can_edit_block(public.practice_stations.block_id)
    or public.practice_stations.coach_id = auth.uid()
  )
  with check (
    public.can_edit_block(public.practice_stations.block_id)
    or public.practice_stations.coach_id = auth.uid()
  );

-- ─── BEFORE UPDATE trigger: station coach is annotation-only ─────────────────

create or replace function public.practice_stations_enforce_owner_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
begin
  -- Service role bypasses (web server actions enforce role themselves).
  v_role := coalesce(auth.role(), '');
  if v_role = 'service_role' then
    return new;
  end if;

  -- Block owner (HC/AD or assigned coach of the block) can change anything.
  if public.can_edit_block(new.block_id) then
    return new;
  end if;

  -- Below: caller is the station coach but NOT the block owner. Only name and
  -- notes may differ. Structural / assignment columns are reserved to block
  -- owner.
  if new.block_id        is distinct from old.block_id        then
    raise exception 'Stations cannot move between blocks.';
  end if;
  if new.position        is distinct from old.position        then
    raise exception 'Only block owners can change station position.';
  end if;
  if new.drill_id        is distinct from old.drill_id        then
    raise exception 'Only block owners can change the station drill.';
  end if;
  if new.coach_id        is distinct from old.coach_id        then
    raise exception 'Only block owners can reassign the station coach.';
  end if;
  if new.field_space     is distinct from old.field_space     then
    raise exception 'Only block owners can change the station field space.';
  end if;
  if new.rotation_duration_minutes is distinct from old.rotation_duration_minutes then
    raise exception 'Only block owners can change rotation duration.';
  end if;
  if new.rotation_count  is distinct from old.rotation_count  then
    raise exception 'Only block owners can change rotation count.';
  end if;

  return new;
end;
$$;

create trigger trg_practice_stations_enforce_owner_update
  before update on public.practice_stations
  for each row execute function public.practice_stations_enforce_owner_update();

-- ─── practice_station_assignments: HC/AD or block owner only ────────────────

drop policy if exists "practice_station_assignments_coach_manage"
  on public.practice_station_assignments;

create policy "practice_station_assignments_insert"
  on public.practice_station_assignments for insert
  with check (
    public.can_edit_block(public.practice_station_assignments.block_id)
  );

create policy "practice_station_assignments_update"
  on public.practice_station_assignments for update
  using (
    public.can_edit_block(public.practice_station_assignments.block_id)
  )
  with check (
    public.can_edit_block(public.practice_station_assignments.block_id)
  );

create policy "practice_station_assignments_delete"
  on public.practice_station_assignments for delete
  using (
    public.can_edit_block(public.practice_station_assignments.block_id)
  );
