-- ════════════════════════════════════════════════════════════════════════════
-- Scorekeepers run the book: start games, set lineups, add guests at the field.
--
-- A scorekeeper could already record plays (`scorekeepers_insert_game_events`)
-- and finalize a game (`getAuthorizedFinalizer`), but not start it or set its
-- lineup. From a scorekeeper-only phone the sync logged `fn_start_game failed
-- … not authorized to start this game` and a failed lineup push: the server
-- kept the game `scheduled` while its events uploaded, and the lineup never
-- reached it. A guest added at the field ("Add batter" → new batter) failed
-- too, because the guest policies admitted only head/assistant coaches.
--
-- The scorers of a game, everywhere below: active head coaches, assistant
-- coaches, athletic directors and scorekeepers of the game's team — the roles
-- that may insert its game_events and finalize it (FINALIZE_ROLES on the web).
-- ════════════════════════════════════════════════════════════════════════════

-- ── Who scores a game ──────────────────────────────────────────────────────

create or replace function public.is_game_scorer(p_game_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.games g
    join public.team_members tm on tm.team_id = g.team_id
    where g.id = p_game_id
      and tm.user_id = p_user_id
      and tm.is_active = true
      and tm.role in ('head_coach', 'assistant_coach', 'athletic_director', 'scorekeeper')
  );
$$;

-- TRUE if the user scores for a team that belongs to the league: an active
-- head/assistant coach, athletic director or scorekeeper of an active member
-- team (the same roles as is_game_scorer). The guest
-- policies use it in place of is_league_coach so a scorekeeper can add a late
-- arrival at the field.
create or replace function public.is_league_scorer(p_league_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.team_members tm
    join public.league_members lm
      on lm.team_id = tm.team_id and lm.is_active = true
    where lm.league_id = p_league_id
      and tm.user_id = p_user_id
      and tm.role in ('head_coach', 'assistant_coach', 'athletic_director', 'scorekeeper')
      and tm.is_active = true
  );
$$;

-- TRUE if the user scores for a team in any active league.
create or replace function public.is_any_league_scorer(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.team_members tm
    join public.league_members lm
      on lm.team_id = tm.team_id and lm.is_active = true
    where tm.user_id = p_user_id
      and tm.role in ('head_coach', 'assistant_coach', 'athletic_director', 'scorekeeper')
      and tm.is_active = true
  );
$$;

-- TRUE if the user scores for a team in a league where the player is registered.
create or replace function public.is_league_scorer_for_player(p_player_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.league_players lp
    where lp.player_id = p_player_id
      and public.is_league_scorer(lp.league_id, p_user_id)
  );
$$;

-- The helpers answer for any user id they are given, so only signed-in users
-- (whose policies pass auth.uid()) and the service role may call them.
revoke execute on function public.is_game_scorer(uuid, uuid) from public, anon;
revoke execute on function public.is_league_scorer(uuid, uuid) from public, anon;
revoke execute on function public.is_any_league_scorer(uuid) from public, anon;
revoke execute on function public.is_league_scorer_for_player(uuid, uuid) from public, anon;
grant execute on function public.is_game_scorer(uuid, uuid) to authenticated, service_role;
grant execute on function public.is_league_scorer(uuid, uuid) to authenticated, service_role;
grant execute on function public.is_any_league_scorer(uuid) to authenticated, service_role;
grant execute on function public.is_league_scorer_for_player(uuid, uuid) to authenticated, service_role;

-- ── Starting a game from the phone ─────────────────────────────────────────

create or replace function public.fn_start_game(p_game_id uuid)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_game_scorer(p_game_id, auth.uid()) then
    raise exception 'not authorized to start this game';
  end if;

  -- Idempotent: only scheduled games transition; a game already in progress
  -- (or completed/cancelled) is left untouched so sync retries are safe.
  update public.games
     set status = 'in_progress',
         started_at = coalesce(started_at, now()),
         updated_at = now()
   where id = p_game_id
     and status = 'scheduled';
end;
$$;

comment on function public.fn_start_game(uuid) is
  'Scorer-authorized (coach, athletic director or scorekeeper of the game''s team) scheduled → in_progress transition, called by the mobile sync engine when a locally recorded game_start event reaches the server.';

-- ── The phone's whole-lineup replace ───────────────────────────────────────

create or replace function public.fn_replace_game_lineup(p_game_id uuid, p_rows jsonb)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.games where id = p_game_id) then
    raise exception 'REPLACE_LINEUP_GAME_NOT_FOUND';
  end if;
  if not public.is_game_scorer(p_game_id, auth.uid()) then
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

-- ── Lineup tables ──────────────────────────────────────────────────────────

-- Alongside coaches_manage_lineups (head/assistant), for direct writes.
create policy "scorers_manage_lineups"
  on public.game_lineups for all
  using (public.is_game_scorer(game_id, auth.uid()))
  with check (public.is_game_scorer(game_id, auth.uid()));

-- The opponent's batting order: a scorekeeper scores every one of the team's
-- games, not only league games, so the league-only policy is widened.
drop policy if exists "scorekeepers_manage_league_opponent_lineups" on public.opponent_game_lineups;
create policy "scorers_manage_opponent_game_lineups"
  on public.opponent_game_lineups for all
  using (public.is_game_scorer(game_id, auth.uid()))
  with check (public.is_game_scorer(game_id, auth.uid()));

-- ── Guests added at the field ──────────────────────────────────────────────

-- Same guest shape as before (no team, guest flag, no account, no PII
-- columns); only who may write it changes. Still no SELECT policy: other
-- scorers see guest identities only through league_player_identities().
-- The phone pushes a new guest as a plain INSERT and reads a duplicate key
-- (23505) as "already there". Any ON CONFLICT with an arbiter, DO NOTHING
-- included, also checks the new row against the SELECT policies, which no
-- scorer passes on a guest row, so it is refused.
drop policy if exists "coaches_insert_guest_only_players" on public.players;
create policy "league_scorers_insert_guest_only_players"
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
    and public.is_any_league_scorer(auth.uid())
  );

-- Kept for direct writers, but an UPDATE … WHERE id = … also needs the row to
-- pass a SELECT policy, so for scorers it matches nothing; the phone edits
-- guests through fn_update_guest_player below instead.
drop policy if exists "coaches_update_guest_only_players" on public.players;
create policy "league_scorers_update_guest_only_players"
  on public.players for update
  using (
    is_guest_only = true
    and team_id is null
    and public.is_league_scorer_for_player(id, auth.uid())
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

drop policy if exists "league_coaches_insert_guest_league_players" on public.league_players;
create policy "league_scorers_insert_guest_league_players"
  on public.league_players for insert
  with check (
    public.is_guest_only_player(player_id)
    and public.is_league_scorer(league_id, auth.uid())
  );

-- ── Editing a guest from the phone ─────────────────────────────────────────

-- A name or jersey fix made at the field. SECURITY DEFINER because an UPDATE
-- needs the row to pass a SELECT policy and scorers have none on guests (on
-- purpose, see above). Changes only the name and jersey of a guest-only
-- identity registered in one of the caller's leagues, and says whether it
-- changed a row, so the phone keeps an edit it could not store and retries.
create or replace function public.fn_update_guest_player(
  p_player_id uuid,
  p_first_name text,
  p_last_name text,
  p_jersey_number smallint
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_league_scorer_for_player(p_player_id, auth.uid()) then
    return false;
  end if;

  update public.players
     set first_name = p_first_name,
         last_name = p_last_name,
         jersey_number = p_jersey_number
   where id = p_player_id
     and is_guest_only = true
     and team_id is null;
  return found;
end;
$$;

revoke all on function public.fn_update_guest_player(uuid, text, text, smallint) from public, anon;
grant execute on function public.fn_update_guest_player(uuid, text, text, smallint) to authenticated;
