-- Keep tournament lineup changes append-only, authorized, and serial per game.
-- The event stream remains authoritative; game_lineups is projected for the
-- existing export and statistics consumers and is never pruned on contraction.

CREATE OR REPLACE FUNCTION public.tournament_lineup_state_before_event(
  p_game_id uuid,
  p_is_opponent boolean,
  p_before_sequence integer
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_game record;
  v_is_home boolean;
  v_side_bats_on_top boolean;
  v_initial_slots jsonb := '[]'::jsonb;
  v_slots jsonb := '[]'::jsonb;
  v_effective_ids uuid[] := ARRAY[]::uuid[];
  v_event public.game_events%ROWTYPE;
  v_revert_sequence integer;
  v_voided_id uuid;
  v_next_position integer;
  v_last_completed_position integer;
  v_previous_max_position integer;
  v_slot_count integer;
  v_slot_index integer;
  v_active_batter_id uuid;
  v_current_batter_id uuid;
  v_home_leadoff_id uuid;
  v_away_leadoff_id uuid;
  v_runner_id uuid;
  v_batter_id uuid;
  v_out_position integer;
  v_in_position integer;
  v_from_base integer;
  v_to_base integer;
  v_hit_bases integer;
  v_runners uuid[] := ARRAY[NULL::uuid, NULL::uuid, NULL::uuid];
  v_last_pitch_sequence integer;
  v_last_pa_sequence integer;
  v_last_inning_change_sequence integer;
  v_is_between boolean;
BEGIN
  SELECT g.location_type, g.neutral_home_team
    INTO v_game
  FROM public.games g
  WHERE g.id = p_game_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game not found' USING ERRCODE = 'P0002';
  END IF;

  v_is_home := v_game.location_type = 'home'
    OR (v_game.location_type = 'neutral' AND coalesce(v_game.neutral_home_team, 'us') <> 'opponent');
  v_side_bats_on_top := CASE WHEN p_is_opponent THEN v_is_home ELSE NOT v_is_home END;

  IF p_is_opponent THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
        'playerId', ogl.opponent_player_id::text,
        'battingOrder', ogl.batting_order
      ) ORDER BY ogl.batting_order), '[]'::jsonb)
      INTO v_initial_slots
    FROM public.opponent_game_lineups ogl
    WHERE ogl.game_id = p_game_id AND ogl.batting_order IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.game_events ge WHERE ge.game_id = p_game_id
        AND ge.event_type = 'substitution' AND ge.payload ->> 'substitutionType' = 'lineup_extension'
        AND NOT EXISTS (SELECT 1 FROM public.game_events cancelled WHERE cancelled.game_id = ge.game_id
          AND cancelled.event_type = 'event_voided' AND cancelled.payload ->> 'voidedEventId' = ge.id::text
          AND cancelled.payload ->> 'cancelledBeforeSync' = 'true')
        AND coalesce((ge.payload ->> 'isOpponentSubstitution')::boolean, false)
        AND ge.payload ->> 'inPlayerId' = ogl.opponent_player_id::text
        AND ge.payload ->> 'battingOrderPosition' = ogl.batting_order::text);
  ELSE
    SELECT coalesce(jsonb_agg(jsonb_build_object(
        'playerId', gl.player_id::text,
        'battingOrder', gl.batting_order
      ) ORDER BY gl.batting_order), '[]'::jsonb)
      INTO v_initial_slots
    FROM public.game_lineups gl
    WHERE gl.game_id = p_game_id AND gl.batting_order IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.game_events ge WHERE ge.game_id = p_game_id
        AND ge.event_type = 'substitution' AND ge.payload ->> 'substitutionType' = 'lineup_extension'
        AND NOT EXISTS (SELECT 1 FROM public.game_events cancelled WHERE cancelled.game_id = ge.game_id
          AND cancelled.event_type = 'event_voided' AND cancelled.payload ->> 'voidedEventId' = ge.id::text
          AND cancelled.payload ->> 'cancelledBeforeSync' = 'true')
        AND NOT coalesce((ge.payload ->> 'isOpponentSubstitution')::boolean, false)
        AND ge.payload ->> 'inPlayerId' = gl.player_id::text
        AND ge.payload ->> 'battingOrderPosition' = gl.batting_order::text);
  END IF;
  v_slots := v_initial_slots;
  v_next_position := nullif(v_slots -> 0 ->> 'battingOrder', '')::integer;
  v_current_batter_id := nullif(v_slots -> 0 ->> 'playerId', '')::uuid;

  -- Replay only effective events before the proposed write. Reset/revert/void
  -- markers remove their targets from this read model without mutating history.
  FOR v_event IN
    SELECT ge.*
    FROM public.game_events ge
    WHERE ge.game_id = p_game_id AND (ge.sequence_number < p_before_sequence
      OR (ge.event_type = 'event_voided' AND ge.payload ->> 'cancelledBeforeSync' = 'true'))
    ORDER BY ge.sequence_number
  LOOP
    IF v_event.event_type = 'game_reset' THEN
      v_effective_ids := ARRAY[]::uuid[];
    ELSIF v_event.event_type = 'pitch_reverted' THEN
      v_revert_sequence := coalesce((v_event.payload ->> 'revertToSequenceNumber')::integer, 0);
      SELECT coalesce(array_agg(ge.id ORDER BY ge.sequence_number), ARRAY[]::uuid[])
        INTO v_effective_ids
      FROM public.game_events ge
      WHERE ge.game_id = p_game_id
        AND ge.id = ANY(v_effective_ids)
        AND ge.sequence_number <= v_revert_sequence;
    ELSIF v_event.event_type = 'event_voided' THEN
      v_voided_id := nullif(v_event.payload ->> 'voidedEventId', '')::uuid;
      v_effective_ids := array_remove(v_effective_ids, v_voided_id);
    ELSE
      v_effective_ids := array_append(v_effective_ids, v_event.id);
    END IF;
  END LOOP;

  FOR v_event IN
    SELECT ge.*
    FROM public.game_events ge
    WHERE ge.game_id = p_game_id AND ge.id = ANY(v_effective_ids)
    ORDER BY ge.sequence_number
  LOOP
    CASE v_event.event_type
      WHEN 'game_start' THEN
        v_home_leadoff_id := nullif(v_event.payload ->> 'homeLeadoffBatterId', '')::uuid;
        v_away_leadoff_id := nullif(v_event.payload ->> 'awayLeadoffBatterId', '')::uuid;
        v_current_batter_id := CASE WHEN v_side_bats_on_top
          THEN v_away_leadoff_id ELSE v_home_leadoff_id END;
        SELECT (slot.value ->> 'battingOrder')::integer
          INTO v_next_position
        FROM jsonb_array_elements(v_slots) AS slot(value)
        WHERE slot.value ->> 'playerId' = v_current_batter_id::text
        LIMIT 1;
        v_next_position := coalesce(v_next_position, nullif(v_slots -> 0 ->> 'battingOrder', '')::integer);

      WHEN 'pitch_thrown' THEN
        IF v_event.is_top_of_inning = v_side_bats_on_top THEN
          v_current_batter_id := nullif(v_event.payload ->> CASE WHEN p_is_opponent THEN 'opponentBatterId' ELSE 'batterId' END, '')::uuid;
          IF v_current_batter_id IS NULL THEN
            SELECT (slot.value ->> 'playerId')::uuid INTO v_current_batter_id
            FROM jsonb_array_elements(v_slots) slot(value)
            WHERE (slot.value ->> 'battingOrder')::integer = v_next_position
            LIMIT 1;
          END IF;
        END IF;

      WHEN 'substitution' THEN
        IF coalesce((v_event.payload ->> 'isOpponentSubstitution')::boolean, false) = p_is_opponent THEN
          v_out_position := coalesce(
            nullif(v_event.payload ->> 'removedBattingOrderPosition', '')::integer,
            nullif(v_event.payload ->> 'battingOrderPosition', '')::integer
          );
          v_in_position := nullif(v_event.payload ->> 'battingOrderPosition', '')::integer;
          v_runner_id := nullif(v_event.payload ->> 'outPlayerId', '')::uuid;
          v_batter_id := nullif(v_event.payload ->> 'inPlayerId', '')::uuid;

          IF v_event.payload ->> 'substitutionType' = 'lineup_extension'
             AND v_in_position IS NOT NULL AND v_batter_id IS NOT NULL
             AND NOT EXISTS (
               SELECT 1 FROM jsonb_array_elements(v_slots) slot(value)
               WHERE (slot.value ->> 'battingOrder')::integer = v_in_position
             ) THEN
            SELECT max((slot.value ->> 'battingOrder')::integer)
              INTO v_previous_max_position
            FROM jsonb_array_elements(v_slots) slot(value);
            IF v_next_position IS NULL OR (
              v_previous_max_position IS NOT NULL
              AND v_next_position = nullif(v_slots -> 0 ->> 'battingOrder', '')::integer
              AND v_last_completed_position = v_previous_max_position
            ) THEN
              v_next_position := v_in_position;
            END IF;
            v_slots := v_slots || jsonb_build_array(jsonb_build_object(
              'playerId', v_batter_id::text, 'battingOrder', v_in_position
            ));
            SELECT coalesce(jsonb_agg(slot.value ORDER BY (slot.value ->> 'battingOrder')::integer), '[]'::jsonb)
              INTO v_slots
            FROM jsonb_array_elements(v_slots) slot(value);

          ELSIF v_event.payload ->> 'substitutionType' = 'lineup_contraction' THEN
            SELECT (slot.ordinality)::integer
              INTO v_slot_index
            FROM jsonb_array_elements(v_slots) WITH ORDINALITY AS slot(value, ordinality)
            WHERE (slot.value ->> 'battingOrder')::integer = v_out_position
              AND (v_runner_id IS NULL OR slot.value ->> 'playerId' = v_runner_id::text)
            LIMIT 1;
            IF v_slot_index IS NOT NULL THEN
              v_slots := (
                SELECT coalesce(jsonb_agg(slot.value ORDER BY slot.ordinality), '[]'::jsonb)
                FROM jsonb_array_elements(v_slots) WITH ORDINALITY AS slot(value, ordinality)
                WHERE slot.ordinality <> v_slot_index
              );
              IF v_next_position = v_out_position THEN
                SELECT (slot.value ->> 'battingOrder')::integer INTO v_next_position
                FROM jsonb_array_elements(v_slots) WITH ORDINALITY AS slot(value, ordinality)
                WHERE slot.ordinality >= v_slot_index
                ORDER BY slot.ordinality
                LIMIT 1;
                v_next_position := coalesce(v_next_position, nullif(v_slots -> 0 ->> 'battingOrder', '')::integer);
              END IF;
            END IF;

          ELSIF v_batter_id IS NOT NULL AND v_runner_id IS NOT NULL THEN
            SELECT (slot.value ->> 'battingOrder')::integer
              INTO v_in_position
            FROM jsonb_array_elements(v_slots) slot(value)
            WHERE slot.value ->> 'playerId' = v_runner_id::text
            LIMIT 1;
            v_in_position := coalesce(v_in_position, v_out_position);
            IF v_in_position IS NOT NULL THEN
              SELECT coalesce(jsonb_agg(
                CASE WHEN (slot.value ->> 'battingOrder')::integer = v_in_position
                  THEN jsonb_set(slot.value, '{playerId}', to_jsonb(v_batter_id::text), true)
                  ELSE slot.value END
                ORDER BY slot.ordinality), '[]'::jsonb)
                INTO v_slots
              FROM jsonb_array_elements(v_slots) WITH ORDINALITY AS slot(value, ordinality);
            END IF;
            IF v_current_batter_id = v_runner_id THEN v_current_batter_id := v_batter_id; END IF;
            FOR v_slot_index IN 1..3 LOOP
              IF v_runners[v_slot_index] = v_runner_id THEN v_runners[v_slot_index] := v_batter_id; END IF;
            END LOOP;
          END IF;
        ELSE
          -- A pinch runner is a runner-state substitution independent of the
          -- batting side's ordered slots.
          v_runner_id := nullif(v_event.payload ->> 'outPlayerId', '')::uuid;
          v_batter_id := nullif(v_event.payload ->> 'inPlayerId', '')::uuid;
          IF v_runner_id IS NOT NULL AND v_batter_id IS NOT NULL THEN
            FOR v_slot_index IN 1..3 LOOP
              IF v_runners[v_slot_index] = v_runner_id THEN v_runners[v_slot_index] := v_batter_id; END IF;
            END LOOP;
          END IF;
        END IF;

      WHEN 'walk', 'hit_by_pitch', 'catcher_interference', 'field_error' THEN
        IF v_event.is_top_of_inning = v_side_bats_on_top THEN
          v_batter_id := coalesce(
            nullif(v_event.payload ->> CASE WHEN p_is_opponent THEN 'opponentBatterId' ELSE 'batterId' END, '')::uuid,
            v_current_batter_id
          );
          IF v_runners[1] IS NOT NULL AND v_runners[2] IS NOT NULL THEN
            v_runners[3] := v_runners[2];
            v_runners[2] := v_runners[1];
          ELSIF v_runners[1] IS NOT NULL THEN
            v_runners[2] := v_runners[1];
          END IF;
          v_runners[1] := v_batter_id;
        END IF;

      WHEN 'dropped_third_strike' THEN
        IF v_event.is_top_of_inning = v_side_bats_on_top
           AND coalesce(v_event.payload ->> 'outcome', '') <> 'thrown_out' THEN
          v_batter_id := coalesce(
            nullif(v_event.payload ->> CASE WHEN p_is_opponent THEN 'opponentBatterId' ELSE 'batterId' END, '')::uuid,
            v_current_batter_id
          );
          IF v_runners[1] IS NOT NULL AND v_runners[2] IS NOT NULL THEN
            v_runners[3] := v_runners[2];
            v_runners[2] := v_runners[1];
          ELSIF v_runners[1] IS NOT NULL THEN
            v_runners[2] := v_runners[1];
          END IF;
          v_runners[1] := v_batter_id;
        END IF;

      WHEN 'hit' THEN
        IF v_event.is_top_of_inning = v_side_bats_on_top THEN
          v_batter_id := coalesce(
            nullif(v_event.payload ->> CASE WHEN p_is_opponent THEN 'opponentBatterId' ELSE 'batterId' END, '')::uuid,
            v_current_batter_id
          );
          v_hit_bases := CASE v_event.payload ->> 'hitType'
            WHEN 'double' THEN 2 WHEN 'triple' THEN 3 WHEN 'home_run' THEN 4 ELSE 1 END;
          IF v_hit_bases = 4 THEN
            v_runners := ARRAY[NULL::uuid, NULL::uuid, NULL::uuid];
          ELSE
            IF v_hit_bases = 1 THEN
              v_runners[3] := v_runners[2]; v_runners[2] := v_runners[1]; v_runners[1] := v_batter_id;
            ELSIF v_hit_bases = 2 THEN
              v_runners[3] := v_runners[1]; v_runners[2] := v_batter_id; v_runners[1] := NULL;
            ELSE
              v_runners[3] := v_batter_id; v_runners[2] := NULL; v_runners[1] := NULL;
            END IF;
          END IF;
        END IF;

      WHEN 'sacrifice_bunt' THEN
        IF v_event.is_top_of_inning = v_side_bats_on_top THEN
          v_runners := ARRAY[NULL::uuid, v_runners[1], v_runners[2]];
        END IF;
      WHEN 'sacrifice_fly' THEN
        IF v_event.is_top_of_inning = v_side_bats_on_top THEN v_runners[3] := NULL; END IF;
      WHEN 'double_play' THEN
        IF v_event.is_top_of_inning = v_side_bats_on_top THEN
          v_to_base := nullif(v_event.payload ->> 'runnerOutBase', '')::integer;
          IF v_to_base BETWEEN 1 AND 3 THEN v_runners[v_to_base] := NULL; END IF;
        END IF;
      WHEN 'triple_play' THEN
        IF v_event.is_top_of_inning = v_side_bats_on_top THEN v_runners := ARRAY[NULL::uuid, NULL::uuid, NULL::uuid]; END IF;

      WHEN 'baserunner_advance', 'stolen_base' THEN
        v_runner_id := nullif(v_event.payload ->> 'runnerId', '')::uuid;
        v_from_base := nullif(v_event.payload ->> 'fromBase', '')::integer;
        v_to_base := nullif(v_event.payload ->> 'toBase', '')::integer;
        IF v_from_base BETWEEN 1 AND 3 AND v_runners[v_from_base] = v_runner_id THEN v_runners[v_from_base] := NULL; END IF;
        IF v_to_base BETWEEN 1 AND 3 AND v_runner_id IS NOT NULL THEN v_runners[v_to_base] := v_runner_id; END IF;

      WHEN 'baserunner_out' THEN
        v_runner_id := nullif(v_event.payload ->> 'runnerId', '')::uuid;
        FOR v_slot_index IN 1..3 LOOP
          IF v_runners[v_slot_index] = v_runner_id THEN v_runners[v_slot_index] := NULL; END IF;
        END LOOP;
      WHEN 'caught_stealing' THEN
        v_from_base := nullif(v_event.payload ->> 'fromBase', '')::integer;
        IF v_from_base BETWEEN 1 AND 3 THEN v_runners[v_from_base] := NULL; END IF;
      WHEN 'pickoff_attempt' THEN
        IF v_event.payload ->> 'outcome' = 'out' THEN
          v_from_base := nullif(v_event.payload ->> 'base', '')::integer;
          IF v_from_base BETWEEN 1 AND 3 THEN v_runners[v_from_base] := NULL; END IF;
        END IF;
      WHEN 'rundown' THEN
        v_runner_id := nullif(v_event.payload ->> 'runnerId', '')::uuid;
        v_from_base := nullif(v_event.payload ->> 'startBase', '')::integer;
        IF v_from_base BETWEEN 1 AND 3 THEN v_runners[v_from_base] := NULL; END IF;
        IF v_event.payload ->> 'outcome' = 'safe' THEN
          v_to_base := nullif(v_event.payload ->> 'safeAtBase', '')::integer;
          IF v_to_base BETWEEN 1 AND 3 THEN v_runners[v_to_base] := v_runner_id; END IF;
        END IF;
      WHEN 'balk' THEN
        v_runners := ARRAY[NULL::uuid, v_runners[1], v_runners[2]];
      WHEN 'inning_change' THEN
        v_runners := ARRAY[NULL::uuid, NULL::uuid, NULL::uuid];
        v_current_batter_id := CASE WHEN v_event.is_top_of_inning
          THEN v_away_leadoff_id ELSE v_home_leadoff_id END;
      ELSE
        NULL;
    END CASE;

    IF v_event.event_type IN (
      'hit', 'out', 'walk', 'hit_by_pitch', 'strikeout', 'dropped_third_strike',
      'sacrifice_bunt', 'sacrifice_fly', 'field_error', 'catcher_interference',
      'double_play', 'triple_play'
    ) AND v_event.is_top_of_inning = v_side_bats_on_top THEN
      v_last_pa_sequence := v_event.sequence_number;
      SELECT count(*) INTO v_slot_count FROM jsonb_array_elements(v_slots);
      IF v_slot_count > 0 THEN
        SELECT (slot.ordinality)::integer INTO v_slot_index
        FROM jsonb_array_elements(v_slots) WITH ORDINALITY AS slot(value, ordinality)
        WHERE (slot.value ->> 'battingOrder')::integer = v_next_position
        LIMIT 1;
        v_slot_index := coalesce(v_slot_index, 1);
        v_last_completed_position := (v_slots -> (v_slot_index - 1) ->> 'battingOrder')::integer;
        v_slot_index := (v_slot_index % v_slot_count) + 1;
        v_next_position := (v_slots -> (v_slot_index - 1) ->> 'battingOrder')::integer;
        v_current_batter_id := (v_slots -> (v_slot_index - 1) ->> 'playerId')::uuid;
      END IF;
    END IF;
    IF v_event.event_type = 'pitch_thrown' THEN v_last_pitch_sequence := v_event.sequence_number; END IF;
    IF v_event.event_type = 'inning_change' THEN v_last_inning_change_sequence := v_event.sequence_number; END IF;
  END LOOP;

  SELECT count(*) INTO v_slot_count FROM jsonb_array_elements(v_slots);
  SELECT (slot.value ->> 'playerId')::uuid INTO v_active_batter_id
  FROM jsonb_array_elements(v_slots) AS slot(value)
  WHERE (slot.value ->> 'battingOrder')::integer = v_next_position
  LIMIT 1;
  v_is_between := v_last_pitch_sequence IS NULL
    OR v_last_inning_change_sequence > v_last_pitch_sequence
    OR v_last_pa_sequence > v_last_pitch_sequence;

  RETURN jsonb_build_object(
    'slots', v_slots,
    'activeCount', v_slot_count,
    'nextBattingOrderPosition', v_next_position,
    'nextBatterId', v_active_batter_id,
    'runnerIds', to_jsonb(array_remove(v_runners, NULL::uuid)),
    'betweenPlateAppearances', coalesce(v_is_between, true)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.tournament_lineup_state_before_event(uuid, boolean, integer) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_tournament_lineup_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_game public.games%ROWTYPE;
  v_actor uuid := auth.uid();
  v_is_opponent boolean;
  v_substitution_type text;
  v_position_json jsonb;
  v_settings jsonb;
  v_max_batters integer;
  v_position integer;
  v_player_id uuid;
  v_removed_player_id uuid;
  v_state jsonb;
  v_max_recorded_position integer;
  v_effective_slot jsonb;
BEGIN
  IF NEW.event_type <> 'substitution' OR jsonb_typeof(NEW.payload) IS DISTINCT FROM 'object' THEN
    RETURN NEW;
  END IF;
  v_substitution_type := NEW.payload ->> 'substitutionType';
  IF v_substitution_type NOT IN ('lineup_extension', 'lineup_contraction') THEN
    RETURN NEW;
  END IF;

  SELECT g.* INTO v_game
  FROM public.games g
  WHERE g.id = NEW.game_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Game not found' USING ERRCODE = 'P0002'; END IF;
  IF EXISTS (SELECT 1 FROM public.game_events ge WHERE ge.id = NEW.id) THEN
    RETURN NEW; -- idempotent offline replay of the already accepted immutable event
  END IF;
  IF v_game.tournament_id IS NULL THEN RETURN NEW; END IF;
  IF v_game.status <> 'in_progress' OR v_game.scoring_settings_snapshot IS NULL THEN
    RAISE EXCEPTION 'Tournament lineup changes require a started game with frozen rules' USING ERRCODE = '23514';
  END IF;

  IF v_actor IS NULL THEN v_actor := NEW.created_by; END IF;
  IF auth.uid() IS NOT NULL AND NEW.created_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'A lineup event must be created by the signed-in user' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = v_game.team_id AND tm.user_id = v_actor AND tm.is_active
      AND tm.role IN ('head_coach', 'assistant_coach', 'athletic_director')
  ) THEN
    RAISE EXCEPTION 'Only an active team coach can change a tournament lineup' USING ERRCODE = '42501';
  END IF;
  -- A coach may explicitly cancel an unaccepted attempt. Both immutable
  -- facts are recorded atomically; the attempt never affects replay or rows.
  IF EXISTS (SELECT 1 FROM public.game_events cancelled WHERE cancelled.game_id = NEW.game_id
    AND cancelled.event_type = 'event_voided' AND cancelled.payload ->> 'voidedEventId' = NEW.id::text
    AND cancelled.payload ->> 'cancelledBeforeSync' = 'true' AND cancelled.created_by = NEW.created_by) THEN
    RETURN NEW;
  END IF;
  IF NEW.sequence_number <> (SELECT coalesce(max(ge.sequence_number), 0) + 1 FROM public.game_events ge WHERE ge.game_id = NEW.game_id
    AND NOT (ge.sequence_number > NEW.sequence_number AND ge.event_type = 'event_voided'
      AND ge.payload ->> 'cancelledBeforeSync' = 'true')) THEN
    RAISE EXCEPTION 'Tournament lineup changes must sync after all earlier game events' USING ERRCODE = '40001';
  END IF;

  v_settings := v_game.scoring_settings_snapshot -> 'lineup';
  IF jsonb_typeof(v_settings) IS DISTINCT FROM 'object'
     OR jsonb_typeof(v_settings -> 'maxBatters') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'Tournament lineup settings are invalid' USING ERRCODE = '23514';
  END IF;
  v_max_batters := (v_settings ->> 'maxBatters')::integer;
  IF jsonb_typeof(NEW.payload -> 'isOpponentSubstitution') IS NOT NULL
     AND jsonb_typeof(NEW.payload -> 'isOpponentSubstitution') <> 'boolean' THEN
    RAISE EXCEPTION 'The lineup side must be a boolean' USING ERRCODE = '23514';
  END IF;
  v_is_opponent := coalesce((NEW.payload ->> 'isOpponentSubstitution')::boolean, false);
  v_state := public.tournament_lineup_state_before_event(NEW.game_id, v_is_opponent, NEW.sequence_number);
  IF coalesce((v_state ->> 'betweenPlateAppearances')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Tournament lineup changes are only allowed between plate appearances' USING ERRCODE = '23514';
  END IF;

  v_position_json := CASE WHEN v_substitution_type = 'lineup_contraction'
    THEN coalesce(NEW.payload -> 'removedBattingOrderPosition', NEW.payload -> 'battingOrderPosition')
    ELSE NEW.payload -> 'battingOrderPosition' END;
  IF jsonb_typeof(v_position_json) IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'A stable batting-order position is required' USING ERRCODE = '23514';
  END IF;
  IF (v_position_json #>> '{}')::numeric <> trunc((v_position_json #>> '{}')::numeric) THEN
    RAISE EXCEPTION 'The stable batting-order position must be an integer' USING ERRCODE = '23514';
  END IF;
  v_position := (v_position_json #>> '{}')::integer;

  IF v_substitution_type = 'lineup_extension' THEN
    IF coalesce((v_settings ->> 'allowMidGameExtension')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION 'Tournament rules do not allow lineup expansion' USING ERRCODE = '23514';
    END IF;
    IF jsonb_typeof(NEW.payload -> 'inPlayerId') IS DISTINCT FROM 'string'
       OR NEW.payload ? 'outPlayerId'
       OR v_position NOT BETWEEN 1 AND 30 THEN
      RAISE EXCEPTION 'Lineup expansion details are invalid' USING ERRCODE = '23514';
    END IF;
    v_player_id := (NEW.payload ->> 'inPlayerId')::uuid;
    IF (v_state ->> 'activeCount')::integer >= v_max_batters THEN
      RAISE EXCEPTION 'The tournament lineup has reached its % batter limit', v_max_batters USING ERRCODE = '23514';
    END IF;
    IF v_is_opponent THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.opponent_players op
        JOIN public.games g ON g.opponent_team_id = op.opponent_team_id
        WHERE g.id = NEW.game_id AND op.id = v_player_id AND op.is_active
      ) THEN RAISE EXCEPTION 'Opponent batter is not on this game roster' USING ERRCODE = '23514'; END IF;
      SELECT greatest(
        coalesce((SELECT max(ogl.batting_order) FROM public.opponent_game_lineups ogl WHERE ogl.game_id = NEW.game_id), 0),
        coalesce((SELECT max((ge.payload ->> 'battingOrderPosition')::integer)
          FROM public.game_events ge WHERE ge.game_id = NEW.game_id AND ge.event_type = 'substitution'
            AND ge.payload ->> 'substitutionType' = 'lineup_extension'
            AND coalesce((ge.payload ->> 'isOpponentSubstitution')::boolean, false)), 0)
      ) INTO v_max_recorded_position;
      IF EXISTS (SELECT 1 FROM public.opponent_game_lineups ogl WHERE ogl.game_id = NEW.game_id AND ogl.opponent_player_id = v_player_id AND ogl.batting_order IS NOT NULL) THEN
        RAISE EXCEPTION 'This opponent batter already has a historical lineup slot' USING ERRCODE = '23514';
      END IF;
    ELSE
      IF NOT EXISTS (SELECT 1 FROM public.players p WHERE p.id = v_player_id AND p.team_id = v_game.team_id AND p.is_active) THEN
        RAISE EXCEPTION 'Batter is not on this tournament team roster' USING ERRCODE = '23514';
      END IF;
      SELECT greatest(
        coalesce((SELECT max(gl.batting_order) FROM public.game_lineups gl WHERE gl.game_id = NEW.game_id), 0),
        coalesce((SELECT max((ge.payload ->> 'battingOrderPosition')::integer)
          FROM public.game_events ge WHERE ge.game_id = NEW.game_id AND ge.event_type = 'substitution'
            AND ge.payload ->> 'substitutionType' = 'lineup_extension'
            AND NOT coalesce((ge.payload ->> 'isOpponentSubstitution')::boolean, false)), 0)
      ) INTO v_max_recorded_position;
      IF EXISTS (SELECT 1 FROM public.game_lineups gl WHERE gl.game_id = NEW.game_id AND gl.player_id = v_player_id AND gl.batting_order IS NOT NULL) THEN
        RAISE EXCEPTION 'This batter already has a historical lineup slot' USING ERRCODE = '23514';
      END IF;
    END IF;
    IF v_position <> v_max_recorded_position + 1 THEN
      RAISE EXCEPTION 'New batting-order slots must append after the last recorded slot' USING ERRCODE = '23514';
    END IF;

  ELSE
    IF coalesce((v_settings ->> 'allowMidGameContraction')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION 'Tournament rules do not allow lineup contraction' USING ERRCODE = '23514';
    END IF;
    v_removed_player_id := nullif(NEW.payload ->> 'outPlayerId', '')::uuid;
    IF v_removed_player_id IS NULL OR (NEW.payload ? 'removedBattingOrderPosition'
      AND (NEW.payload ->> 'removedBattingOrderPosition')::integer <> v_position) THEN
      RAISE EXCEPTION 'Lineup contraction details are invalid' USING ERRCODE = '23514';
    END IF;
    SELECT slot.value INTO v_effective_slot
    FROM jsonb_array_elements(v_state -> 'slots') slot(value)
    WHERE (slot.value ->> 'battingOrder')::integer = v_position
      AND slot.value ->> 'playerId' = v_removed_player_id::text
    LIMIT 1;
    IF v_effective_slot IS NULL THEN
      RAISE EXCEPTION 'The requested player does not occupy that active stable slot' USING ERRCODE = '23514';
    END IF;
    IF (v_state ->> 'activeCount')::integer <= 1 THEN
      RAISE EXCEPTION 'At least one batter must remain in the lineup' USING ERRCODE = '23514';
    END IF;
    IF v_state ->> 'nextBatterId' = v_removed_player_id::text THEN
      RAISE EXCEPTION 'The active batter cannot be removed from the lineup' USING ERRCODE = '23514';
    END IF;
    IF (v_state -> 'runnerIds') @> to_jsonb(ARRAY[v_removed_player_id::text]) THEN
      RAISE EXCEPTION 'A player on base cannot be removed from the lineup' USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER game_events_guard_tournament_lineup
  BEFORE INSERT ON public.game_events
  FOR EACH ROW EXECUTE FUNCTION public.guard_tournament_lineup_event();

CREATE OR REPLACE FUNCTION public.project_tournament_lineup_extension()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_position integer;
  v_player_id uuid;
BEGIN
  IF NEW.event_type <> 'substitution' OR NEW.payload ->> 'substitutionType' <> 'lineup_extension' THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.games g WHERE g.id = NEW.game_id AND g.tournament_id IS NOT NULL
  ) THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM public.game_events cancelled WHERE cancelled.game_id = NEW.game_id
    AND cancelled.event_type = 'event_voided' AND cancelled.payload ->> 'voidedEventId' = NEW.id::text
    AND cancelled.payload ->> 'cancelledBeforeSync' = 'true') THEN RETURN NEW; END IF;
  v_position := (NEW.payload ->> 'battingOrderPosition')::integer;
  v_player_id := (NEW.payload ->> 'inPlayerId')::uuid;
  IF coalesce((NEW.payload ->> 'isOpponentSubstitution')::boolean, false) THEN
    INSERT INTO public.opponent_game_lineups (game_id, opponent_player_id, batting_order, is_starter)
    VALUES (NEW.game_id, v_player_id, v_position, false)
    ON CONFLICT (game_id, opponent_player_id) DO UPDATE SET batting_order = EXCLUDED.batting_order;
  ELSE
    INSERT INTO public.game_lineups (game_id, player_id, batting_order, starting_position, is_starter)
    VALUES (NEW.game_id, v_player_id, v_position, NULL, false)
    ON CONFLICT (game_id, player_id) DO UPDATE SET batting_order = EXCLUDED.batting_order;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER game_events_project_tournament_lineup_extension
  AFTER INSERT ON public.game_events
  FOR EACH ROW EXECUTE FUNCTION public.project_tournament_lineup_extension();

COMMENT ON FUNCTION public.guard_tournament_lineup_event() IS
  'Serializes and validates tournament lineup extension/contraction events against frozen rules, active slots, baserunners, and team coach membership.';
COMMENT ON FUNCTION public.tournament_lineup_state_before_event(uuid, boolean, integer) IS
  'Replays effective append-only game events into the active tournament batting order, next batter, baserunners, and plate-appearance boundary.';
COMMENT ON FUNCTION public.project_tournament_lineup_extension() IS
  'Projects accepted lineup-extension events into game lineup tables for existing post-game exports and statistics; contractions never delete rows.';
