-- ============================================================================
-- Practice Engine — Tier 8
-- F3: Field / cage / facility booking calendar (single-team scope)
--
--   * facilities — team-owned bookable resources
--   * facility_bookings with EXCLUDE gist no-overlap constraint so Postgres
--     itself rejects "varsity and JV both claim Cage 2 at 4:30"
--   * optional facility_id on practice_blocks so individual blocks can claim
--     a cage/bullpen within a larger practice
-- ============================================================================

create extension if not exists btree_gist;

create type public.facility_kind as enum (
  'cage',
  'field',
  'bullpen',
  'gym',
  'classroom',
  'weight_room',
  'other'
);

create table public.facilities (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams(id) on delete cascade,
  name        text not null,
  kind        public.facility_kind not null,
  capacity    int,
  notes       text,
  is_active   boolean not null default true,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique(team_id, name)
);

comment on table public.facilities is
  'Team-owned bookable resources (cages, fields, bullpens). Single-team scope — no org/club concept.';

create index facilities_team_active_idx
  on public.facilities(team_id, is_active);

create table public.facility_bookings (
  id           uuid primary key default gen_random_uuid(),
  facility_id  uuid not null references public.facilities(id) on delete cascade,
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  practice_id  uuid references public.practices(id) on delete cascade,
  title        text not null,
  notes        text,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (ends_at > starts_at)
);

comment on table public.facility_bookings is
  'Reservations of a facility. The EXCLUDE constraint below guarantees no two rows overlap on the same facility — conflicts surface as a DB error.';

-- The heart of F3: Postgres itself prevents overlaps on the same facility.
alter table public.facility_bookings
  add constraint facility_bookings_no_overlap
  exclude using gist (
    facility_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  );

create index facility_bookings_facility_range_idx
  on public.facility_bookings(facility_id, starts_at);

create index facility_bookings_practice_idx
  on public.facility_bookings(practice_id)
  where practice_id is not null;

-- Optional: individual practice_blocks can claim a facility within a session.
alter table public.practice_blocks
  add column if not exists facility_id uuid references public.facilities(id) on delete set null;

create index if not exists practice_blocks_facility_idx
  on public.practice_blocks(facility_id)
  where facility_id is not null;

-- ─── Triggers: updated_at touch ─────────────────────────────────────────────

create or replace function public.touch_facilities_updated_at()
  returns trigger
  language plpgsql
  set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_facilities_touch_updated_at
  before update on public.facilities
  for each row execute function public.touch_facilities_updated_at();

create or replace function public.touch_facility_bookings_updated_at()
  returns trigger
  language plpgsql
  set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_facility_bookings_touch_updated_at
  before update on public.facility_bookings
  for each row execute function public.touch_facility_bookings_updated_at();

-- ─── RLS ────────────────────────────────────────────────────────────────────

alter table public.facilities enable row level security;
alter table public.facility_bookings enable row level security;

create policy "facilities_member_select"
  on public.facilities for select
  using (
    exists (
      select 1 from public.team_members tm
       where tm.team_id = public.facilities.team_id
         and tm.user_id = auth.uid()
         and tm.is_active
    )
  );

create policy "facilities_coach_write"
  on public.facilities for all
  using (public.is_coach(team_id, auth.uid()))
  with check (public.is_coach(team_id, auth.uid()));

create policy "facility_bookings_member_select"
  on public.facility_bookings for select
  using (
    exists (
      select 1 from public.facilities f
       join public.team_members tm on tm.team_id = f.team_id
       where f.id = public.facility_bookings.facility_id
         and tm.user_id = auth.uid()
         and tm.is_active
    )
  );

create policy "facility_bookings_coach_write"
  on public.facility_bookings for all
  using (
    exists (
      select 1 from public.facilities f
       where f.id = public.facility_bookings.facility_id
         and public.is_coach(f.team_id, auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.facilities f
       where f.id = public.facility_bookings.facility_id
         and public.is_coach(f.team_id, auth.uid())
    )
  );
