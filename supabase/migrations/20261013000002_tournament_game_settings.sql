-- Freeze the rules resolved for a tournament game in the same transaction
-- that records its initial GAME_START event.

ALTER TABLE public.games
  ADD COLUMN scoring_settings_snapshot jsonb,
  ADD CONSTRAINT games_scoring_settings_snapshot_object
    CHECK (scoring_settings_snapshot IS NULL OR jsonb_typeof(scoring_settings_snapshot) = 'object');

CREATE INDEX games_tournament_status_idx
  ON public.games(tournament_id, status)
  WHERE tournament_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.guard_game_scoring_settings_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.scoring_settings_snapshot IS DISTINCT FROM OLD.scoring_settings_snapshot THEN
    IF OLD.status <> 'scheduled'
       OR NEW.status <> 'in_progress'
       OR OLD.scoring_settings_snapshot IS NOT NULL
       OR NEW.scoring_settings_snapshot IS NULL THEN
      RAISE EXCEPTION 'Game scoring settings can only be frozen once when a scheduled game starts'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER games_guard_scoring_settings_snapshot
  BEFORE UPDATE OF scoring_settings_snapshot ON public.games
  FOR EACH ROW EXECUTE FUNCTION public.guard_game_scoring_settings_snapshot();

CREATE OR REPLACE FUNCTION public.start_tournament_game(
  p_game_id uuid,
  p_user_id uuid,
  p_payload jsonb,
  p_occurred_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_team_id uuid;
  v_tournament_id uuid;
  v_status public.game_status;
  v_snapshot jsonb;
  v_tournament_settings jsonb;
  v_last_reset integer;
  v_existing_start uuid;
  v_next_sequence integer;
  v_event_id uuid := gen_random_uuid();
BEGIN
  IF p_game_id IS NULL OR p_user_id IS NULL OR p_occurred_at IS NULL
     OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Game start details are invalid' USING ERRCODE = '22023';
  END IF;

  SELECT g.team_id, g.tournament_id, g.status, g.scoring_settings_snapshot
    INTO v_team_id, v_tournament_id, v_status, v_snapshot
  FROM public.games g
  WHERE g.id = p_game_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_tournament_id IS NULL THEN
    RAISE EXCEPTION 'Game is not registered for a tournament' USING ERRCODE = '22023';
  END IF;
  IF v_status NOT IN ('scheduled', 'in_progress') THEN
    RAISE EXCEPTION 'Game is not in a schedulable state' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = p_user_id AND up.is_platform_admin
  ) AND NOT EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = v_team_id AND tm.user_id = p_user_id AND tm.is_active
      AND tm.role IN ('head_coach', 'assistant_coach', 'athletic_director')
  ) THEN
    RAISE EXCEPTION 'Only coaches for the tournament team can start its games'
      USING ERRCODE = '42501';
  END IF;

  SELECT max(ge.sequence_number) INTO v_last_reset
  FROM public.game_events ge
  WHERE ge.game_id = p_game_id AND ge.event_type = 'game_reset';

  SELECT ge.id INTO v_existing_start
  FROM public.game_events ge
  WHERE ge.game_id = p_game_id
    AND ge.event_type = 'game_start'
    AND ge.sequence_number > coalesce(v_last_reset, 0)
  ORDER BY ge.sequence_number DESC
  LIMIT 1;

  IF v_existing_start IS NOT NULL THEN
    IF v_snapshot IS NULL THEN
      RAISE EXCEPTION 'Started tournament game is missing its frozen scoring settings'
        USING ERRCODE = '23514';
    END IF;
    RETURN v_existing_start;
  END IF;

  SELECT t.scoring_settings INTO v_tournament_settings
  FROM public.tournaments t
  WHERE t.id = v_tournament_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament scoring settings were not found' USING ERRCODE = 'P0002';
  END IF;

  v_snapshot := coalesce(v_snapshot, v_tournament_settings);
  IF jsonb_typeof(v_snapshot) IS DISTINCT FROM 'object'
     OR jsonb_typeof(v_snapshot->'lineup') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Tournament scoring settings are invalid' USING ERRCODE = '23514';
  END IF;

  SELECT coalesce(max(ge.sequence_number), 0) + 1 INTO v_next_sequence
  FROM public.game_events ge
  WHERE ge.game_id = p_game_id;

  -- This update and the immutable start event commit or roll back together.
  UPDATE public.games
  SET scoring_settings_snapshot = v_snapshot,
      status = 'in_progress',
      started_at = coalesce(started_at, p_occurred_at),
      updated_at = now()
  WHERE id = p_game_id;

  INSERT INTO public.game_events (
    id, game_id, sequence_number, event_type, inning, is_top_of_inning,
    payload, occurred_at, created_by, device_id
  ) VALUES (
    v_event_id, p_game_id, v_next_sequence, 'game_start', 1, true,
    p_payload || jsonb_build_object('tournamentScoringSettings', v_snapshot),
    p_occurred_at, p_user_id, 'web'
  );

  RETURN v_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.start_tournament_game(uuid, uuid, jsonb, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_tournament_game(uuid, uuid, jsonb, timestamptz) TO service_role;
