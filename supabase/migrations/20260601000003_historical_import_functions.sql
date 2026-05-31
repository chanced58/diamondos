-- League historical-data import — atomic commit + rollback functions.
--
-- Mirror the fn_create_league_player style from 20260523000001: security
-- definer, role-guarded via get_league_role, errors raised as 'CODE:detail'.
-- Each takes a batch id (league + source platform are read from the batch) and
-- a jsonb array of rows produced by the server action after the admin confirms
-- the mapping + player reconciliation. Bulk inserts use ON CONFLICT DO NOTHING
-- against the partial unique indexes, so re-running a commit is a no-op.

-- ── fn_create_historical_opponent_team ────────────────────────────────────────
-- Creates a league-owned (team_id NULL, league_id set) historical opponent team
-- to represent a defunct/external team referenced by the import.
create or replace function public.fn_create_historical_opponent_team(
  p_league_id uuid,
  p_name      text,
  p_abbrev    text,
  p_actor     uuid
) returns public.opponent_teams
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.opponent_teams;
begin
  if public.get_league_role(p_league_id, p_actor) is distinct from 'league_admin' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  insert into public.opponent_teams (team_id, league_id, name, abbreviation, is_historical, created_by)
  values (null, p_league_id, p_name, p_abbrev, true, p_actor)
  returning * into v_row;

  return v_row;
end;
$$;

-- ── fn_commit_historical_rosters ──────────────────────────────────────────────
-- p_rows: [{ action: 'match'|'create'|'skip', externalPlayerId, playerId?,
--            firstName?, lastName?, jerseyNumber?, primaryPosition?, bats?,
--            throws?, dateOfBirth?, graduationYear?, teamId?, confidence? }]
-- 'match' links player_external_ids to an existing player.
-- 'create' inserts players + league_players (+ membership/transfer if teamId) +
--          player_external_ids, mirroring fn_create_league_player.
-- 'skip'  does nothing (stat rows for that player keep player_id NULL).
create or replace function public.fn_commit_historical_rosters(
  p_batch_id uuid,
  p_actor    uuid,
  p_rows     jsonb
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_league_id uuid;
  v_service   text;
  v_elem      jsonb;
  v_action    text;
  v_ext       text;
  v_player_id uuid;
  v_team_id   uuid;
  v_created   int := 0;
  v_matched   int := 0;
  v_skipped   int := 0;
begin
  select league_id, source_platform::text
    into v_league_id, v_service
    from public.import_batches
    where id = p_batch_id;
  if v_league_id is null then
    raise exception 'BATCH_NOT_FOUND' using errcode = 'P0002';
  end if;

  if public.get_league_role(v_league_id, p_actor) is distinct from 'league_admin' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  for v_elem in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  loop
    v_action := v_elem->>'action';
    v_ext    := v_elem->>'externalPlayerId';

    if v_action = 'skip' then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    if v_action = 'match' then
      v_player_id := (v_elem->>'playerId')::uuid;
      if v_player_id is null then
        raise exception 'MISSING_MATCH_PLAYER:%', coalesce(v_ext, '?') using errcode = '22023';
      end if;
      v_matched := v_matched + 1;

    elsif v_action = 'create' then
      v_team_id := nullif(v_elem->>'teamId', '')::uuid;

      insert into public.players (
        team_id, first_name, last_name, date_of_birth, jersey_number,
        primary_position, bats, throws, graduation_year, is_guest_only
      ) values (
        v_team_id,
        v_elem->>'firstName',
        v_elem->>'lastName',
        nullif(v_elem->>'dateOfBirth', '')::date,
        nullif(v_elem->>'jerseyNumber', '')::smallint,
        nullif(v_elem->>'primaryPosition', '')::public.player_position,
        nullif(v_elem->>'bats', '')::public.bats_throws,
        nullif(v_elem->>'throws', '')::public.bats_throws,
        nullif(v_elem->>'graduationYear', '')::smallint,
        -- A player with no current team and only historical presence is guest-only.
        v_team_id is null
      )
      returning id into v_player_id;

      insert into public.league_players (league_id, player_id, registered_by, notes)
      values (v_league_id, v_player_id, p_actor, 'Imported from ' || v_service);

      if v_team_id is not null then
        insert into public.player_team_memberships
          (player_id, team_id, jersey_number, is_active)
        values (v_player_id, v_team_id, nullif(v_elem->>'jerseyNumber', '')::smallint, true);

        insert into public.player_transfers (
          player_id, from_team_id, to_team_id,
          initiated_by, reason, league_id, transfer_type
        ) values (
          v_player_id, null, v_team_id,
          p_actor, 'Historical import', v_league_id, 'initial_assignment'
        );
      end if;

      v_created := v_created + 1;
    else
      raise exception 'BAD_ACTION:%', coalesce(v_action, 'null') using errcode = '22023';
    end if;

    -- Link the source player id to the DiamondOS player (idempotent).
    if v_ext is not null and v_player_id is not null then
      insert into public.player_external_ids (player_id, service, external_id, linked_by, confidence)
      values (v_player_id, v_service, v_ext, p_actor, coalesce(v_elem->>'confidence', 'coach_confirmed'))
      on conflict (service, external_id) do nothing;
    end if;
  end loop;

  return jsonb_build_object('created', v_created, 'matched', v_matched, 'skipped', v_skipped);
end;
$$;

-- ── fn_commit_historical_player_stats ─────────────────────────────────────────
-- p_rows: [{ externalPlayerId?, externalGameId?, playerName, jerseyNumber?,
--            teamId? | opponentTeamId?, seasonId?, seasonYear, seasonLabel?,
--            gameDate?, opponentLabel?, isSeasonSummary, gamesPlayed,
--            batting?:{pa,ab,r,h,'2b','3b',hr,rbi,bb,so,hbp,sf,sh},
--            pitching?:{ipOuts,pitches,strikes,balls,h,r,er,bb,so,hbp,wp},
--            fielding?:{po,a,e} }]
-- player_id is resolved from player_external_ids by (service, externalPlayerId).
create or replace function public.fn_commit_historical_player_stats(
  p_batch_id uuid,
  p_actor    uuid,
  p_rows     jsonb
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_league_id uuid;
  v_service   text;
  v_elem      jsonb;
  v_bat       jsonb;
  v_pit       jsonb;
  v_fld       jsonb;
  v_player_id uuid;
  v_ext       text;
  v_before    bigint;
  v_after     bigint;
  v_inserted  int := 0;
  v_total     int := 0;
begin
  select league_id, source_platform::text
    into v_league_id, v_service
    from public.import_batches where id = p_batch_id;
  if v_league_id is null then
    raise exception 'BATCH_NOT_FOUND' using errcode = 'P0002';
  end if;
  if public.get_league_role(v_league_id, p_actor) is distinct from 'league_admin' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  for v_elem in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  loop
    v_total := v_total + 1;
    v_ext := v_elem->>'externalPlayerId';
    v_player_id := null;
    if v_ext is not null then
      select player_id into v_player_id
        from public.player_external_ids
        where service = v_service and external_id = v_ext
        limit 1;
    end if;

    v_bat := v_elem->'batting';
    v_pit := v_elem->'pitching';
    v_fld := v_elem->'fielding';

    select count(*) into v_before from public.historical_player_game_stats where batch_id = p_batch_id;

    insert into public.historical_player_game_stats (
      batch_id, league_id, team_id, opponent_team_id, player_id, external_player_id,
      player_name, jersey_number, season_id, season_year, season_label,
      external_game_id, game_date, opponent_label, is_season_summary, games_played,
      bat_pa, bat_ab, bat_r, bat_h, bat_2b, bat_3b, bat_hr, bat_rbi,
      bat_bb, bat_so, bat_hbp, bat_sf, bat_sh,
      pit_ip_outs, pit_pitches, pit_strikes, pit_balls,
      pit_h, pit_r, pit_er, pit_bb, pit_so, pit_hbp, pit_wp,
      fld_po, fld_a, fld_e
    ) values (
      p_batch_id, v_league_id,
      nullif(v_elem->>'teamId', '')::uuid,
      nullif(v_elem->>'opponentTeamId', '')::uuid,
      v_player_id, v_ext,
      v_elem->>'playerName',
      nullif(v_elem->>'jerseyNumber', '')::smallint,
      nullif(v_elem->>'seasonId', '')::uuid,
      (v_elem->>'seasonYear')::smallint,
      v_elem->>'seasonLabel',
      nullif(v_elem->>'externalGameId', ''),
      nullif(v_elem->>'gameDate', '')::date,
      v_elem->>'opponentLabel',
      coalesce((v_elem->>'isSeasonSummary')::boolean, false),
      coalesce((v_elem->>'gamesPlayed')::smallint, 1),
      (v_bat->>'pa')::smallint, (v_bat->>'ab')::smallint, (v_bat->>'r')::smallint, (v_bat->>'h')::smallint,
      (v_bat->>'2b')::smallint, (v_bat->>'3b')::smallint, (v_bat->>'hr')::smallint, (v_bat->>'rbi')::smallint,
      (v_bat->>'bb')::smallint, (v_bat->>'so')::smallint, (v_bat->>'hbp')::smallint, (v_bat->>'sf')::smallint, (v_bat->>'sh')::smallint,
      (v_pit->>'ipOuts')::smallint, (v_pit->>'pitches')::smallint, (v_pit->>'strikes')::smallint, (v_pit->>'balls')::smallint,
      (v_pit->>'h')::smallint, (v_pit->>'r')::smallint, (v_pit->>'er')::smallint, (v_pit->>'bb')::smallint,
      (v_pit->>'so')::smallint, (v_pit->>'hbp')::smallint, (v_pit->>'wp')::smallint,
      (v_fld->>'po')::smallint, (v_fld->>'a')::smallint, (v_fld->>'e')::smallint
    )
    on conflict do nothing;

    select count(*) into v_after from public.historical_player_game_stats where batch_id = p_batch_id;
    if v_after > v_before then
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  return jsonb_build_object('inserted', v_inserted, 'skipped', v_total - v_inserted, 'total', v_total);
end;
$$;

-- ── fn_commit_historical_team_stats ───────────────────────────────────────────
-- p_rows: [{ teamId? | opponentTeamId?, seasonId?, seasonYear, seasonLabel?,
--            externalGameId?, gameDate?, opponentLabel?, isSeasonSummary,
--            gamesPlayed, wins?, losses?, ties?, runsFor?, runsAgainst?,
--            teamStats?:{...} }]
create or replace function public.fn_commit_historical_team_stats(
  p_batch_id uuid,
  p_actor    uuid,
  p_rows     jsonb
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_league_id uuid;
  v_elem      jsonb;
  v_before    bigint;
  v_after     bigint;
  v_inserted  int := 0;
  v_total     int := 0;
begin
  select league_id into v_league_id from public.import_batches where id = p_batch_id;
  if v_league_id is null then
    raise exception 'BATCH_NOT_FOUND' using errcode = 'P0002';
  end if;
  if public.get_league_role(v_league_id, p_actor) is distinct from 'league_admin' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  for v_elem in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  loop
    v_total := v_total + 1;
    select count(*) into v_before from public.historical_team_game_stats where batch_id = p_batch_id;

    insert into public.historical_team_game_stats (
      batch_id, league_id, team_id, opponent_team_id, season_id, season_year, season_label,
      external_game_id, game_date, opponent_label, is_season_summary, games_played,
      wins, losses, ties, runs_for, runs_against, team_stats
    ) values (
      p_batch_id, v_league_id,
      nullif(v_elem->>'teamId', '')::uuid,
      nullif(v_elem->>'opponentTeamId', '')::uuid,
      nullif(v_elem->>'seasonId', '')::uuid,
      (v_elem->>'seasonYear')::smallint,
      v_elem->>'seasonLabel',
      nullif(v_elem->>'externalGameId', ''),
      nullif(v_elem->>'gameDate', '')::date,
      v_elem->>'opponentLabel',
      coalesce((v_elem->>'isSeasonSummary')::boolean, false),
      coalesce((v_elem->>'gamesPlayed')::smallint, 1),
      (v_elem->>'wins')::smallint, (v_elem->>'losses')::smallint, (v_elem->>'ties')::smallint,
      (v_elem->>'runsFor')::smallint, (v_elem->>'runsAgainst')::smallint,
      coalesce(v_elem->'teamStats', '{}'::jsonb)
    )
    on conflict do nothing;

    select count(*) into v_after from public.historical_team_game_stats where batch_id = p_batch_id;
    if v_after > v_before then
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  return jsonb_build_object('inserted', v_inserted, 'skipped', v_total - v_inserted, 'total', v_total);
end;
$$;

-- ── fn_rollback_import_batch ──────────────────────────────────────────────────
-- Deletes the batch's imported stat rows and marks the batch rolled_back. Does
-- NOT delete players or opponent teams the batch created: those may now be
-- referenced by live data or other batches, and the import_batches row remains
-- as the permanent audit trail of what was created.
create or replace function public.fn_rollback_import_batch(
  p_batch_id uuid,
  p_actor    uuid
) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_league_id uuid;
begin
  select league_id into v_league_id from public.import_batches where id = p_batch_id;
  if v_league_id is null then
    raise exception 'BATCH_NOT_FOUND' using errcode = 'P0002';
  end if;
  if public.get_league_role(v_league_id, p_actor) is distinct from 'league_admin' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  delete from public.historical_player_game_stats where batch_id = p_batch_id;
  delete from public.historical_team_game_stats where batch_id = p_batch_id;

  update public.import_batches
    set status = 'rolled_back'
    where id = p_batch_id;
end;
$$;

-- ── Grants ────────────────────────────────────────────────────────────────────
grant execute on function public.fn_create_historical_opponent_team(uuid, text, text, uuid) to authenticated;
grant execute on function public.fn_commit_historical_rosters(uuid, uuid, jsonb) to authenticated;
grant execute on function public.fn_commit_historical_player_stats(uuid, uuid, jsonb) to authenticated;
grant execute on function public.fn_commit_historical_team_stats(uuid, uuid, jsonb) to authenticated;
grant execute on function public.fn_rollback_import_batch(uuid, uuid) to authenticated;
