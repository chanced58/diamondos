-- Catcher innings: fall back to UTC for an unknown games.time_zone.
--
-- games.time_zone is free text written by the app (always a valid IANA name
-- today), but AT TIME ZONE raises on an unknown name, which would make
-- recompute_catcher_innings_for_game fail outright. Resolve the name against
-- pg_timezone_names first. Body otherwise unchanged from
-- 20261018000002_catcher_innings_game_local_date.

create or replace function public.recompute_catcher_innings_for_game(p_game_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_season_id uuid;
  v_game_date date;
  v_team_id   uuid;
begin
  -- An unknown name would make AT TIME ZONE raise and block the recompute;
  -- treat it like a missing zone (UTC), as the pitch-count edge function does.
  select g.season_id,
         (g.scheduled_at at time zone coalesce(
           (select tz.name from pg_timezone_names tz where tz.name = g.time_zone),
           'UTC'
         ))::date,
         g.team_id
    into v_season_id, v_game_date, v_team_id
    from public.games g
   where g.id = p_game_id;

  if v_season_id is null then
    return;
  end if;

  if auth.role() <> 'service_role'
     and (auth.uid() is null or not public.is_coach(v_team_id, auth.uid()))
  then
    raise exception 'forbidden: recompute_catcher_innings requires coach role on team %', v_team_id
      using errcode = '42501';
  end if;

  delete from public.catcher_innings where game_id = p_game_id;

  with halves as (
    select distinct ge.inning, ge.is_top_of_inning,
           min(ge.sequence_number) as half_start_seq
      from public.game_events ge
     where ge.game_id = p_game_id
     group by ge.inning, ge.is_top_of_inning
  ),
  catcher_events as (
    select ge.sequence_number,
           (ge.payload->>'inPlayerId')::uuid as player_id
      from public.game_events ge
     where ge.game_id = p_game_id
       and ge.event_type = 'substitution'
       and ge.payload->>'newPosition' in ('C', 'catcher')
  ),
  half_catcher as (
    select h.inning, h.is_top_of_inning,
           (
             select ce.player_id
               from catcher_events ce
              where ce.sequence_number <= h.half_start_seq
              order by ce.sequence_number desc
              limit 1
           ) as player_id
      from halves h
  )
  insert into public.catcher_innings
    (game_id, player_id, season_id, game_date, innings_caught)
  select
    p_game_id,
    hc.player_id,
    v_season_id,
    v_game_date,
    count(*)::numeric(4,2)
  from half_catcher hc
  where hc.player_id is not null
  group by hc.player_id;
end;
$$;

revoke execute on function public.recompute_catcher_innings_for_game(uuid) from public;
grant execute on function public.recompute_catcher_innings_for_game(uuid) to service_role;
grant execute on function public.recompute_catcher_innings_for_game(uuid) to authenticated;
