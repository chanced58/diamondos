-- League historical-data import — core provenance + staging.
--
-- A league_admin uploads a CSV/XML export from another platform (Home Team by
-- GameChanger first). The tool parses it, the admin confirms which categories
-- to import and how source columns map to internal fields, reconciles players,
-- then commits. Imported stats land in separate historical_* tables
-- (migration 20260601000002) — never as synthetic game_events — so live games
-- stay event-sourced and untouched.
--
-- This migration ships:
--  1. Enums for source platform, batch status, and import category.
--  2. import_batches — one row per uploaded file; holds provenance, the
--     confirmed category/column mapping, the player reconciliation snapshot,
--     result counts, and a per-row error log. Doubles as the durable staging
--     state between the analyze and commit phases.
--  3. opponent_teams.is_historical — flags league-owned opponent teams created
--     to represent defunct/other teams from the import. League ownership of
--     opponent_teams (team_id nullable + league_id) already exists from
--     migrations 20260409000001 / 20260411000004; we only add the flag here.
--  4. A private Storage bucket `imports` for the raw uploaded files.

-- ── 1. Enums ────────────────────────────────────────────────────────────────

create type public.import_source_platform as enum (
  'home_team'   -- GameChanger "Home Team". Extend as other platforms are added.
);

create type public.import_status as enum (
  'analyzing',   -- file uploaded; parse + preview in progress
  'previewed',   -- parsed; mapping + match preview ready for admin confirmation
  'committing',  -- admin confirmed; writing rows
  'completed',   -- committed successfully
  'failed',      -- commit failed
  'rolled_back'  -- a completed batch was undone
);

create type public.import_category as enum (
  'rosters',       -- players / roster rows
  'player_stats',  -- per-player batting/pitching/fielding box scores
  'team_stats'     -- per-team game/season records
);

-- ── 2. import_batches ─────────────────────────────────────────────────────────

create table public.import_batches (
  id                   uuid primary key default gen_random_uuid(),
  league_id            uuid not null references public.leagues(id) on delete cascade,
  source_platform      public.import_source_platform not null,
  file_name            text not null,
  storage_path         text,                                  -- imports/<league>/<batch>/<file>
  status               public.import_status not null default 'analyzing',
  -- Scope + mapping that drive the confirmation UI:
  detected_categories  public.import_category[] not null default '{}',
  confirmed_categories public.import_category[] not null default '{}',
  mapping              jsonb not null default '{}'::jsonb,     -- { player_stats: { "<sourceCol>": "<internalField>" }, ... }
  reconciliation       jsonb not null default '{}'::jsonb,     -- snapshot of player match decisions
  -- Results:
  counts               jsonb not null default '{}'::jsonb,     -- { players_created, players_matched, pgs_rows, tgs_rows, ... }
  error_log            jsonb not null default '[]'::jsonb,     -- [{ category, row, code, message }]
  created_by           uuid references auth.users(id) on delete set null,
  created_at           timestamptz not null default now(),
  committed_at         timestamptz,
  unique (league_id, source_platform, file_name, created_at)
);

comment on table public.import_batches is
  'One row per uploaded historical-data file. Provenance + durable staging state between the analyze and commit phases + permanent audit trail (never hard-deleted; rollback sets status=rolled_back).';

create index idx_import_batches_league on public.import_batches(league_id, created_at desc);

alter table public.import_batches enable row level security;

-- League admins (and platform admins) manage their league's import batches.
-- Commit/rollback run as service_role and bypass RLS, but the fn_* functions
-- re-check the role; this policy gates the read surface + any direct writes.
create policy "import_batches_admin_all"
  on public.import_batches for all
  using (
    public.get_league_role(league_id, auth.uid()) = 'league_admin'
    or public.is_platform_admin()
  )
  with check (
    public.get_league_role(league_id, auth.uid()) = 'league_admin'
    or public.is_platform_admin()
  );

-- ── 3. opponent_teams.is_historical ──────────────────────────────────────────

alter table public.opponent_teams
  add column is_historical boolean not null default false;

comment on column public.opponent_teams.is_historical is
  'True for league-owned opponent teams created by the historical-data importer to represent defunct or external teams. Distinguishes them from actively-scouted opponents.';

-- ── 4. Private Storage bucket for raw uploads ─────────────────────────────────

insert into storage.buckets (id, name, public)
values ('imports', 'imports', false)
on conflict (id) do nothing;
