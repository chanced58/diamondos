-- Follow-up to 20260523000001: fn_create_league_player did not verify that
-- the destination team belongs to the supplied league. Because the function
-- is `security definer`, a league_admin could craft a call with a teamId
-- belonging to a different league and create a cross-league
-- player_team_memberships row, breaking league isolation.
--
-- This migration redefines the function with the same signature plus the
-- team-in-league guard. The check mirrors the one already present in
-- fn_transfer_player.

create or replace function public.fn_create_league_player(
  p_league_id        uuid,
  p_first_name       text,
  p_last_name        text,
  p_date_of_birth    date,
  p_jersey_number    smallint,
  p_primary_position public.player_position,
  p_bats             public.bats_throws,
  p_throws           public.bats_throws,
  p_graduation_year  smallint,
  p_notes            text,
  p_team_id          uuid,
  p_actor            uuid
) returns public.players
language plpgsql security definer
as $$
declare
  v_player public.players;
begin
  if public.get_league_role(p_league_id, p_actor) is distinct from 'league_admin' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- Validate destination team belongs to the same league, BEFORE writing
  -- anything. Skipped when p_team_id is NULL (free-agent registration).
  if p_team_id is not null and not exists (
    select 1 from public.league_members
    where league_id = p_league_id
      and team_id = p_team_id
      and is_active = true
  ) then
    raise exception 'TEAM_NOT_IN_LEAGUE' using errcode = 'P0002';
  end if;

  insert into public.players (
    team_id, first_name, last_name, date_of_birth, jersey_number,
    primary_position, bats, throws, graduation_year, notes
  ) values (
    p_team_id, p_first_name, p_last_name, p_date_of_birth, p_jersey_number,
    p_primary_position, p_bats, p_throws, p_graduation_year, p_notes
  )
  returning * into v_player;

  insert into public.league_players (league_id, player_id, registered_by)
  values (p_league_id, v_player.id, p_actor);

  if p_team_id is not null then
    insert into public.player_team_memberships
      (player_id, team_id, jersey_number, is_active)
    values (v_player.id, p_team_id, p_jersey_number, true);

    insert into public.player_transfers (
      player_id, from_team_id, to_team_id,
      initiated_by, reason, league_id, transfer_type
    ) values (
      v_player.id, null, p_team_id,
      p_actor, null, p_league_id, 'initial_assignment'
    );
  end if;

  return v_player;
end;
$$;

grant execute on function public.fn_create_league_player(
  uuid, text, text, date, smallint, public.player_position, public.bats_throws,
  public.bats_throws, smallint, text, uuid, uuid
) to authenticated;
