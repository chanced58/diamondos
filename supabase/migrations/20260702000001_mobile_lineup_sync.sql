-- Mobile offline-first lineup sync support.
-- Adds four things:
--   1. game_lineups.updated_at + touch triggers so the mobile sync engine can
--      pull lineups incrementally (games/players also gain the missing touch
--      triggers their existing incremental pulls already assume).
--   2. SECURITY DEFINER helpers used by the new policies without tripping
--      RLS recursion (a freshly inserted guest players row is not yet visible
--      to its creator under any SELECT policy).
--   3. RLS policies letting an active head/assistant coach create guest-only
--      player identities and register them in their own league's guest pool —
--      previously service-role-only (web server actions), which made the
--      mobile guest flow fail silently for ordinary coaches.
--   4. A players SELECT policy exposing league-registered player identities
--      to league team members, so the mobile sync pull can mirror the league
--      roster locally for the guest picker.

-- ── updated_at columns + touch triggers ───────────────────────────────────

alter table public.game_lineups
  add column updated_at timestamptz not null default now();

comment on column public.game_lineups.updated_at is
  'Maintained by trigger. Drives incremental mobile sync pulls.';

create or replace function public.touch_game_lineups_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

alter function public.touch_game_lineups_updated_at()
  set search_path = public, pg_temp;

create trigger trg_game_lineups_touch_updated_at
  before update on public.game_lineups
  for each row execute function public.touch_game_lineups_updated_at();

create index idx_game_lineups_updated_at on public.game_lineups(updated_at);

-- players and games already have updated_at columns the mobile sync engine
-- filters on (.gte('updated_at', since)), but neither table had a touch
-- trigger — an UPDATE that didn't explicitly set updated_at was invisible to
-- incremental pulls. Fix both with the same convention.

create or replace function public.touch_players_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

alter function public.touch_players_updated_at()
  set search_path = public, pg_temp;

create trigger trg_players_touch_updated_at
  before update on public.players
  for each row execute function public.touch_players_updated_at();

create or replace function public.touch_games_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

alter function public.touch_games_updated_at()
  set search_path = public, pg_temp;

create trigger trg_games_touch_updated_at
  before update on public.games
  for each row execute function public.touch_games_updated_at();

-- ── helper functions ───────────────────────────────────────────────────────

-- TRUE if the player row is a guest-only identity (team_id NULL). SECURITY
-- DEFINER because the caller may not (yet) be able to SELECT the row — e.g.
-- the league_players INSERT policy checks the guest row the same coach just
-- created, before any visibility-granting registry row exists.
create or replace function public.is_guest_only_player(p_player_id uuid)
returns boolean
language sql security definer stable
as $$
  select exists (
    select 1 from public.players
    where id = p_player_id
      and is_guest_only = true
      and team_id is null
  );
$$;

alter function public.is_guest_only_player(uuid)
  set search_path = public, pg_temp;

-- TRUE if the player is registered (league_players) in a league that one of
-- the user's active teams belongs to. Powers league-roster visibility.
create or replace function public.is_player_in_users_league(p_player_id uuid, p_user_id uuid)
returns boolean
language sql security definer stable
as $$
  select exists (
    select 1
    from public.league_players lp
    join public.league_members lm
      on lm.league_id = lp.league_id and lm.is_active = true
    join public.team_members tm
      on tm.team_id = lm.team_id and tm.is_active = true
    where lp.player_id = p_player_id
      and tm.user_id = p_user_id
  );
$$;

alter function public.is_player_in_users_league(uuid, uuid)
  set search_path = public, pg_temp;

-- ── players: coach guest-only INSERT ───────────────────────────────────────

-- An active head/assistant coach of a team that belongs to an active league
-- may create guest-only identities (mobile offline guest flow syncs these).
-- The column checks pin the row to the guest shape: no team, guest flag set,
-- and no linked account — a guest identity can never claim a login.
create policy "coaches_insert_guest_only_players"
  on public.players for insert
  with check (
    team_id is null
    and is_guest_only = true
    and user_id is null
    and exists (
      select 1
      from public.team_members tm
      join public.league_members lm
        on lm.team_id = tm.team_id and lm.is_active = true
      where tm.user_id = auth.uid()
        and tm.role in ('head_coach', 'assistant_coach')
        and tm.is_active = true
    )
  );

-- ── players: league roster visibility ──────────────────────────────────────

-- League team members can see the identities of players registered in their
-- league (guests, free agents, other teams' rostered players). This is what
-- lets the mobile players pull mirror the league pool for the guest picker.
create policy "league_members_view_league_player_identities"
  on public.players for select
  using (public.is_player_in_users_league(id, auth.uid()));

-- ── players: coach guest-only UPDATE (e.g. jersey fixes) ───────────────────

-- Coaches in the guest's league may edit guest-only identities. WITH CHECK
-- keeps the row in the guest shape — a coach cannot promote a guest onto a
-- roster or link an account through this policy.
create policy "coaches_update_guest_only_players"
  on public.players for update
  using (
    is_guest_only = true
    and team_id is null
    and exists (
      select 1
      from public.league_players lp
      join public.league_members lm
        on lm.league_id = lp.league_id and lm.is_active = true
      join public.team_members tm
        on tm.team_id = lm.team_id and tm.is_active = true
      where lp.player_id = public.players.id
        and tm.user_id = auth.uid()
        and tm.role in ('head_coach', 'assistant_coach')
        and tm.is_active = true
    )
  )
  with check (
    is_guest_only = true
    and team_id is null
    and user_id is null
  );

-- ── league_players: coach guest registration ───────────────────────────────

-- Coaches may register guest-only identities in their own league's pool.
-- Restricting to is_guest_only_player means coaches cannot register arbitrary
-- rostered players into a league — that remains league_admin / service-role.
create policy "league_coaches_insert_guest_league_players"
  on public.league_players for insert
  with check (
    public.is_guest_only_player(player_id)
    and exists (
      select 1
      from public.team_members tm
      join public.league_members lm
        on lm.team_id = tm.team_id and lm.is_active = true
      where lm.league_id = public.league_players.league_id
        and tm.user_id = auth.uid()
        and tm.role in ('head_coach', 'assistant_coach')
        and tm.is_active = true
    )
  );
