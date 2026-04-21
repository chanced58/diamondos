-- ============================================================================
-- Practice Engine — Tier 1 MVP
-- Migration 5: station rotation tables
-- ============================================================================
--
-- A practice_block whose type benefits from stations (e.g. individual_skill)
-- is divided into N practice_stations. practice_station_assignments holds the
-- computed player→station matrix for each rotation_index. The no-duplicate
-- invariant (a player cannot be at two stations in the same rotation_index)
-- cannot be expressed with a partial unique index across sibling rows, so the
-- buildStationRotation pure util in @baseball/shared is the authoritative
-- source of truth and is fuzz-tested.

-- ─── practice_stations ───────────────────────────────────────────────────────
create table public.practice_stations (
  id                         uuid primary key default gen_random_uuid(),
  block_id                   uuid not null references public.practice_blocks(id) on delete cascade,
  position                   int not null check (position >= 0),
  name                       text not null,
  drill_id                   uuid references public.practice_drills(id) on delete set null,
  coach_id                   uuid references auth.users(id),
  field_space                public.practice_field_space,
  rotation_duration_minutes  int not null check (rotation_duration_minutes between 1 and 240),
  rotation_count             int not null default 1 check (rotation_count between 1 and 12),
  notes                      text,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  constraint practice_stations_unique_position
    unique (block_id, position) deferrable initially deferred
);

comment on table public.practice_stations is
  'A station within a block''s rotation. rotation_count is how many times the full set of stations rotates (typically equal across siblings).';

-- ─── practice_station_assignments ────────────────────────────────────────────
--
-- block_id is denormalized from practice_stations so we can enforce the
-- "one station per player per rotation" invariant via a unique constraint on
-- (block_id, rotation_index, player_id). Kept in sync by a trigger.
create table public.practice_station_assignments (
  id              uuid primary key default gen_random_uuid(),
  station_id      uuid not null references public.practice_stations(id) on delete cascade,
  block_id        uuid not null references public.practice_blocks(id) on delete cascade,
  player_id       uuid not null references public.players(id) on delete cascade,
  rotation_index  int not null check (rotation_index >= 0),
  created_at      timestamptz not null default now(),
  unique (station_id, rotation_index, player_id),
  unique (block_id, rotation_index, player_id)
);

comment on table public.practice_station_assignments is
  'Pre-baked assignment of a player to a station at a specific rotation_index. block_id is denormalized to enforce the one-station-per-player-per-rotation invariant at the DB level.';

-- Trigger: auto-populate block_id from the station, and refuse mismatches.
create or replace function public.practice_station_assignments_sync_block_id()
returns trigger
language plpgsql
as $$
declare
  v_block_id uuid;
begin
  select block_id into v_block_id
    from public.practice_stations
   where id = new.station_id;
  if not found then
    raise exception 'station_id % not found', new.station_id;
  end if;
  if new.block_id is null then
    new.block_id := v_block_id;
  elsif new.block_id is distinct from v_block_id then
    raise exception 'block_id must match station''s block_id';
  end if;
  return new;
end;
$$;

create trigger trg_practice_station_assignments_sync_block_id
  before insert or update of station_id, block_id
  on public.practice_station_assignments
  for each row execute function public.practice_station_assignments_sync_block_id();

-- ─── Indexes ─────────────────────────────────────────────────────────────────
create index idx_practice_stations_block on public.practice_stations(block_id, position);
create index idx_practice_stations_drill_id on public.practice_stations(drill_id);
create index idx_practice_station_assignments_station on public.practice_station_assignments(station_id, rotation_index);
create index idx_practice_station_assignments_player on public.practice_station_assignments(player_id);

-- ─── updated_at trigger ──────────────────────────────────────────────────────
create or replace function public.touch_practice_stations_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_practice_stations_touch_updated_at
  before update on public.practice_stations
  for each row execute function public.touch_practice_stations_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table public.practice_stations             enable row level security;
alter table public.practice_station_assignments  enable row level security;

create policy "practice_stations_select"
  on public.practice_stations for select
  using (
    exists (
      select 1
      from public.practice_blocks b
      join public.practices pr on pr.id = b.practice_id
      join public.team_members tm on tm.team_id = pr.team_id
      where b.id = public.practice_stations.block_id
        and tm.user_id = auth.uid()
        and tm.is_active = true
    )
  );

create policy "practice_stations_coach_manage"
  on public.practice_stations for all
  using (
    exists (
      select 1 from public.practice_blocks b
      join public.practices pr on pr.id = b.practice_id
      where b.id = public.practice_stations.block_id
        and public.is_coach(pr.team_id, auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.practice_blocks b
      join public.practices pr on pr.id = b.practice_id
      where b.id = public.practice_stations.block_id
        and public.is_coach(pr.team_id, auth.uid())
    )
  );

create policy "practice_station_assignments_select"
  on public.practice_station_assignments for select
  using (
    exists (
      select 1
      from public.practice_stations s
      join public.practice_blocks b on b.id = s.block_id
      join public.practices pr on pr.id = b.practice_id
      join public.team_members tm on tm.team_id = pr.team_id
      where s.id = public.practice_station_assignments.station_id
        and tm.user_id = auth.uid()
        and tm.is_active = true
    )
  );

create policy "practice_station_assignments_coach_manage"
  on public.practice_station_assignments for all
  using (
    exists (
      select 1
      from public.practice_stations s
      join public.practice_blocks b on b.id = s.block_id
      join public.practices pr on pr.id = b.practice_id
      where s.id = public.practice_station_assignments.station_id
        and public.is_coach(pr.team_id, auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.practice_stations s
      join public.practice_blocks b on b.id = s.block_id
      join public.practices pr on pr.id = b.practice_id
      where s.id = public.practice_station_assignments.station_id
        and public.is_coach(pr.team_id, auth.uid())
    )
  );
