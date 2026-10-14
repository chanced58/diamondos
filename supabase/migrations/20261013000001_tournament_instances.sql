-- Tournament workspaces, explicit tournament-mode grants, and atomic creation.

ALTER TABLE public.user_profiles
  ADD COLUMN tournament_mode_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE public.tournament_mode_permission_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  changed_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  old_value boolean NOT NULL,
  new_value boolean NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tournament_mode_permission_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY tournament_mode_permission_audit_platform_admin_read
  ON public.tournament_mode_permission_audit FOR SELECT
  USING (public.is_platform_admin());

CREATE OR REPLACE FUNCTION public.guard_tournament_mode_permission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.tournament_mode_enabled IS DISTINCT FROM OLD.tournament_mode_enabled THEN
    IF (auth.uid() IS NULL AND session_user NOT IN ('postgres', 'supabase_admin'))
       OR (auth.uid() IS NOT NULL AND NOT public.is_platform_admin()) THEN
      RAISE EXCEPTION 'Only platform administrators can change tournament mode permission'
        USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.tournament_mode_permission_audit (user_id, changed_by, old_value, new_value)
    VALUES (NEW.id, auth.uid(), OLD.tournament_mode_enabled, NEW.tournament_mode_enabled);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER user_profiles_guard_tournament_mode_permission
  BEFORE UPDATE OF tournament_mode_enabled ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_tournament_mode_permission();

CREATE OR REPLACE FUNCTION public.set_tournament_mode_permission(p_user_id uuid, p_enabled boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Only platform administrators can change tournament mode permission'
      USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL OR p_enabled IS NULL THEN
    RAISE EXCEPTION 'A user and permission value are required' USING ERRCODE = '22023';
  END IF;

  UPDATE public.user_profiles
  SET tournament_mode_enabled = p_enabled
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile not found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.set_tournament_mode_permission(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_tournament_mode_permission(uuid, boolean) TO authenticated;

CREATE TABLE public.tournaments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  start_date date NOT NULL,
  end_date date NOT NULL CHECK (end_date >= start_date),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'archived')),
  scoring_settings jsonb NOT NULL,
  request_id uuid NOT NULL,
  request_payload jsonb NOT NULL CHECK (jsonb_typeof(request_payload) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (created_by, request_id),
  CONSTRAINT tournaments_scoring_settings_shape CHECK (
    jsonb_typeof(scoring_settings) = 'object'
    AND jsonb_typeof(scoring_settings->'lineup') = 'object'
    AND jsonb_typeof(scoring_settings->'lineup'->'allowExpanded') = 'boolean'
    AND jsonb_typeof(scoring_settings->'lineup'->'maxBatters') = 'number'
    AND jsonb_typeof(scoring_settings->'lineup'->'allowMidGameExtension') = 'boolean'
    AND jsonb_typeof(scoring_settings->'lineup'->'allowMidGameContraction') = 'boolean'
    AND CASE
      WHEN scoring_settings->'lineup'->>'allowExpanded' = 'true'
        THEN (scoring_settings->'lineup'->>'maxBatters')::numeric BETWEEN 10 AND 30
          AND (scoring_settings->'lineup'->>'maxBatters')::numeric = trunc((scoring_settings->'lineup'->>'maxBatters')::numeric)
      ELSE (scoring_settings->'lineup'->>'maxBatters')::numeric = 9
    END
  )
);

ALTER TABLE public.seasons
  ADD CONSTRAINT seasons_id_team_id_unique UNIQUE (id, team_id);

CREATE TABLE public.tournament_teams (
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE RESTRICT,
  season_id uuid NOT NULL REFERENCES public.seasons(id) ON DELETE RESTRICT,
  is_tournament_only boolean NOT NULL DEFAULT false,
  registered_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tournament_id, team_id),
  UNIQUE (tournament_id, team_id, season_id),
  CONSTRAINT tournament_teams_season_team_fkey FOREIGN KEY (season_id, team_id)
    REFERENCES public.seasons(id, team_id) ON DELETE RESTRICT
);

ALTER TABLE public.games
  ADD COLUMN tournament_id uuid REFERENCES public.tournaments(id) ON DELETE RESTRICT,
  ADD CONSTRAINT games_tournament_season_required CHECK (tournament_id IS NULL OR season_id IS NOT NULL),
  ADD CONSTRAINT games_tournament_team_season_fkey FOREIGN KEY (tournament_id, team_id, season_id)
    REFERENCES public.tournament_teams(tournament_id, team_id, season_id) ON DELETE RESTRICT;

CREATE INDEX tournament_teams_team_id_idx ON public.tournament_teams(team_id);
CREATE INDEX tournaments_created_by_idx ON public.tournaments(created_by);
CREATE INDEX games_tournament_id_idx ON public.games(tournament_id) WHERE tournament_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.is_tournament_member(p_tournament_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tournament_teams tt
    JOIN public.team_members tm ON tm.team_id = tt.team_id
    WHERE tt.tournament_id = p_tournament_id
      AND tm.user_id = p_user_id
      AND tm.is_active
  );
$$;

ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY tournaments_read_participants
  ON public.tournaments FOR SELECT
  USING (
    created_by = auth.uid()
    OR public.is_platform_admin()
    OR public.is_tournament_member(id, auth.uid())
  );

CREATE POLICY tournament_teams_read_participants
  ON public.tournament_teams FOR SELECT
  USING (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_id AND t.created_by = auth.uid()
    )
    OR public.is_tournament_member(tournament_id, auth.uid())
  );

CREATE OR REPLACE FUNCTION public.prevent_untagged_tournament_game()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.tournament_id IS NULL AND NEW.season_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.tournament_teams tt
    WHERE tt.team_id = NEW.team_id AND tt.season_id = NEW.season_id
  ) THEN
    RAISE EXCEPTION 'Tournament games must reference their tournament'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER games_require_tournament_tag_for_tournament_season
  BEFORE INSERT OR UPDATE OF team_id, season_id, tournament_id ON public.games
  FOR EACH ROW EXECUTE FUNCTION public.prevent_untagged_tournament_game();

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
  IF NOT EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = v_user_id AND up.tournament_mode_enabled
  ) THEN
    RAISE EXCEPTION 'Tournament mode permission is required' USING ERRCODE = '42501';
  END IF;
  IF p_input IS NULL OR jsonb_typeof(p_input) <> 'object'
     OR jsonb_typeof(p_input->'name') IS DISTINCT FROM 'string'
     OR v_name IS NULL OR length(v_name) NOT BETWEEN 1 AND 100
     OR v_request_id IS NULL OR v_start_date IS NULL OR v_end_date < v_start_date
     OR v_team_type IS NULL OR v_team_type NOT IN ('existing', 'new') THEN
    RAISE EXCEPTION 'Tournament details are invalid' USING ERRCODE = '22023';
  END IF;

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

    INSERT INTO public.team_members (team_id, user_id, role)
    VALUES (v_team_id, v_user_id, 'head_coach');
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

    INSERT INTO public.channel_members (channel_id, user_id, can_post)
    VALUES (v_channel_id, v_user_id, true);
  END IF;

  RETURN QUERY SELECT v_tournament_id, v_team_id, v_season_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_tournament(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_tournament(jsonb) TO authenticated;
