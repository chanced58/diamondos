-- Mobile offline-first lineup sync support.
-- Adds:
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
--   4. A league_player_identities() RPC exposing PII-free player identity
--      columns to league coaches, so the mobile sync can mirror the league
--      roster locally for the guest picker without widening players SELECT.
--   5. server_time() so mobile sync checkpoints use the server clock.
--   6. A parent-game touch trigger on game_lineups (tombstone substitute for
--      emptied lineups) and fn_replace_game_lineup() so the mobile push can
--      replace a game's lineup atomically.

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

-- TRUE if the user is an active head/assistant coach of a team that is an
-- active member of the given league. (is_coach() is team-scoped; the guest
-- policies below need the league scope.)
create or replace function public.is_league_coach(p_league_id uuid, p_user_id uuid)
returns boolean
language sql security definer stable
as $$
  select exists (
    select 1
    from public.team_members tm
    join public.league_members lm
      on lm.team_id = tm.team_id and lm.is_active = true
    where lm.league_id = p_league_id
      and tm.user_id = p_user_id
      and tm.role in ('head_coach', 'assistant_coach')
      and tm.is_active = true
  );
$$;

alter function public.is_league_coach(uuid, uuid)
  set search_path = public, pg_temp;

-- TRUE if the user is an active head/assistant coach of a team in ANY active
-- league (guest identities aren't scoped to a league at insert time).
create or replace function public.is_any_league_coach(p_user_id uuid)
returns boolean
language sql security definer stable
as $$
  select exists (
    select 1
    from public.team_members tm
    join public.league_members lm
      on lm.team_id = tm.team_id and lm.is_active = true
    where tm.user_id = p_user_id
      and tm.role in ('head_coach', 'assistant_coach')
      and tm.is_active = true
  );
$$;

alter function public.is_any_league_coach(uuid)
  set search_path = public, pg_temp;

-- TRUE if the user coaches in a league where the player is registered.
create or replace function public.is_league_coach_for_player(p_player_id uuid, p_user_id uuid)
returns boolean
language sql security definer stable
as $$
  select exists (
    select 1
    from public.league_players lp
    where lp.player_id = p_player_id
      and public.is_league_coach(lp.league_id, p_user_id)
  );
$$;

alter function public.is_league_coach_for_player(uuid, uuid)
  set search_path = public, pg_temp;

-- ── players: coach guest-only INSERT ───────────────────────────────────────

-- An active head/assistant coach of a team that belongs to an active league
-- may create guest-only identities (mobile offline guest flow syncs these).
-- The column checks pin the row to the guest shape: no team, guest flag set,
-- no linked account (a guest identity can never claim a login), and no PII
-- columns — RLS cannot restrict columns, so the value constraints keep
-- email/DOB/notes/graduation_year unwritable through this policy.
create policy "coaches_insert_guest_only_players"
  on public.players for insert
  with check (
    team_id is null
    and is_guest_only = true
    and user_id is null
    and email is null
    and phone is null
    and date_of_birth is null
    and notes is null
    and graduation_year is null
    and public.is_any_league_coach(auth.uid())
  );

-- ── players: coach guest-only UPDATE (e.g. jersey fixes) ───────────────────

-- Coaches in the guest's league may edit guest-only identities. WITH CHECK
-- keeps the row in the guest shape — a coach cannot promote a guest onto a
-- roster, link an account, or write PII columns through this policy (same
-- value constraints as the insert policy above).
create policy "coaches_update_guest_only_players"
  on public.players for update
  using (
    is_guest_only = true
    and team_id is null
    and public.is_league_coach_for_player(id, auth.uid())
  )
  with check (
    is_guest_only = true
    and team_id is null
    and user_id is null
    and email is null
    and phone is null
    and date_of_birth is null
    and notes is null
    and graduation_year is null
  );

-- ── league_players: coach guest registration ───────────────────────────────

-- Coaches may register guest-only identities in their own league's pool.
-- Restricting to is_guest_only_player means coaches cannot register arbitrary
-- rostered players into a league — that remains league_admin / service-role.
create policy "league_coaches_insert_guest_league_players"
  on public.league_players for insert
  with check (
    public.is_guest_only_player(player_id)
    and public.is_league_coach(league_id, auth.uid())
  );

-- ── league roster identities for the mobile guest picker ───────────────────

-- Deliberately an RPC rather than a players SELECT policy: players carries
-- FERPA-sensitive PII (date_of_birth, notes, plus a linkable user_id), and a
-- row-level policy cannot restrict columns. This function exposes only
-- baseball-identity columns, only to active head/assistant coaches, only for
-- players registered in one of their leagues. The mobile sync engine calls it
-- (incrementally via p_since) to mirror the league pool locally for the
-- offline guest picker.
create or replace function public.league_player_identities(p_since timestamptz default '-infinity')
returns table (
  id uuid,
  team_id uuid,
  first_name text,
  last_name text,
  jersey_number smallint,
  primary_position public.player_position,
  bats public.bats_throws,
  throws public.bats_throws,
  is_active boolean,
  is_guest_only boolean,
  updated_at timestamptz
)
language sql security definer stable
as $$
  select distinct
    p.id, p.team_id, p.first_name, p.last_name, p.jersey_number,
    p.primary_position, p.bats, p.throws, p.is_active, p.is_guest_only,
    p.updated_at
  from public.players p
  join public.league_players lp on lp.player_id = p.id
  join public.league_members lm
    on lm.league_id = lp.league_id and lm.is_active = true
  join public.team_members tm
    on tm.team_id = lm.team_id and tm.is_active = true
  where tm.user_id = auth.uid()
    and tm.role in ('head_coach', 'assistant_coach')
    and p.updated_at >= p_since;
$$;

alter function public.league_player_identities(timestamptz)
  set search_path = public, pg_temp;

-- ── server time for sync checkpoints ───────────────────────────────────────

-- The mobile sync engine's incremental pulls filter on server-generated
-- timestamps; the checkpoint they compare against must come from the same
-- clock. A device clock running fast would otherwise permanently skip rows
-- committed before its inflated checkpoint.
create or replace function public.server_time()
returns timestamptz
language sql stable
as $$
  select now();
$$;

alter function public.server_time()
  set search_path = public, pg_temp;

-- ── lineup tombstone: touch the parent game on any lineup change ───────────

-- game_lineups deletions leave no tombstones, so a web save that EMPTIES a
-- lineup would otherwise be invisible to incremental pulls. Touching the
-- parent game's updated_at makes the game row re-pull, and the mobile sync
-- derives lineup deletions for re-pulled games by diffing id sets.
create or replace function public.touch_parent_game_on_lineup_change()
returns trigger language plpgsql as $$
begin
  update public.games set updated_at = now()
  where id = coalesce(new.game_id, old.game_id);
  return coalesce(new, old);
end;
$$;

alter function public.touch_parent_game_on_lineup_change()
  set search_path = public, pg_temp;

create trigger trg_game_lineups_touch_parent_game
  after insert or update or delete on public.game_lineups
  for each row execute function public.touch_parent_game_on_lineup_change();

-- ── atomic whole-lineup replace for the mobile push ────────────────────────

-- The mobile sync replaces a game's entire lineup. Two separate REST calls
-- (delete, then insert) would leave the server lineup empty if the insert
-- failed after the delete committed; this RPC does both in one transaction.
-- SECURITY DEFINER with an explicit coach check mirroring the
-- coaches_manage_lineups policy.
create or replace function public.fn_replace_game_lineup(p_game_id uuid, p_rows jsonb)
returns void
language plpgsql security definer
as $$
declare
  v_team_id uuid;
begin
  select team_id into v_team_id from public.games where id = p_game_id;
  if v_team_id is null then
    raise exception 'REPLACE_LINEUP_GAME_NOT_FOUND';
  end if;
  if not public.is_coach(v_team_id, auth.uid()) then
    raise exception 'REPLACE_LINEUP_NOT_AUTHORIZED';
  end if;

  delete from public.game_lineups where game_id = p_game_id;

  insert into public.game_lineups
    (id, game_id, player_id, batting_order, starting_position,
     is_starter, is_guest, guest_display_name, count_toward_stats)
  select
    (r->>'id')::uuid,
    p_game_id,
    (r->>'player_id')::uuid,
    (r->>'batting_order')::smallint,
    nullif(r->>'starting_position', '')::public.player_position,
    coalesce((r->>'is_starter')::boolean, true),
    coalesce((r->>'is_guest')::boolean, false),
    nullif(r->>'guest_display_name', ''),
    coalesce((r->>'count_toward_stats')::boolean, true)
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) as r;
end;
$$;

alter function public.fn_replace_game_lineup(uuid, jsonb)
  set search_path = public, pg_temp;
