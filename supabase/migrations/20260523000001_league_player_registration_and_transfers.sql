-- League player registration + trades (Path A — builds on the existing
-- player_team_memberships + player_transfers model from migration
-- 20260312000001).
--
-- 1) Extend league_players with registered_at / registered_by / notes so league
--    admin can register a player into the league without (yet) putting them
--    on a team.
-- 2) Extend the existing player_transfers audit table with league_id,
--    transfer_type, season_id so league-driven moves carry the league context
--    that coach-driven moves don't need. NULL league_id rows continue to come
--    from the coach-driven transfer flow.
-- 3) RLS: replace the existing league_admin_view_players / _update_players
--    policies (which excluded free agents via team_id IS NOT NULL) with
--    policies that cover the free-agent case. Add league_admin insert paths
--    on players + league_players. Add league-scoped policies on
--    player_transfers (without disturbing the existing coach-driven policies).
-- 4) SQL helper functions wrap the multi-table league-admin mutations
--    (deactivate old membership → create new membership → update denorms →
--    audit insert) in a single transaction with SELECT … FOR UPDATE.

-- ── 1. league_players: widen semantics ─────────────────────────────────────

alter table public.league_players
  add column registered_at timestamptz not null default now(),
  add column registered_by uuid references auth.users(id),
  add column notes         text;

comment on table public.league_players is
  'Every player registered in this league — rostered, free agent, or guest-only. Source of truth for league membership; team affiliation lives on player_team_memberships (current) + players.team_id (denorm).';

comment on column public.league_players.registered_at is
  'When this player was registered into the league (admin add OR first appearance).';

comment on column public.league_players.registered_by is
  'Auth user who registered the player; NULL for rows auto-inserted by the guest flow.';

-- ── 2. Extend existing player_transfers ───────────────────────────────────

create type public.transfer_type as enum (
  'initial_assignment',
  'trade',
  'release',
  'reassignment'
);

alter table public.player_transfers
  add column league_id     uuid references public.leagues(id) on delete cascade,
  add column transfer_type public.transfer_type,
  add column season_id     uuid references public.seasons(id) on delete set null,
  add constraint player_transfers_endpoint_check
    check (from_team_id is not null or to_team_id is not null);

create index idx_player_transfers_league
  on public.player_transfers (league_id, transferred_at desc);

comment on table public.player_transfers is
  'Append-only audit log of player movements. Coach-driven moves use NULL league_id (legacy team-coach flow); league_admin-driven moves set league_id + transfer_type. Mirrors game_events convention: never updated, never deleted; reversals are recorded as new rows.';

-- ── 3. RLS ────────────────────────────────────────────────────────────────

-- player_transfers: add league-scoped policies alongside the existing
-- coach-scoped ones. Multiple INSERT/SELECT policies are OR'd, so the coach
-- flow keeps working.
create policy "league_view_transfers"
  on public.player_transfers for select
  using (
    league_id is not null
    and (
      public.is_league_member(league_id, auth.uid())
      or public.is_league_staff(league_id, auth.uid())
      or public.is_platform_admin()
    )
  );

create policy "league_admin_insert_transfers"
  on public.player_transfers for insert
  with check (
    league_id is not null
    and public.get_league_role(league_id, auth.uid()) = 'league_admin'
    and initiated_by = auth.uid()
  );
-- No update / delete policy on player_transfers — append-only.

-- league_players: narrow insert to league_admin (was league_staff).
-- The guest-flow path runs as service_role and bypasses RLS, so this is safe.
drop policy if exists "league_staff_insert_league_players" on public.league_players;
create policy "league_admin_insert_league_players"
  on public.league_players for insert
  with check (
    public.get_league_role(league_id, auth.uid()) = 'league_admin'
  );

-- players: replace the existing league_admin_view_players /
-- league_admin_update_players policies (predicate was
-- `team_id IS NOT NULL AND is_league_admin_for_team(team_id)` which
-- excluded free agents and depended on an out-of-tree helper function).
drop policy if exists "league_admin_view_players" on public.players;
drop policy if exists "league_admin_update_players" on public.players;

create policy "league_admin_view_players"
  on public.players for select
  using (
    -- Rostered: player's current team is in a league this user admins.
    exists (
      select 1 from public.league_members lm
      where lm.team_id = public.players.team_id
        and lm.is_active = true
        and public.get_league_role(lm.league_id, auth.uid()) = 'league_admin'
    )
    or
    -- Free agent / unassigned: player is registered in a league this user admins.
    exists (
      select 1 from public.league_players lp
      where lp.player_id = public.players.id
        and public.get_league_role(lp.league_id, auth.uid()) = 'league_admin'
    )
  );

create policy "league_admin_update_players"
  on public.players for update
  using (
    exists (
      select 1 from public.league_members lm
      where lm.team_id = public.players.team_id
        and lm.is_active = true
        and public.get_league_role(lm.league_id, auth.uid()) = 'league_admin'
    )
    or
    exists (
      select 1 from public.league_players lp
      where lp.player_id = public.players.id
        and public.get_league_role(lp.league_id, auth.uid()) = 'league_admin'
    )
  );

-- New: allow league_admin to INSERT players. Existing coach insert policy
-- (coaches_manage_players) is unaffected — multiple INSERT policies are OR'd.
create policy "league_admin_insert_players"
  on public.players for insert
  with check (
    (team_id is null
     and exists (
       select 1 from public.league_staff
       where user_id = auth.uid()
         and role = 'league_admin'
         and is_active = true
     ))
    or (team_id is not null
        and exists (
          select 1 from public.league_members lm
          where lm.team_id = public.players.team_id
            and public.get_league_role(lm.league_id, auth.uid()) = 'league_admin'
        ))
  );

-- ── 4. SQL helper functions ───────────────────────────────────────────────

-- fn_create_league_player: creates a players row + league_players row + (if
-- teamId provided) an active player_team_memberships row + initial_assignment
-- player_transfers row. Atomic.
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

-- fn_transfer_player: deactivates the current player_team_memberships row,
-- creates a new active one, updates the players.team_id / jersey_number
-- denormalizations, and logs a player_transfers row. p_accept_jersey_clear
-- lets the second call (after JERSEY_CONFLICT) proceed by clearing the
-- player's jersey on the new team.
create or replace function public.fn_transfer_player(
  p_league_id            uuid,
  p_player_id            uuid,
  p_to_team_id           uuid,
  p_effective_at         timestamptz,
  p_reason               text,
  p_season_id            uuid,
  p_accept_jersey_clear  boolean,
  p_actor                uuid
) returns public.player_transfers
language plpgsql security definer
as $$
declare
  v_from_team_id   uuid;
  v_jersey         smallint;
  v_last_season    uuid;
  v_in_progress    uuid;
  v_collision      record;
  v_transfer_type  public.transfer_type;
  v_new_jersey     smallint;
  v_when           timestamptz := coalesce(p_effective_at, now());
  v_row            public.player_transfers;
begin
  if public.get_league_role(p_league_id, p_actor) is distinct from 'league_admin' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if p_to_team_id is null then
    raise exception 'TO_TEAM_REQUIRED' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.league_players
    where league_id = p_league_id and player_id = p_player_id
  ) then
    raise exception 'NOT_IN_LEAGUE' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.league_members
    where league_id = p_league_id and team_id = p_to_team_id and is_active = true
  ) then
    raise exception 'TEAM_NOT_IN_LEAGUE' using errcode = 'P0002';
  end if;

  -- Lock the player row; capture current team / jersey from the denorm.
  select team_id, jersey_number
    into v_from_team_id, v_jersey
    from public.players
    where id = p_player_id
    for update;

  -- In-progress game guard
  select gl.game_id
    into v_in_progress
    from public.game_lineups gl
    join public.games g on g.id = gl.game_id
    where gl.player_id = p_player_id
      and g.status = 'in_progress'
    limit 1;

  if v_in_progress is not null then
    raise exception 'IN_PROGRESS_GAME:%', v_in_progress using errcode = 'P0001';
  end if;

  -- Jersey collision check against the destination team's active memberships
  -- (the partial unique index ptm_team_jersey_active_idx enforces this).
  v_new_jersey := v_jersey;
  if v_jersey is not null then
    select p.id, p.first_name, p.last_name
      into v_collision
      from public.player_team_memberships ptm
      join public.players p on p.id = ptm.player_id
      where ptm.team_id = p_to_team_id
        and ptm.is_active = true
        and ptm.jersey_number = v_jersey
        and ptm.player_id <> p_player_id
      limit 1;

    if found then
      if not p_accept_jersey_clear then
        raise exception 'JERSEY_CONFLICT:% %', v_collision.first_name, v_collision.last_name
          using errcode = 'P0001';
      else
        v_new_jersey := null;
      end if;
    end if;
  end if;

  -- Decide transfer_type. We only look at prior league-scoped rows so a
  -- coach-driven row (NULL league_id) doesn't fool the season comparison.
  select season_id
    into v_last_season
    from public.player_transfers
    where player_id = p_player_id
      and league_id = p_league_id
    order by transferred_at desc
    limit 1;

  if v_from_team_id is null then
    v_transfer_type := 'initial_assignment';
  elsif (v_last_season is null and p_season_id is null) or v_last_season = p_season_id then
    v_transfer_type := 'trade';
  else
    v_transfer_type := 'reassignment';
  end if;

  -- Deactivate old active membership (if any).
  if v_from_team_id is not null then
    update public.player_team_memberships
      set is_active = false,
          left_at = v_when,
          transfer_reason = coalesce(p_reason, v_transfer_type::text)
      where player_id = p_player_id
        and team_id = v_from_team_id
        and is_active = true;
  end if;

  -- Create new active membership.
  insert into public.player_team_memberships
    (player_id, team_id, jersey_number, is_active, joined_at)
  values
    (p_player_id, p_to_team_id, v_new_jersey, true, v_when);

  -- Update denormalized columns on players.
  update public.players
    set team_id = p_to_team_id,
        jersey_number = v_new_jersey
    where id = p_player_id;

  -- Append audit row.
  insert into public.player_transfers (
    player_id, from_team_id, to_team_id, transferred_at,
    reason, initiated_by, league_id, season_id, transfer_type
  ) values (
    p_player_id, v_from_team_id, p_to_team_id, v_when,
    p_reason, p_actor, p_league_id, p_season_id, v_transfer_type
  )
  returning * into v_row;

  return v_row;
end;
$$;

-- fn_release_player: deactivates the current player_team_memberships row,
-- sets players.team_id = NULL, and logs a 'release' player_transfers row.
-- Raises NOT_ON_TEAM if the player is already a free agent.
create or replace function public.fn_release_player(
  p_league_id    uuid,
  p_player_id    uuid,
  p_effective_at timestamptz,
  p_reason       text,
  p_actor        uuid
) returns public.player_transfers
language plpgsql security definer
as $$
declare
  v_from_team_id uuid;
  v_in_progress  uuid;
  v_when         timestamptz := coalesce(p_effective_at, now());
  v_row          public.player_transfers;
begin
  if public.get_league_role(p_league_id, p_actor) is distinct from 'league_admin' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.league_players
    where league_id = p_league_id and player_id = p_player_id
  ) then
    raise exception 'NOT_IN_LEAGUE' using errcode = 'P0002';
  end if;

  select team_id into v_from_team_id
    from public.players where id = p_player_id for update;

  if v_from_team_id is null then
    raise exception 'NOT_ON_TEAM' using errcode = 'P0001';
  end if;

  select gl.game_id into v_in_progress
    from public.game_lineups gl
    join public.games g on g.id = gl.game_id
    where gl.player_id = p_player_id and g.status = 'in_progress'
    limit 1;
  if v_in_progress is not null then
    raise exception 'IN_PROGRESS_GAME:%', v_in_progress using errcode = 'P0001';
  end if;

  update public.player_team_memberships
    set is_active = false,
        left_at = v_when,
        transfer_reason = coalesce(p_reason, 'release')
    where player_id = p_player_id
      and is_active = true;

  update public.players
    set team_id = null
    where id = p_player_id;

  insert into public.player_transfers (
    player_id, from_team_id, to_team_id, transferred_at,
    reason, initiated_by, league_id, transfer_type
  ) values (
    p_player_id, v_from_team_id, null, v_when,
    p_reason, p_actor, p_league_id, 'release'
  ) returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.fn_create_league_player(
  uuid, text, text, date, smallint, public.player_position, public.bats_throws,
  public.bats_throws, smallint, text, uuid, uuid
) to authenticated;

grant execute on function public.fn_transfer_player(
  uuid, uuid, uuid, timestamptz, text, uuid, boolean, uuid
) to authenticated;

grant execute on function public.fn_release_player(
  uuid, uuid, timestamptz, text, uuid
) to authenticated;
