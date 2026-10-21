-- Restrict the league-admin RPCs to the service role.
--
-- These SECURITY DEFINER functions authorize the caller by checking
-- get_league_role(p_league_id, p_actor) — a caller-supplied user id — not
-- auth.uid(). They were granted to `authenticated` and, through Postgres's
-- default PUBLIC grant, to `anon`, so anyone who knew a league admin's user id
-- could create, transfer or release players, or commit/roll back historical
-- imports, as that admin.
--
-- Every caller is a web server action using the service-role client
-- (league/admin/players/actions.ts, league/admin/import/actions.ts), which
-- resolves the real user from the session cookie and passes it as p_actor. So
-- the fix is to take EXECUTE away from client roles; p_actor stays as the
-- audit/authorization input the trusted server supplies.

REVOKE EXECUTE ON FUNCTION public.fn_create_league_player(
  uuid, text, text, date, smallint, public.player_position, public.bats_throws,
  public.bats_throws, smallint, text, uuid, uuid
) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_transfer_player(
  uuid, uuid, uuid, timestamptz, text, uuid, boolean, uuid
) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_release_player(
  uuid, uuid, timestamptz, text, uuid
) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_create_historical_opponent_team(uuid, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_commit_historical_rosters(uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_commit_historical_player_stats(uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_commit_historical_team_stats(uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_rollback_import_batch(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.fn_create_league_player(
  uuid, text, text, date, smallint, public.player_position, public.bats_throws,
  public.bats_throws, smallint, text, uuid, uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_transfer_player(
  uuid, uuid, uuid, timestamptz, text, uuid, boolean, uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_release_player(
  uuid, uuid, timestamptz, text, uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_create_historical_opponent_team(uuid, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_commit_historical_rosters(uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_commit_historical_player_stats(uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_commit_historical_team_stats(uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_rollback_import_batch(uuid, uuid) TO service_role;
