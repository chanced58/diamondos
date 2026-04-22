-- ============================================================================
-- Tier 5 / Tier 6 — lock search_path on the new trigger functions
-- ============================================================================
--
-- The Supabase security advisor flagged touch_team_integrations_updated_at
-- (Tier 5) and touch_opponent_scouting_tags_updated_at (Tier 6) for mutable
-- search_path — a function-hijacking vector if a malicious schema precedes
-- `public` in the role's search_path.
--
-- This was applied to the prod database directly while reviewing Tier 6;
-- the file below ensures `supabase db reset` (and any new environment) ends
-- up in the same state as prod. Idempotent — ALTER FUNCTION ... SET is
-- safe to run repeatedly.

alter function public.touch_team_integrations_updated_at()
  set search_path = public, pg_temp;

alter function public.touch_opponent_scouting_tags_updated_at()
  set search_path = public, pg_temp;
