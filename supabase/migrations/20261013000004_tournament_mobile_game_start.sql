-- Let an authenticated team coach start tournament games from mobile and
-- preserve the client-generated GAME_START identity for offline retries.

CREATE OR REPLACE FUNCTION public.guard_tournament_mobile_game_start_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_team_id uuid;
  v_requested_event_id uuid;
  v_requested_sequence integer;
BEGIN
  IF NEW.event_type <> 'game_start'
     OR NOT (NEW.payload ? '_tournamentClientEventId' OR NEW.payload ? '_tournamentClientSequence') THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL OR NEW.created_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Tournament game start must be submitted by the signed-in coach' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(NEW.payload -> '_tournamentClientEventId') IS DISTINCT FROM 'string'
     OR jsonb_typeof(NEW.payload -> '_tournamentClientSequence') IS DISTINCT FROM 'number'
     OR (NEW.payload ->> '_tournamentClientSequence')::numeric <> trunc((NEW.payload ->> '_tournamentClientSequence')::numeric) THEN
    RAISE EXCEPTION 'Offline tournament game start identity is invalid' USING ERRCODE = '22023';
  END IF;

  v_requested_event_id := (NEW.payload ->> '_tournamentClientEventId')::uuid;
  v_requested_sequence := (NEW.payload ->> '_tournamentClientSequence')::integer;
  SELECT g.team_id INTO v_team_id FROM public.games g
  WHERE g.id = NEW.game_id AND g.tournament_id IS NOT NULL;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = v_team_id AND tm.user_id = auth.uid() AND tm.is_active
      AND tm.role IN ('head_coach', 'assistant_coach', 'athletic_director')
  ) THEN
    RAISE EXCEPTION 'Only an active team coach can start this tournament game' USING ERRCODE = '42501';
  END IF;
  IF v_requested_sequence <> NEW.sequence_number THEN
    RAISE EXCEPTION 'Tournament game start must follow all earlier game events' USING ERRCODE = '40001';
  END IF;

  NEW.id := v_requested_event_id;
  NEW.sequence_number := v_requested_sequence;
  NEW.payload := NEW.payload - '_tournamentClientEventId' - '_tournamentClientSequence';
  RETURN NEW;
END;
$$;

CREATE TRIGGER game_events_guard_tournament_mobile_start
  BEFORE INSERT ON public.game_events
  FOR EACH ROW EXECUTE FUNCTION public.guard_tournament_mobile_game_start_request();

CREATE OR REPLACE FUNCTION public.start_tournament_game_for_user(
  p_game_id uuid,
  p_event_id uuid,
  p_sequence_number integer,
  p_payload jsonb,
  p_occurred_at timestamptz
)
RETURNS TABLE (event_id uuid, sequence_number integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_returned_event_id uuid;
  v_last_reset integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to start a tournament game' USING ERRCODE = '42501';
  END IF;
  IF p_event_id IS NULL OR p_sequence_number IS NULL OR p_sequence_number < 1
     OR p_occurred_at IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Tournament game start details are invalid' USING ERRCODE = '22023';
  END IF;

  PERFORM public.start_tournament_game(
    p_game_id,
    v_user_id,
    p_payload || jsonb_build_object(
      '_tournamentClientEventId', p_event_id,
      '_tournamentClientSequence', p_sequence_number
    ),
    p_occurred_at
  );

  SELECT max(ge.sequence_number) INTO v_last_reset
  FROM public.game_events ge
  WHERE ge.game_id = p_game_id AND ge.event_type = 'game_reset';
  SELECT ge.id, ge.sequence_number
    INTO event_id, sequence_number
  FROM public.game_events ge
  WHERE ge.game_id = p_game_id AND ge.event_type = 'game_start'
    AND ge.sequence_number > coalesce(v_last_reset, 0)
  ORDER BY ge.sequence_number DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament game start event was not recorded' USING ERRCODE = 'P0002';
  END IF;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.start_tournament_game_for_user(uuid, uuid, integer, jsonb, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_tournament_game_for_user(uuid, uuid, integer, jsonb, timestamptz) TO authenticated;
REVOKE ALL ON FUNCTION public.guard_tournament_mobile_game_start_request() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.start_tournament_game_for_user(uuid, uuid, integer, jsonb, timestamptz) IS
  'Authenticated wrapper for mobile tournament starts. Uses auth.uid(), freezes instance rules atomically, and keeps the offline client event id for retries.';
