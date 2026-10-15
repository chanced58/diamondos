-- A direct lineup write must not bypass caps or rewrite started-game history.
CREATE OR REPLACE FUNCTION public.guard_tournament_lineup_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row jsonb := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  v_game public.games%ROWTYPE;
  v_player_id text;
  v_position integer;
  v_count integer;
  v_cap integer;
  v_is_opponent boolean := TG_TABLE_NAME = 'opponent_game_lineups';
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.game_id IS DISTINCT FROM NEW.game_id AND EXISTS (
    SELECT 1 FROM public.games g WHERE g.id = OLD.game_id AND g.tournament_id IS NOT NULL AND g.status <> 'scheduled'
  ) THEN
    RAISE EXCEPTION 'Started tournament lineup rows cannot move to another game' USING ERRCODE = '23514';
  END IF;
  SELECT g.* INTO v_game FROM public.games g WHERE g.id = (v_row ->> 'game_id')::uuid FOR UPDATE;
  IF v_game.tournament_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  v_player_id := v_row ->> (CASE WHEN v_is_opponent THEN 'opponent_player_id' ELSE 'player_id' END);
  v_position := (v_row ->> 'batting_order')::integer;
  IF v_game.status <> 'scheduled' THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Tournament batting slots must be removed through lineup events' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.game_id = NEW.game_id
      AND to_jsonb(OLD) ->> (CASE WHEN v_is_opponent THEN 'opponent_player_id' ELSE 'player_id' END) = v_player_id
      AND OLD.batting_order IS NOT DISTINCT FROM NEW.batting_order THEN RETURN NEW; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.game_events ge WHERE ge.game_id = v_game.id
      AND ge.event_type = 'substitution' AND ge.payload ->> 'substitutionType' = 'lineup_extension'
      AND coalesce((ge.payload ->> 'isOpponentSubstitution')::boolean, false) = v_is_opponent
      AND ge.payload ->> 'inPlayerId' = v_player_id
      AND ge.payload ->> 'battingOrderPosition' = v_position::text
      AND NOT EXISTS (SELECT 1 FROM public.game_events cancelled WHERE cancelled.game_id = ge.game_id
        AND cancelled.event_type = 'event_voided' AND cancelled.payload ->> 'voidedEventId' = ge.id::text
        AND cancelled.payload ->> 'cancelledBeforeSync' = 'true')) THEN
      RAISE EXCEPTION 'Started tournament lineup changes require an accepted lineup event' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF v_position IS NULL THEN RETURN NEW; END IF;
  SELECT coalesce(v_game.scoring_settings_snapshot, t.scoring_settings) -> 'lineup' ->> 'maxBatters'
    INTO v_cap FROM public.tournaments t WHERE t.id = v_game.tournament_id;
  IF v_is_opponent THEN
    SELECT count(*) INTO v_count FROM public.opponent_game_lineups l
    WHERE l.game_id = v_game.id AND l.batting_order IS NOT NULL AND l.id <> NEW.id;
  ELSE
    SELECT count(*) INTO v_count FROM public.game_lineups l
    WHERE l.game_id = v_game.id AND l.batting_order IS NOT NULL AND l.id <> NEW.id;
  END IF;
  IF v_cap IS NULL OR v_position NOT BETWEEN 1 AND v_cap OR v_count >= v_cap THEN
    RAISE EXCEPTION 'The initial tournament lineup exceeds its batter cap' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER game_lineups_guard_tournament_rows
  BEFORE INSERT OR UPDATE OR DELETE ON public.game_lineups FOR EACH ROW
  EXECUTE FUNCTION public.guard_tournament_lineup_row();
CREATE TRIGGER opponent_game_lineups_guard_tournament_rows
  BEFORE INSERT OR UPDATE OR DELETE ON public.opponent_game_lineups FOR EACH ROW
  EXECUTE FUNCTION public.guard_tournament_lineup_row();

CREATE OR REPLACE FUNCTION public.guard_tournament_game_rules_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.tournament_id IS NOT NULL AND (NEW.status <> 'scheduled' OR NEW.scoring_settings_snapshot IS NOT NULL) THEN
      RAISE EXCEPTION 'Tournament games must be created scheduled and started through the game-start transaction' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.tournament_id IS NOT NULL AND OLD.scoring_settings_snapshot IS NOT NULL
    AND (NEW.tournament_id IS DISTINCT FROM OLD.tournament_id OR NEW.team_id IS DISTINCT FROM OLD.team_id
      OR NEW.season_id IS DISTINCT FROM OLD.season_id) THEN
    RAISE EXCEPTION 'A started tournament game cannot change its tournament, team, or season' USING ERRCODE = '23514';
  END IF;
  IF NEW.tournament_id IS NOT NULL AND NEW.status = 'in_progress' AND NEW.scoring_settings_snapshot IS NULL THEN
    RAISE EXCEPTION 'Tournament rules must be frozen by the game-start transaction before scoring' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER games_guard_tournament_rules_transition
  BEFORE INSERT OR UPDATE OF status, team_id, season_id, tournament_id, scoring_settings_snapshot ON public.games
  FOR EACH ROW EXECUTE FUNCTION public.guard_tournament_game_rules_transition();
