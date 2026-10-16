-- Let platform admins create a separate tournament team.
--
-- The new-team branch of create_tournament inserted the creator as the team's
-- head coach. Platform admins can never hold team_members rows
-- (prevent_platform_admin_team_membership, 20260307000002), so that insert
-- raised "Platform administrators cannot be members of a team" and aborted the
-- whole creation. Mirror the create-team edge function: platform admins get no
-- team_members or channel_members rows and reach the team, its tournament and
-- its games implicitly through is_platform_admin().

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
  v_is_platform_admin boolean;
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

  v_is_platform_admin := public.is_platform_admin();

  IF v_team_type = 'new' THEN
    INSERT INTO public.teams (name, organization, state_code, created_by)
    VALUES (
      btrim(p_input->'team'->>'name'),
      nullif(btrim(p_input->'team'->>'organization'), ''),
      upper(nullif(btrim(p_input->'team'->>'stateCode'), '')),
      v_user_id
    )
    RETURNING id INTO v_team_id;

    IF NOT v_is_platform_admin THEN
      INSERT INTO public.team_members (team_id, user_id, role)
      VALUES (v_team_id, v_user_id, 'head_coach');
    END IF;
  END IF;

  INSERT INTO public.seasons (team_id, name, start_date, end_date, is_active)
  VALUES (v_team_id, left(v_name || ' Tournament', 100), v_start_date, v_end_date, v_team_type = 'new')
  RETURNING id INTO v_season_id;

  INSERT INTO public.tournament_teams (tournament_id, team_id, season_id, is_tournament_only)
  VALUES (v_tournament_id, v_team_id, v_season_id, v_team_type = 'new');

  IF v_team_type = 'new' THEN
    INSERT INTO public.channels (team_id, channel_type, name, description, created_by)
    VALUES (v_team_id, 'announcement', 'Announcements', 'Official tournament team announcements', v_user_id)
    RETURNING id INTO v_channel_id;

    IF NOT v_is_platform_admin THEN
      INSERT INTO public.channel_members (channel_id, user_id, can_post)
      VALUES (v_channel_id, v_user_id, true);
    END IF;
  END IF;

  RETURN QUERY SELECT v_tournament_id, v_team_id, v_season_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_tournament(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_tournament(jsonb) TO authenticated;
