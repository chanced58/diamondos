-- League roster records: for leagues with schedules_games = true, each member
-- team gets a league-owned opponent_teams row (team_id null, league_id set,
-- linked_team_id = the team) whose opponent_players link to the team's real
-- players. The other team scores against these rows offline. Triggers keep the
-- record in step with the team roster; opponent_players rows are never deleted
-- (they may be referenced by events), only deactivated.

-- 1) Sync function ---------------------------------------------------------
create or replace function public.sync_league_roster_record(p_league_id uuid, p_team_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record_id uuid;
  v_team_name text;
begin
  if not exists (
    select 1 from public.leagues
    where id = p_league_id and schedules_games = true
  ) then
    return null;
  end if;

  select name into v_team_name from public.teams where id = p_team_id;
  if v_team_name is null then
    return null;
  end if;

  insert into public.opponent_teams (league_id, linked_team_id, name, team_id)
  values (p_league_id, p_team_id, v_team_name, null)
  on conflict (league_id, linked_team_id)
    where league_id is not null and linked_team_id is not null
  do update set name = excluded.name, updated_at = now()
  returning id into v_record_id;

  insert into public.opponent_players (
    opponent_team_id, linked_player_id, first_name, last_name, jersey_number,
    primary_position, bats, throws, is_active, updated_at
  )
  select
    v_record_id, p.id, p.first_name, p.last_name, p.jersey_number::text,
    p.primary_position,
    p.bats::text,
    -- opponent_players.throws has no 'switch' option
    case when p.throws = 'switch' then null else p.throws::text end,
    p.is_active, now()
  from public.players p
  where p.team_id = p_team_id
    and not coalesce(p.is_guest_only, false)
  on conflict (opponent_team_id, linked_player_id)
    where linked_player_id is not null and placeholder_game_id is null
  do update set
    first_name       = excluded.first_name,
    last_name        = excluded.last_name,
    jersey_number    = excluded.jersey_number,
    primary_position = excluded.primary_position,
    bats             = excluded.bats,
    throws           = excluded.throws,
    is_active        = excluded.is_active,
    updated_at       = now();

  update public.opponent_players op
  set is_active = false, updated_at = now()
  where op.opponent_team_id = v_record_id
    and op.linked_player_id is not null
    and op.placeholder_game_id is null
    and op.is_active
    and not exists (
      select 1 from public.players p
      where p.id = op.linked_player_id
        and p.team_id = p_team_id
        and not coalesce(p.is_guest_only, false)
    );

  return v_record_id;
end;
$$;

comment on function public.sync_league_roster_record(uuid, uuid) is
  'Upserts the league-owned roster record (opponent_teams + linked opponent_players) for a team in a league with schedules_games = true; deactivates linked rows for players who left. Returns the record id, or null when the league does not schedule games.';

revoke execute on function public.sync_league_roster_record(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.sync_league_roster_record(uuid, uuid)
  to service_role;

-- 2) Helper: sync a team in every scheduled league it is an active member of ---
create or replace function public.sync_team_league_roster_records(p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_league_id uuid;
begin
  if p_team_id is null then
    return;
  end if;
  for v_league_id in
    select distinct lm.league_id
    from public.league_members lm
    join public.leagues l on l.id = lm.league_id
    where lm.team_id = p_team_id
      and lm.is_active
      and l.schedules_games
  loop
    perform public.sync_league_roster_record(v_league_id, p_team_id);
  end loop;
end;
$$;

revoke execute on function public.sync_team_league_roster_records(uuid)
  from public, anon, authenticated;
grant execute on function public.sync_team_league_roster_records(uuid)
  to service_role;

-- 3) Trigger functions -----------------------------------------------------
create or replace function public.trg_league_members_sync_roster_record()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.team_id is not null and new.is_active then
    perform public.sync_league_roster_record(new.league_id, new.team_id);
  end if;
  return null;
end;
$$;

create or replace function public.trg_players_sync_roster_record()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.team_id is not null then
    perform public.sync_team_league_roster_records(new.team_id);
  end if;
  if tg_op = 'UPDATE'
     and old.team_id is not null
     and old.team_id is distinct from new.team_id then
    perform public.sync_team_league_roster_records(old.team_id);
  end if;
  return null;
end;
$$;

create or replace function public.trg_teams_sync_roster_record()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_team_league_roster_records(new.id);
  return null;
end;
$$;

create or replace function public.trg_leagues_sync_roster_records()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_id uuid;
begin
  if new.schedules_games and not coalesce(old.schedules_games, false) then
    for v_team_id in
      select lm.team_id
      from public.league_members lm
      where lm.league_id = new.id
        and lm.is_active
        and lm.team_id is not null
    loop
      perform public.sync_league_roster_record(new.id, v_team_id);
    end loop;
  end if;
  return null;
end;
$$;

revoke execute on function public.trg_league_members_sync_roster_record() from public, anon, authenticated;
revoke execute on function public.trg_players_sync_roster_record() from public, anon, authenticated;
revoke execute on function public.trg_teams_sync_roster_record() from public, anon, authenticated;
revoke execute on function public.trg_leagues_sync_roster_records() from public, anon, authenticated;

-- 4) Triggers --------------------------------------------------------------
create trigger trg_league_members_sync_roster_record
  after insert or update on public.league_members
  for each row
  when (new.team_id is not null)
  execute function public.trg_league_members_sync_roster_record();

create trigger trg_players_sync_roster_record
  after insert or update of first_name, last_name, jersey_number, primary_position,
    bats, throws, team_id, is_active on public.players
  for each row
  execute function public.trg_players_sync_roster_record();

create trigger trg_teams_sync_roster_record
  after update of name on public.teams
  for each row
  execute function public.trg_teams_sync_roster_record();

create trigger trg_leagues_sync_roster_records
  after update of schedules_games on public.leagues
  for each row
  execute function public.trg_leagues_sync_roster_records();
