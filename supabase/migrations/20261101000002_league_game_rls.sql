-- Access rules for shared league games (additive; no existing policy is changed).
-- Helpers are SECURITY DEFINER so policies on games / game_events / lineups can
-- consult league_games without re-entering its own RLS (which reads team_members).

-- 1) Helpers ---------------------------------------------------------------
create or replace function public.is_league_game_row(p_game_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.league_games lg
    where lg.home_game_id = p_game_id or lg.away_game_id = p_game_id
  );
$$;

create or replace function public.league_game_staff(p_game_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.league_games lg
    where (lg.home_game_id = p_game_id or lg.away_game_id = p_game_id)
      and public.is_league_staff(lg.league_id, p_user_id)
  );
$$;

-- Staff of the league, and the game is the HOME row of a league game. The home
-- book is canonical; staff never write the away row's events.
create or replace function public.league_home_game_staff(p_game_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.league_games lg
    where lg.home_game_id = p_game_id
      and public.is_league_staff(lg.league_id, p_user_id)
  );
$$;

-- The user scores or coaches a team playing in the placeholder's league game,
-- and the roster record is that team's own opponent_team_id on that game.
create or replace function public.can_manage_league_placeholder(
  p_placeholder_game_id uuid,
  p_opponent_team_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_placeholder_game_id is not null and exists (
    select 1
    from public.league_games lg
    join public.games g on g.id in (lg.home_game_id, lg.away_game_id)
    where lg.id = p_placeholder_game_id
      and g.opponent_team_id = p_opponent_team_id
      and (public.is_scorekeeper(g.team_id, p_user_id) or public.is_coach(g.team_id, p_user_id))
  );
$$;

-- The helpers answer for any user id they are given, so only signed-in users
-- (whose policies pass auth.uid()) and the service role may call them.
revoke execute on function public.is_league_game_row(uuid) from public, anon;
revoke execute on function public.league_game_staff(uuid, uuid) from public, anon;
revoke execute on function public.league_home_game_staff(uuid, uuid) from public, anon;
revoke execute on function public.can_manage_league_placeholder(uuid, uuid, uuid) from public, anon;
grant execute on function public.is_league_game_row(uuid) to authenticated, service_role;
grant execute on function public.league_game_staff(uuid, uuid) to authenticated, service_role;
grant execute on function public.league_home_game_staff(uuid, uuid) to authenticated, service_role;
grant execute on function public.can_manage_league_placeholder(uuid, uuid, uuid) to authenticated, service_role;

-- 2) games -----------------------------------------------------------------
create policy "league_staff_view_league_games"
  on public.games for select
  using (public.league_game_staff(id, auth.uid()));

-- 3) game_events (home row only) ------------------------------------------
create policy "league_staff_score_league_games_select"
  on public.game_events for select
  using (public.league_home_game_staff(game_id, auth.uid()));

create policy "league_staff_score_league_games"
  on public.game_events for insert
  with check (public.league_home_game_staff(game_id, auth.uid()));

-- 4) Lineups ---------------------------------------------------------------
create policy "league_staff_manage_league_game_lineups"
  on public.game_lineups for all
  using (public.league_home_game_staff(game_id, auth.uid()))
  with check (public.league_home_game_staff(game_id, auth.uid()));

create policy "league_staff_manage_league_game_lineups"
  on public.opponent_game_lineups for all
  using (public.league_home_game_staff(game_id, auth.uid()))
  with check (public.league_home_game_staff(game_id, auth.uid()));

-- A scorekeeper (not only head/assistant/AD) manages the other team's lineup
-- on a league game.
create policy "scorekeepers_manage_league_opponent_lineups"
  on public.opponent_game_lineups for all
  using (
    public.is_league_game_row(game_id)
    and exists (
      select 1 from public.games g
      where g.id = opponent_game_lineups.game_id
        and public.is_scorekeeper(g.team_id, auth.uid())
    )
  )
  with check (
    public.is_league_game_row(game_id)
    and exists (
      select 1 from public.games g
      where g.id = opponent_game_lineups.game_id
        and public.is_scorekeeper(g.team_id, auth.uid())
    )
  );

-- 5) League roster records -------------------------------------------------
create policy "league_members_view_league_roster_records"
  on public.opponent_teams for select
  using (
    league_id is not null
    and linked_team_id is not null
    and exists (
      select 1 from public.leagues l
      where l.id = opponent_teams.league_id and l.schedules_games = true
    )
    and public.is_league_member(league_id, auth.uid())
  );

create policy "league_members_view_league_roster_records"
  on public.opponent_players for select
  using (
    exists (
      select 1 from public.opponent_teams ot
      join public.leagues l on l.id = ot.league_id
      where ot.id = opponent_players.opponent_team_id
        and ot.linked_team_id is not null
        and l.schedules_games = true
        and public.is_league_member(ot.league_id, auth.uid())
    )
  );

-- 6) Unknown-player placeholders ------------------------------------------
-- Scorers of either team create and edit (rename, deactivate) the unmatched
-- placeholders of their league game, offline through the phone's upsert. They
-- never match, mark as fill-in or delete one: matching sets linked_player_id /
-- is_fill_in through the service-role resolvePlaceholder, so every policy here
-- holds the row to "still unmatched" both before and after the write, and there
-- is no DELETE policy (rows may be referenced by events).
create policy "league_game_scorers_view_placeholders"
  on public.opponent_players for select
  using (
    placeholder_game_id is not null
    and linked_player_id is null
    and is_fill_in = false
    and public.can_manage_league_placeholder(placeholder_game_id, opponent_team_id, auth.uid())
  );

create policy "league_game_scorers_add_placeholders"
  on public.opponent_players for insert
  with check (
    placeholder_game_id is not null
    and linked_player_id is null
    and is_fill_in = false
    and public.can_manage_league_placeholder(placeholder_game_id, opponent_team_id, auth.uid())
  );

create policy "league_game_scorers_edit_placeholders"
  on public.opponent_players for update
  using (
    placeholder_game_id is not null
    and linked_player_id is null
    and is_fill_in = false
    and public.can_manage_league_placeholder(placeholder_game_id, opponent_team_id, auth.uid())
  )
  with check (
    placeholder_game_id is not null
    and linked_player_id is null
    and is_fill_in = false
    and public.can_manage_league_placeholder(placeholder_game_id, opponent_team_id, auth.uid())
  );
