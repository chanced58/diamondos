-- The tournament creator is the tournament team's head coach, platform admins
-- included.
--
-- 20261016000002 skipped the creator's team_members / channel_members rows for
-- platform admins, because prevent_platform_admin_team_membership forbids any
-- admin seat. But scheduling, lineups, scoring RLS, the tournament lineup
-- guards and the mobile app's team list all key off team_members, so an admin
-- creator could not schedule or score their own tournament team's games.
--
-- 1. Narrow exception: a platform admin may hold a seat on a tournament-only
--    team registered to a tournament they created. Regular teams keep the rule.
-- 2. create_tournament seats the creator as head coach (and Announcements
--    poster) for every new tournament team. The seat is inserted after the
--    tournament_teams registration so the exception can see it.
-- 3. Backfill: seat the creator of every existing tournament-only team.

CREATE OR REPLACE FUNCTION public.prevent_platform_admin_team_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
       SELECT 1 FROM public.user_profiles up
       WHERE up.id = NEW.user_id AND up.is_platform_admin = true
     )
     AND NOT EXISTS (
       SELECT 1
       FROM public.tournament_teams tt
       JOIN public.tournaments t ON t.id = tt.tournament_id
       WHERE tt.team_id = NEW.team_id
         AND tt.is_tournament_only
         AND t.created_by = NEW.user_id
     ) THEN
    RAISE EXCEPTION 'Platform administrators cannot be members of a team';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_platform_admin_team_membership() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_tournament(p_input jsonb)
RETURNS TABLE (tournament_id uuid, team_id uuid, season_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_name text := btrim(p_input->>'name');
  v_start_date date := (p_input->>'startDate')::date;
  v_end_date date := (p_input->>'endDate')::date;
  v_request_id uuid := (p_input->>'requestId')::uuid;
  v_team_type text := p_input->'team'->>'type';
  v_team_id uuid;
  v_season_id uuid;
  v_channel_id uuid;
  v_tournament_id uuid;
  v_settings jsonb;
  v_existing_payload jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required' USING ERRCODE = '42501';
  END IF;
  IF p_input IS NULL OR jsonb_typeof(p_input) <> 'object'
     OR jsonb_typeof(p_input->'name') IS DISTINCT FROM 'string'
     OR v_name IS NULL OR length(v_name) NOT BETWEEN 1 AND 100
     OR v_request_id IS NULL OR v_start_date IS NULL OR v_end_date IS NULL
     OR v_end_date < v_start_date
     OR v_team_type IS NULL OR v_team_type NOT IN ('existing', 'new') THEN
    RAISE EXCEPTION 'Tournament details are invalid' USING ERRCODE = '22023';
  END IF;

  -- Concurrent retries must see the committed result before checking this key.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user_id::text || ':' || v_request_id::text, 0));

  SELECT t.id, tt.team_id, tt.season_id, t.request_payload
  INTO v_tournament_id, v_team_id, v_season_id, v_existing_payload
  FROM public.tournaments t
  JOIN public.tournament_teams tt ON tt.tournament_id = t.id
  WHERE t.created_by = v_user_id AND t.request_id = v_request_id;

  IF FOUND THEN
    IF v_existing_payload IS DISTINCT FROM p_input THEN
      RAISE EXCEPTION 'Request ID was already used for different tournament details'
        USING ERRCODE = '23505';
    END IF;
    RETURN QUERY SELECT v_tournament_id, v_team_id, v_season_id;
    RETURN;
  END IF;

  IF v_team_type = 'existing' THEN
    v_team_id := (p_input->'team'->>'teamId')::uuid;
    IF NOT EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = v_team_id AND tm.user_id = v_user_id AND tm.is_active
        AND tm.role IN ('head_coach', 'athletic_director')
    ) THEN
      RAISE EXCEPTION 'You must be an active head coach or athletic director for the selected team'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF jsonb_typeof(p_input->'team'->'name') IS DISTINCT FROM 'string'
       OR length(btrim(coalesce(p_input->'team'->>'name', ''))) NOT BETWEEN 1 AND 100
       OR (p_input->'team' ? 'organization' AND jsonb_typeof(p_input->'team'->'organization') NOT IN ('string', 'null'))
       OR (p_input->'team' ? 'stateCode' AND length(p_input->'team'->>'stateCode') <> 2)
       OR (p_input->'team' ? 'organization' AND length(p_input->'team'->>'organization') > 100) THEN
      RAISE EXCEPTION 'Tournament team details are invalid' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF jsonb_typeof(p_input->'lineup'->'allowExpanded') IS DISTINCT FROM 'boolean'
     OR jsonb_typeof(p_input->'lineup'->'allowMidGameChanges') IS DISTINCT FROM 'boolean' THEN
    RAISE EXCEPTION 'Tournament lineup choices are invalid' USING ERRCODE = '22023';
  END IF;
  IF p_input->'lineup'->>'allowExpanded' = 'true' THEN
    IF jsonb_typeof(p_input->'lineup'->'maxBatters') IS DISTINCT FROM 'number'
       OR (p_input->'lineup'->>'maxBatters')::numeric NOT BETWEEN 10 AND 30
       OR (p_input->'lineup'->>'maxBatters')::numeric <> trunc((p_input->'lineup'->>'maxBatters')::numeric) THEN
      RAISE EXCEPTION 'Expanded lineup cap must be from 10 to 30 batters' USING ERRCODE = '22023';
    END IF;
  ELSIF p_input->'lineup' ? 'maxBatters' THEN
    RAISE EXCEPTION 'A lineup cap is only valid for expanded lineups' USING ERRCODE = '22023';
  END IF;

  v_settings := jsonb_build_object(
    'lineup', jsonb_build_object(
      'allowExpanded', (p_input->'lineup'->>'allowExpanded')::boolean,
      'maxBatters', CASE WHEN (p_input->'lineup'->>'allowExpanded')::boolean
        THEN (p_input->'lineup'->>'maxBatters')::integer ELSE 9 END,
      'allowMidGameExtension', (p_input->'lineup'->>'allowMidGameChanges')::boolean,
      'allowMidGameContraction', (p_input->'lineup'->>'allowMidGameChanges')::boolean,
      'continuousBattingOrder', false
    )
  );

  INSERT INTO public.tournaments (name, created_by, start_date, end_date, scoring_settings, request_id, request_payload)
  VALUES (v_name, v_user_id, v_start_date, v_end_date, v_settings, v_request_id, p_input)
  RETURNING id INTO v_tournament_id;

  IF v_team_type = 'new' THEN
    INSERT INTO public.teams (name, organization, state_code, created_by)
    VALUES (
      btrim(p_input->'team'->>'name'),
      nullif(btrim(p_input->'team'->>'organization'), ''),
      upper(nullif(btrim(p_input->'team'->>'stateCode'), '')),
      v_user_id
    )
    RETURNING id INTO v_team_id;
  END IF;

  INSERT INTO public.seasons (team_id, name, start_date, end_date, is_active)
  VALUES (v_team_id, left(v_name || ' Tournament', 100), v_start_date, v_end_date, v_team_type = 'new')
  RETURNING id INTO v_season_id;

  INSERT INTO public.tournament_teams (tournament_id, team_id, season_id, is_tournament_only)
  VALUES (v_tournament_id, v_team_id, v_season_id, v_team_type = 'new');

  IF v_team_type = 'new' THEN
    -- After the registration above, so a platform admin creator passes
    -- prevent_platform_admin_team_membership's tournament-team exception.
    INSERT INTO public.team_members (team_id, user_id, role)
    VALUES (v_team_id, v_user_id, 'head_coach');

    INSERT INTO public.channels (team_id, channel_type, name, description, created_by)
    VALUES (v_team_id, 'announcement', 'Announcements', 'Official tournament team announcements', v_user_id)
    RETURNING id INTO v_channel_id;

    INSERT INTO public.channel_members (channel_id, user_id, can_post)
    VALUES (v_channel_id, v_user_id, true);
  END IF;

  RETURN QUERY SELECT v_tournament_id, v_team_id, v_season_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_tournament(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_tournament(jsonb) TO authenticated;

INSERT INTO public.team_members (team_id, user_id, role)
SELECT tt.team_id, t.created_by, 'head_coach'
FROM public.tournament_teams tt
JOIN public.tournaments t ON t.id = tt.tournament_id
WHERE tt.is_tournament_only
ON CONFLICT (team_id, user_id) DO NOTHING;

INSERT INTO public.channel_members (channel_id, user_id, can_post)
SELECT c.id, t.created_by, true
FROM public.tournament_teams tt
JOIN public.tournaments t ON t.id = tt.tournament_id
JOIN public.channels c ON c.team_id = tt.team_id AND c.channel_type = 'announcement'
WHERE tt.is_tournament_only
ON CONFLICT (channel_id, user_id) DO NOTHING;
