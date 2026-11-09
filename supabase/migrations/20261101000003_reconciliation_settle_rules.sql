-- Reconciliation settle rules.
--
-- Before: set_reconciliation_override stored only "use the away value"
-- choices (a home choice deleted the key) and set resolved_at on any single
-- choice, so one click marked the whole reconciliation settled while other
-- players were still undecided.
--
-- Now every choice is recorded as an override — `useAwayValue` true for the
-- away book's value, false for the home book's — so keeping the home value
-- counts as a decision. The function no longer touches resolved_at /
-- resolved_by: the service (resolveReconciliationConflict) sets them after
-- writing, only once every conflict group (each line-score conflict, each
-- player) has a decision, and clears them while any is open, since grouping
-- by player lives in @baseball/shared.
--
-- Same signature, so no generated-type change. p_resolved_by is kept for
-- callers; who settled is recorded with resolved_at by the service.

CREATE OR REPLACE FUNCTION public.set_reconciliation_override(
  p_reconciliation_id uuid,
  p_key text,
  p_use_away boolean,
  p_resolved_by uuid
)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE public.game_reconciliations
  SET resolved_overrides =
        (
          SELECT coalesce(jsonb_agg(elem), '[]'::jsonb)
          FROM jsonb_array_elements(resolved_overrides) AS elem
          WHERE elem ->> 'key' IS DISTINCT FROM p_key
        )
        || jsonb_build_array(jsonb_build_object('key', p_key, 'useAwayValue', p_use_away))
  WHERE id = p_reconciliation_id;
$$;

-- Only the trusted server flow (service-role) may invoke the override mutator.
REVOKE EXECUTE ON FUNCTION public.set_reconciliation_override(uuid, text, boolean, uuid)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_reconciliation_override(uuid, text, boolean, uuid)
  TO service_role;
