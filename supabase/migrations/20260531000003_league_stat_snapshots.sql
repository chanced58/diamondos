-- Precomputed, season-scoped snapshots for the public league home page.
-- Written exclusively by the recompute job (service role, bypasses RLS).
-- Read by: the page (service role) and league members; public rows readable
-- by anon only when the parent league is public.

-- Shared updated_at trigger fn for the snapshot tables (no global one exists).
create or replace function public.touch_league_snapshot_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 1) Standings -------------------------------------------------------------
create table public.league_standings_snapshot (
  league_id     uuid not null references public.leagues(id) on delete cascade,
  season        text not null,
  team_id       uuid not null references public.teams(id) on delete cascade,
  division_id   uuid references public.league_divisions(id) on delete set null,
  team_name     text not null,
  wins          integer not null default 0,
  losses        integer not null default 0,
  ties          integer not null default 0,
  runs_for      integer not null default 0,
  runs_against  integer not null default 0,
  win_pct       numeric(5,4) not null default 0,
  streak        text not null default '',
  updated_at    timestamptz not null default now(),
  primary key (league_id, season, team_id)
);

-- 2) Player stats ----------------------------------------------------------
create table public.league_player_stat_snapshot (
  league_id        uuid not null references public.leagues(id) on delete cascade,
  season           text not null,
  player_id        uuid not null references public.players(id) on delete cascade,
  team_id          uuid not null references public.teams(id) on delete cascade,
  team_name        text not null,
  first_name       text not null,
  last_name        text not null,
  public_opt_out   boolean not null default false,
  stats            jsonb not null default '{}'::jsonb,
  plate_appearances integer not null default 0,
  innings_pitched_outs integer not null default 0,
  updated_at       timestamptz not null default now(),
  primary key (league_id, season, player_id)
);

-- 3) Team stats ------------------------------------------------------------
create table public.league_team_stat_snapshot (
  league_id   uuid not null references public.leagues(id) on delete cascade,
  season      text not null,
  team_id     uuid not null references public.teams(id) on delete cascade,
  team_name   text not null,
  stats       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  primary key (league_id, season, team_id)
);

-- 4) Spotlights ------------------------------------------------------------
create table public.league_spotlight_snapshot (
  league_id    uuid not null references public.leagues(id) on delete cascade,
  season       text not null,
  type         text not null check (type in ('player_of_week', 'hot_team')),
  subject_id   uuid not null,
  subject_name text not null,
  team_name    text,
  blurb        text not null default '',
  window_days  integer not null default 7,
  updated_at   timestamptz not null default now(),
  primary key (league_id, season, type)
);

create index idx_lss_league_season  on public.league_standings_snapshot(league_id, season);
create index idx_lpss_league_season on public.league_player_stat_snapshot(league_id, season);
create index idx_ltss_league_season on public.league_team_stat_snapshot(league_id, season);

create trigger trg_lss_touch  before update on public.league_standings_snapshot  for each row execute function public.touch_league_snapshot_updated_at();
create trigger trg_lpss_touch before update on public.league_player_stat_snapshot for each row execute function public.touch_league_snapshot_updated_at();
create trigger trg_ltss_touch before update on public.league_team_stat_snapshot  for each row execute function public.touch_league_snapshot_updated_at();
create trigger trg_lspot_touch before update on public.league_spotlight_snapshot for each row execute function public.touch_league_snapshot_updated_at();

-- RLS: members/staff/platform admin always read; anon reads only public leagues.
do $$
declare t text;
begin
  foreach t in array array[
    'league_standings_snapshot','league_player_stat_snapshot',
    'league_team_stat_snapshot','league_spotlight_snapshot'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($f$
      create policy "members_or_public_read" on public.%I for select
      using (
        exists (select 1 from public.leagues l where l.id = league_id and l.visibility = 'public')
        or public.is_league_member(league_id, auth.uid())
        or public.is_league_staff(league_id, auth.uid())
        or public.is_platform_admin()
      );
    $f$, t);
  end loop;
end $$;
