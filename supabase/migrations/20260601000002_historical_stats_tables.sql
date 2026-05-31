-- League historical-data import — imported stat tables.
--
-- The app derives all live stats at read time from the immutable game_events
-- log; there are no pre-aggregated stat tables. Imported history therefore
-- lands here, physically separate from game_events, in tables whose COUNTING
-- columns mirror the BattingStats / PitchingStats / FieldingStats interfaces in
-- @baseball/shared. Rate stats (avg, obp, era, whip, …) are NEVER persisted —
-- the read layer computes them from these counting columns using the same
-- formulas the live derivers use, so the two paths can't diverge.
--
-- Grain is per-game (one row per player per historical game). When a source
-- only provides season totals, a single is_season_summary row (game_date NULL,
-- games_played = season GP) is written instead. A CHECK + partial unique
-- indexes prevent mixing per-game rows and a summary row for the same season.

-- ── historical_player_game_stats ──────────────────────────────────────────────

create table public.historical_player_game_stats (
  id                uuid primary key default gen_random_uuid(),
  batch_id          uuid not null references public.import_batches(id) on delete cascade,
  league_id         uuid not null references public.leagues(id) on delete cascade,

  -- Subject team: exactly one of a platform team or a league-owned (often
  -- historical) opponent team.
  team_id           uuid references public.teams(id) on delete cascade,
  opponent_team_id  uuid references public.opponent_teams(id) on delete cascade,

  -- Player identity: a matched/created league player, or NULL when the admin
  -- chose to skip reconciliation (still queryable by player_name).
  player_id         uuid references public.players(id) on delete set null,
  external_player_id text,                 -- source platform's player id
  player_name       text not null,         -- snapshot for display / audit
  jersey_number     smallint,

  -- Season scoping. season_id is optional because league-owned opponent teams
  -- have no seasons row; (season_year, season_label) always carry the period.
  season_id         uuid references public.seasons(id) on delete set null,
  season_year       smallint not null,
  season_label      text,

  -- Game grain. is_season_summary rows have NULL game_date and carry GP.
  external_game_id  text,
  game_date         date,
  opponent_label    text,
  is_season_summary boolean not null default false,
  games_played      smallint not null default 1,

  -- BATTING counting stats (mirror BattingStats). Nullable so a pitching-only
  -- row can omit them.
  bat_pa   smallint, bat_ab  smallint, bat_r   smallint, bat_h   smallint,
  bat_2b   smallint, bat_3b  smallint, bat_hr  smallint, bat_rbi smallint,
  bat_bb   smallint, bat_so  smallint, bat_hbp smallint, bat_sf  smallint, bat_sh smallint,

  -- PITCHING counting stats (mirror PitchingStats). pit_ip_outs = outs recorded.
  pit_ip_outs smallint, pit_pitches smallint, pit_strikes smallint, pit_balls smallint,
  pit_h smallint, pit_r smallint, pit_er smallint, pit_bb smallint, pit_so smallint,
  pit_hbp smallint, pit_wp smallint,

  -- FIELDING counting stats (mirror FieldingStats).
  fld_po smallint, fld_a smallint, fld_e smallint,

  imported_at       timestamptz not null default now(),

  constraint chk_hpgs_subject_team
    check ( (team_id is not null and opponent_team_id is null)
         or (team_id is null and opponent_team_id is not null) ),
  constraint chk_hpgs_grain
    check ( (is_season_summary and game_date is null) or (not is_season_summary) )
);

comment on table public.historical_player_game_stats is
  'Per-player historical box scores imported from another platform. Counting columns mirror @baseball/shared BattingStats/PitchingStats/FieldingStats; rate stats are derived at read time. Separate from the event-sourced game_events log.';

-- Idempotent re-import: a given source game row resolves to one DB row per batch.
create unique index uq_hpgs_external_game_player
  on public.historical_player_game_stats(batch_id, external_player_id, external_game_id)
  where external_player_id is not null and external_game_id is not null;

-- Season-summary idempotency: at most one summary row per player per season per batch.
create unique index uq_hpgs_summary
  on public.historical_player_game_stats(batch_id, external_player_id, season_year)
  where is_season_summary = true;

create index idx_hpgs_player_season on public.historical_player_game_stats(player_id, season_year);
create index idx_hpgs_team_season   on public.historical_player_game_stats(team_id, season_year);
create index idx_hpgs_league        on public.historical_player_game_stats(league_id);
create index idx_hpgs_batch         on public.historical_player_game_stats(batch_id);

-- ── historical_team_game_stats ────────────────────────────────────────────────

create table public.historical_team_game_stats (
  id                uuid primary key default gen_random_uuid(),
  batch_id          uuid not null references public.import_batches(id) on delete cascade,
  league_id         uuid not null references public.leagues(id) on delete cascade,
  team_id           uuid references public.teams(id) on delete cascade,
  opponent_team_id  uuid references public.opponent_teams(id) on delete cascade,
  season_id         uuid references public.seasons(id) on delete set null,
  season_year       smallint not null,
  season_label      text,
  external_game_id  text,
  game_date         date,
  opponent_label    text,
  is_season_summary boolean not null default false,
  games_played      smallint not null default 1,
  wins              smallint,
  losses            smallint,
  ties              smallint,
  runs_for          smallint,
  runs_against      smallint,
  -- Team batting/pitching aggregates keyed by the same field vocabulary as the
  -- player table (e.g. { "bat_h": 12, "pit_so": 9 }).
  team_stats        jsonb not null default '{}'::jsonb,
  imported_at       timestamptz not null default now(),

  constraint chk_htgs_subject_team
    check ( (team_id is not null and opponent_team_id is null)
         or (team_id is null and opponent_team_id is not null) ),
  constraint chk_htgs_grain
    check ( (is_season_summary and game_date is null) or (not is_season_summary) )
);

comment on table public.historical_team_game_stats is
  'Per-team historical game/season records imported from another platform. Separate from the event-sourced game_events log.';

create unique index uq_htgs_external_game
  on public.historical_team_game_stats(batch_id, external_game_id)
  where external_game_id is not null;

create unique index uq_htgs_summary
  on public.historical_team_game_stats(batch_id, team_id, opponent_team_id, season_year)
  where is_season_summary = true;

create index idx_htgs_team_season on public.historical_team_game_stats(team_id, season_year);
create index idx_htgs_league      on public.historical_team_game_stats(league_id);
create index idx_htgs_batch       on public.historical_team_game_stats(batch_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────
-- Read: league members + staff (so imported history shows on team/player pages).
-- Write: league_admin only (commit runs service_role and bypasses RLS, but the
-- fn_commit_* functions re-check the role).

alter table public.historical_player_game_stats enable row level security;
alter table public.historical_team_game_stats   enable row level security;

create policy "hpgs_select"
  on public.historical_player_game_stats for select
  using (
    public.is_league_member(league_id, auth.uid())
    or public.is_league_staff(league_id, auth.uid())
    or public.is_platform_admin()
  );

create policy "hpgs_admin_write"
  on public.historical_player_game_stats for all
  using (public.get_league_role(league_id, auth.uid()) = 'league_admin')
  with check (public.get_league_role(league_id, auth.uid()) = 'league_admin');

create policy "htgs_select"
  on public.historical_team_game_stats for select
  using (
    public.is_league_member(league_id, auth.uid())
    or public.is_league_staff(league_id, auth.uid())
    or public.is_platform_admin()
  );

create policy "htgs_admin_write"
  on public.historical_team_game_stats for all
  using (public.get_league_role(league_id, auth.uid()) = 'league_admin')
  with check (public.get_league_role(league_id, auth.uid()) = 'league_admin');
