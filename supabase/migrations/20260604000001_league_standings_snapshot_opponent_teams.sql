-- Let league_standings_snapshot hold opponent teams, not just platform teams.
--
-- A league roster (league_members) lists both platform teams (team_id) and
-- opponent teams (opponent_team_id -> opponent_teams). The standings snapshot
-- previously keyed only on team_id (NOT NULL FK to teams), so opponent-team
-- members could never be stored. Mirror the league_members pattern: nullable
-- team_id + opponent_team_id, exactly one set, uniqueness via partial indexes.

-- 1. Drop the composite PK first. Postgres won't let us drop NOT NULL on a
--    column while it's part of a primary key, so the PK has to go before step 2.
--    Recompute does clear+insert (no ON CONFLICT), so no upsert depends on the PK;
--    per-subject partial unique indexes (step 5) replace its uniqueness role.
alter table public.league_standings_snapshot
  drop constraint league_standings_snapshot_pkey;

-- 2. team_id becomes nullable (opponent rows have no platform team)
alter table public.league_standings_snapshot
  alter column team_id drop not null;

-- 3. Add opponent_team_id for opponent-team standings rows
alter table public.league_standings_snapshot
  add column opponent_team_id uuid references public.opponent_teams(id) on delete cascade;

-- 4. Exactly one of team_id / opponent_team_id is set
alter table public.league_standings_snapshot
  add constraint chk_lss_one_team
  check (
    (team_id is not null and opponent_team_id is null)
    or (team_id is null and opponent_team_id is not null)
  );

-- 5. Per-subject partial unique indexes replace the dropped composite PK.
create unique index uq_lss_team
  on public.league_standings_snapshot (league_id, season, team_id)
  where team_id is not null;

create unique index uq_lss_opponent
  on public.league_standings_snapshot (league_id, season, opponent_team_id)
  where opponent_team_id is not null;

-- idx_lss_league_season(league_id, season) still serves the read path — kept as-is.

-- RLS: the existing members_or_public_read policy keys only on league_id
-- (visibility / membership / staff / platform admin), never on team_id, so
-- opponent rows are covered with no policy change.
