-- Keep rejected offline attempts and their explicit cancellations in the
-- append-only log, without applying invalid changes to lineup projections.
CREATE OR REPLACE FUNCTION public.guard_tournament_pending_cancellation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_team_id uuid;
BEGIN
  IF NEW.event_type <> 'event_voided' OR NEW.payload ->> 'cancelledBeforeSync' IS DISTINCT FROM 'true' THEN
    RETURN NEW;
  END IF;
  SELECT g.team_id INTO v_team_id FROM public.games g
  WHERE g.id = NEW.game_id AND g.tournament_id IS NOT NULL FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR NEW.created_by IS DISTINCT FROM auth.uid()
     OR NOT EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.team_id = v_team_id
       AND tm.user_id = auth.uid() AND tm.is_active
       AND tm.role IN ('head_coach', 'assistant_coach', 'athletic_director')) THEN
    RAISE EXCEPTION 'Only an active tournament team coach can cancel a pending change' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.game_events ge WHERE ge.id = NEW.id) THEN RETURN NEW; END IF;
  IF jsonb_typeof(NEW.payload -> 'cancelledBeforeSync') IS DISTINCT FROM 'boolean'
     OR jsonb_typeof(NEW.payload -> 'voidedEventId') IS DISTINCT FROM 'string'
     OR EXISTS (SELECT 1 FROM public.game_events ge WHERE ge.id = (NEW.payload ->> 'voidedEventId')::uuid) THEN
    RAISE EXCEPTION 'An accepted event must use a normal void, not a pending cancellation' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER game_events_guard_tournament_pending_cancellation
  BEFORE INSERT ON public.game_events FOR EACH ROW
  EXECUTE FUNCTION public.guard_tournament_pending_cancellation();

CREATE OR REPLACE FUNCTION public.sync_cancelled_tournament_lineup_change(p_change jsonb, p_void jsonb)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_input jsonb;
  v_game_id uuid := (p_change ->> 'game_id')::uuid;
  v_change_id uuid := (p_change ->> 'id')::uuid;
  v_team_id uuid;
  v_position jsonb;
  v_player_id text;
BEGIN
  SELECT g.team_id INTO v_team_id FROM public.games g
  WHERE g.id = v_game_id AND g.tournament_id IS NOT NULL FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL
     OR p_change ->> 'created_by' IS DISTINCT FROM auth.uid()::text
     OR p_void ->> 'created_by' IS DISTINCT FROM auth.uid()::text
     OR NOT EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.team_id = v_team_id
       AND tm.user_id = auth.uid() AND tm.is_active
       AND tm.role IN ('head_coach', 'assistant_coach', 'athletic_director')) THEN
    RAISE EXCEPTION 'Only the active team coach who recorded the change can cancel it' USING ERRCODE = '42501';
  END IF;
  IF v_game_id IS NULL OR v_change_id IS NULL OR (p_void ->> 'id')::uuid IS NULL
     OR jsonb_typeof(p_change) IS DISTINCT FROM 'object' OR jsonb_typeof(p_void) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_change -> 'payload') IS DISTINCT FROM 'object' OR jsonb_typeof(p_void -> 'payload') IS DISTINCT FROM 'object'
     OR p_change ->> 'event_type' IS DISTINCT FROM 'substitution'
     OR p_change -> 'payload' ->> 'substitutionType' IS NULL
     OR p_change -> 'payload' ->> 'substitutionType' NOT IN ('lineup_extension', 'lineup_contraction')
     OR p_void ->> 'event_type' IS DISTINCT FROM 'event_voided'
     OR p_void ->> 'game_id' IS DISTINCT FROM v_game_id::text
     OR p_void -> 'payload' ->> 'voidedEventId' IS DISTINCT FROM v_change_id::text
     OR p_void -> 'payload' -> 'cancelledBeforeSync' IS DISTINCT FROM 'true'::jsonb
     OR (p_void ->> 'id')::uuid IS NOT DISTINCT FROM v_change_id
     OR (p_change ->> 'sequence_number')::integer IS NULL
     OR (p_change ->> 'sequence_number')::integer <= 0
     OR (p_void ->> 'sequence_number')::integer IS NULL
     OR (p_void ->> 'sequence_number')::integer <= (p_change ->> 'sequence_number')::integer THEN
    RAISE EXCEPTION 'A matching later cancellation is required for the pending lineup change' USING ERRCODE = '22023';
  END IF;
  v_position := CASE WHEN p_change -> 'payload' ->> 'substitutionType' = 'lineup_contraction'
    THEN coalesce(p_change -> 'payload' -> 'removedBattingOrderPosition', p_change -> 'payload' -> 'battingOrderPosition')
    ELSE p_change -> 'payload' -> 'battingOrderPosition' END;
  v_player_id := p_change -> 'payload' ->> (CASE WHEN p_change -> 'payload' ->> 'substitutionType' = 'lineup_contraction'
    THEN 'outPlayerId' ELSE 'inPlayerId' END);
  IF jsonb_typeof(v_position) IS DISTINCT FROM 'number'
     OR (v_position #>> '{}')::numeric NOT BETWEEN 1 AND 30
     OR (v_position #>> '{}')::numeric <> trunc((v_position #>> '{}')::numeric)
     OR coalesce(v_player_id, '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR (p_change -> 'payload' ? 'isOpponentSubstitution'
       AND jsonb_typeof(p_change -> 'payload' -> 'isOpponentSubstitution') IS DISTINCT FROM 'boolean') THEN
    RAISE EXCEPTION 'The attempted lineup change must have valid slot, player, and side fields' USING ERRCODE = '22023';
  END IF;
  -- Insert the cancellation first so the original is provably ineffective
  -- throughout replay. Failure of either INSERT rolls back both facts.
  FOREACH v_input IN ARRAY ARRAY[p_void, p_change] LOOP
    IF EXISTS (SELECT 1 FROM public.game_events ge WHERE ge.id = (v_input ->> 'id')::uuid
      AND (ge.game_id IS DISTINCT FROM v_game_id OR ge.payload IS DISTINCT FROM v_input -> 'payload'
        OR ge.event_type IS DISTINCT FROM v_input ->> 'event_type' OR ge.created_by IS DISTINCT FROM auth.uid())) THEN
      RAISE EXCEPTION 'Event identity was already used for different data' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.game_events (id, game_id, sequence_number, event_type, inning,
      is_top_of_inning, payload, occurred_at, created_by, device_id)
    VALUES ((v_input ->> 'id')::uuid, v_game_id, (v_input ->> 'sequence_number')::integer,
      v_input ->> 'event_type', (v_input ->> 'inning')::integer,
      (v_input ->> 'is_top_of_inning')::boolean, v_input -> 'payload',
      (v_input ->> 'occurred_at')::timestamptz, auth.uid(), v_input ->> 'device_id')
    ON CONFLICT (id) DO NOTHING;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_cancelled_tournament_lineup_change(jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_cancelled_tournament_lineup_change(jsonb, jsonb) TO authenticated;
