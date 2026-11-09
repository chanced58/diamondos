-- Shared league game: one scheduled matchup between two league teams that
-- both teams' books (paired games) and hand-entered results attach to.
-- Only leagues with schedules_games = true use any of this.
-- Writes go through services using the service role; RLS here is read-only.

-- 1) League flag -----------------------------------------------------------
alter table public.leagues
  add column schedules_games boolean not null default false;
comment on column public.leagues.schedules_games is
  'When true, league admins schedule league_games and both teams score them. Default false keeps every other league on its current behavior.';

-- 2) league_games ----------------------------------------------------------
create table public.league_games (
  id            uuid primary key default gen_random_uuid(),
  league_id     uuid not null references public.leagues(id) on delete cascade,
  season        text not null,
  home_team_id  uuid not null references public.teams(id),
  away_team_id  uuid not null references public.teams(id),
  home_game_id  uuid unique references public.games(id) on delete set null,
  away_game_id  uuid unique references public.games(id) on delete set null,
  scheduled_at  timestamptz not null,
  time_zone     text,
  venue_name    text,
  status        text not null default 'scheduled'
                  check (status in ('scheduled', 'completed', 'cancelled')),
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint league_games_distinct_teams check (home_team_id <> away_team_id)
);

comment on table public.league_games is
  'A scheduled matchup between two league teams; the home and away teams each keep their own games row linked here.';
comment on column public.league_games.season is
  'League season label the game belongs to (matches the snapshot tables'' season).';
comment on column public.league_games.home_game_id is
  'The home team''s games row for this matchup; null until provisioned or if that row was deleted.';
comment on column public.league_games.away_game_id is
  'The away team''s games row for this matchup; null until provisioned or if that row was deleted.';
comment on column public.league_games.scheduled_at is 'Scheduled first-pitch time (UTC).';
comment on column public.league_games.time_zone is
  'IANA zone the start time was entered in; null = unknown.';
comment on column public.league_games.venue_name is 'Free-text venue name.';
comment on column public.league_games.status is
  'scheduled, completed (a result exists), or cancelled.';
comment on column public.league_games.created_by is 'The league admin who scheduled the game.';

create index idx_league_games_league_season_scheduled
  on public.league_games(league_id, season, scheduled_at);

create trigger trg_league_games_touch_updated_at
  before update on public.league_games
  for each row execute function public.touch_league_snapshot_updated_at();

-- 3) games link columns ----------------------------------------------------
alter table public.games
  add column league_game_id uuid references public.league_games(id) on delete set null,
  add column result_source text check (result_source in ('paired', 'manual'));

comment on column public.games.league_game_id is
  'The league_games matchup this row is a team''s book of; null for normal games.';
comment on column public.games.result_source is
  'How the final score was settled: paired (both books reconciled) or manual (hand-entered by a league admin). Null = the row''s own book or a normal game.';

create index idx_games_league_game_id on public.games(league_game_id)
  where league_game_id is not null;

-- 4) opponent_players roster links -----------------------------------------
alter table public.opponent_players
  add column linked_player_id uuid references public.players(id) on delete set null,
  add column placeholder_game_id uuid references public.league_games(id) on delete cascade,
  add column is_fill_in boolean not null default false;

comment on column public.opponent_players.linked_player_id is
  'The real players row this opponent roster entry has been matched to; null while unmatched.';
comment on column public.opponent_players.placeholder_game_id is
  'Set when the row is a placeholder created for one league game (removed with it); null for normal roster entries.';
comment on column public.opponent_players.is_fill_in is
  'True for a fill-in player who is not on the opponent''s real roster.';

create unique index uq_opponent_players_linked_player
  on public.opponent_players(opponent_team_id, linked_player_id)
  where linked_player_id is not null and placeholder_game_id is null;

-- 5) One roster record per team per league ---------------------------------
create unique index uq_opponent_teams_league_linked_team
  on public.opponent_teams(league_id, linked_team_id)
  where league_id is not null and linked_team_id is not null;

-- 6) Hand-entered results --------------------------------------------------
create table public.league_game_manual_results (
  league_game_id        uuid primary key references public.league_games(id) on delete cascade,
  kind                  text not null check (kind in ('final', 'box', 'batting', 'forfeit')),
  home_runs             integer,
  away_runs             integer,
  home_inning_runs      integer[],
  away_inning_runs      integer[],
  home_hits             integer,
  away_hits             integer,
  home_errors           integer,
  away_errors           integer,
  forfeit_winner_team_id uuid references public.teams(id),
  entered_by            uuid not null references auth.users(id),
  entered_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table public.league_game_manual_results is
  'A league admin''s hand-entered result for a league game that has no scored book.';
comment on column public.league_game_manual_results.kind is
  'How much was entered: final score only, box score (innings/hits/errors), batting lines, or forfeit.';
comment on column public.league_game_manual_results.home_inning_runs is 'Runs per inning for the home team, in inning order.';
comment on column public.league_game_manual_results.away_inning_runs is 'Runs per inning for the away team, in inning order.';
comment on column public.league_game_manual_results.forfeit_winner_team_id is
  'For kind = forfeit, the team awarded the win.';
comment on column public.league_game_manual_results.entered_by is 'The league admin who entered the result.';

create trigger trg_league_game_manual_results_touch_updated_at
  before update on public.league_game_manual_results
  for each row execute function public.touch_league_snapshot_updated_at();

create table public.league_game_manual_batting_lines (
  id              uuid primary key default gen_random_uuid(),
  league_game_id  uuid not null references public.league_game_manual_results(league_game_id) on delete cascade,
  team_id         uuid not null references public.teams(id),
  player_id       uuid not null references public.players(id),
  ab              integer not null default 0 check (ab >= 0),
  r               integer not null default 0 check (r >= 0),
  h               integer not null default 0 check (h >= 0),
  doubles         integer not null default 0 check (doubles >= 0),
  triples         integer not null default 0 check (triples >= 0),
  hr              integer not null default 0 check (hr >= 0),
  rbi             integer not null default 0 check (rbi >= 0),
  bb              integer not null default 0 check (bb >= 0),
  so              integer not null default 0 check (so >= 0),
  hbp             integer not null default 0 check (hbp >= 0),
  sf              integer not null default 0 check (sf >= 0),
  sb              integer not null default 0 check (sb >= 0),
  unique (league_game_id, player_id)
);

comment on table public.league_game_manual_batting_lines is
  'One player''s hand-entered batting line for a manually entered league game.';
comment on column public.league_game_manual_batting_lines.team_id is 'The team the player batted for in this game.';
comment on column public.league_game_manual_batting_lines.doubles is 'Doubles (2B).';
comment on column public.league_game_manual_batting_lines.triples is 'Triples (3B).';

-- 7) Per-team snapshot scope -----------------------------------------------
alter table public.league_player_stat_snapshot
  add column scope text not null default 'season' check (scope in ('season', 'team'));

comment on column public.league_player_stat_snapshot.scope is
  'season = the player''s whole-season line across the league; team = the line for one team (a traded player has one row per team).';

alter table public.league_player_stat_snapshot
  drop constraint league_player_stat_snapshot_pkey,
  add primary key (league_id, season, scope, player_id, team_id);

-- 8) RLS: read-only for league staff and the two teams ----------------------
alter table public.league_games enable row level security;
alter table public.league_game_manual_results enable row level security;
alter table public.league_game_manual_batting_lines enable row level security;

create policy "league_games_select_staff_or_teams"
  on public.league_games for select
  using (
    public.is_league_staff(league_id, auth.uid())
    or exists (
      select 1 from public.team_members tm
      where tm.user_id = auth.uid()
        and tm.is_active
        and tm.team_id in (league_games.home_team_id, league_games.away_team_id)
    )
  );

create policy "league_game_manual_results_select"
  on public.league_game_manual_results for select
  using (
    exists (
      select 1 from public.league_games lg
      where lg.id = league_game_manual_results.league_game_id
        and (
          public.is_league_staff(lg.league_id, auth.uid())
          or exists (
            select 1 from public.team_members tm
            where tm.user_id = auth.uid()
              and tm.is_active
              and tm.team_id in (lg.home_team_id, lg.away_team_id)
          )
        )
    )
  );

create policy "league_game_manual_batting_lines_select"
  on public.league_game_manual_batting_lines for select
  using (
    exists (
      select 1 from public.league_games lg
      where lg.id = league_game_manual_batting_lines.league_game_id
        and (
          public.is_league_staff(lg.league_id, auth.uid())
          or exists (
            select 1 from public.team_members tm
            where tm.user_id = auth.uid()
              and tm.is_active
              and tm.team_id in (lg.home_team_id, lg.away_team_id)
          )
        )
    )
  );
