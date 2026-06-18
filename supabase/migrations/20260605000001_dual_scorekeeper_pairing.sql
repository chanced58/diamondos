-- Dual scorekeeper: pair two teams' games and store end-of-game reconciliation.
--
-- When a league enables scoring_settings.scorekeeping.dualScorekeeper, both
-- teams keep their OWN games row + immutable game_events log (no cross-team
-- writes). The two rows are linked via games.paired_game_id. After both games
-- are marked done, the home team's coach reconciles the two logs; the home
-- log is canonical by default. Reconciliation output lives in
-- game_reconciliations (one row per matchup, keyed on the home game).

-- 1. Link a game to its mirror, and record which side this row scores.
ALTER TABLE public.games
  ADD COLUMN paired_game_id uuid REFERENCES public.games(id) ON DELETE SET NULL,
  ADD COLUMN scorer_side text CHECK (scorer_side IN ('home', 'away'));

COMMENT ON COLUMN public.games.paired_game_id IS
  'Dual scorekeeper: the opposing team''s parallel game row for the same '
  'real-world matchup. NULL for normal single-scorer games.';
COMMENT ON COLUMN public.games.scorer_side IS
  'Dual scorekeeper: which side this row''s owning team is scoring '
  '(home = canonical). NULL for normal single-scorer games.';

-- A game pairs to at most one mirror.
CREATE UNIQUE INDEX games_paired_game_id_key
  ON public.games (paired_game_id)
  WHERE paired_game_id IS NOT NULL;

-- 2. Reconciliation result, computed once both paired games are completed.
CREATE TABLE public.game_reconciliations (
  id            uuid primary key default gen_random_uuid(),
  home_game_id  uuid not null references public.games(id) on delete cascade,
  away_game_id  uuid not null references public.games(id) on delete cascade,
  conflicts     jsonb not null default '[]'::jsonb,
  -- Home-coach overrides: array of { key, useAwayValue } records keyed by a
  -- stable conflict identity. Empty array means the home (canonical) value
  -- stands for every conflict.
  resolved_overrides jsonb not null default '[]'::jsonb,
  computed_at   timestamptz not null default now(),
  computed_by   uuid references auth.users(id),
  resolved_at   timestamptz,
  resolved_by   uuid references auth.users(id),
  unique (home_game_id),
  unique (away_game_id),
  CONSTRAINT game_reconciliations_distinct_games
    CHECK (home_game_id <> away_game_id),
  CONSTRAINT game_reconciliations_conflicts_is_array
    CHECK (jsonb_typeof(conflicts) = 'array'),
  CONSTRAINT game_reconciliations_overrides_is_array
    CHECK (jsonb_typeof(resolved_overrides) = 'array')
);

COMMENT ON TABLE public.game_reconciliations IS
  'Dual scorekeeper: diff between the home (canonical) and away score logs for '
  'a paired matchup. Computed at game-done; conflicts shown to both teams, '
  'overridable only by the home team coach.';

ALTER TABLE public.game_reconciliations ENABLE ROW LEVEL SECURITY;

-- Helper: members of either paired team may read the reconciliation row.
CREATE POLICY "paired_team_members_view_reconciliation"
  ON public.game_reconciliations FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.games hg
      JOIN public.games ag ON ag.id = public.game_reconciliations.away_game_id
      WHERE hg.id = public.game_reconciliations.home_game_id
        AND (
          EXISTS (
            SELECT 1 FROM public.team_members tm
            WHERE tm.team_id IN (hg.team_id, ag.team_id)
              AND tm.user_id = auth.uid()
              AND tm.is_active = true
          )
          OR public.is_platform_admin()
        )
    )
  );

-- Only the home team's coach may override (UPDATE) the reconciliation row.
-- The server computes/INSERTs rows with the service-role key (RLS-exempt), so
-- direct client INSERT/DELETE is never needed — restrict to UPDATE for least
-- privilege (a coach cannot fabricate or drop reconciliation rows).
CREATE POLICY "home_coach_write_reconciliation"
  ON public.game_reconciliations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.games hg
      WHERE hg.id = public.game_reconciliations.home_game_id
        AND (public.is_coach(hg.team_id, auth.uid()) OR public.is_platform_admin())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.games hg
      WHERE hg.id = public.game_reconciliations.home_game_id
        AND (public.is_coach(hg.team_id, auth.uid()) OR public.is_platform_admin())
    )
  );

-- Atomically set (or clear) a single home-coach override on a reconciliation
-- row, keyed by stable conflict identity. Doing the filter-then-append in one
-- UPDATE avoids the read-modify-write race that a JS-side array rebuild has
-- (two near-simultaneous submissions could otherwise drop each other's edit).
-- Authorization is enforced by the caller (server action, service-role) before
-- invoking this; the function only mutates resolved_overrides + resolved_*.
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
        || CASE
             WHEN p_use_away
               THEN jsonb_build_array(jsonb_build_object('key', p_key, 'useAwayValue', true))
             ELSE '[]'::jsonb
           END,
      resolved_at = now(),
      resolved_by = p_resolved_by
  WHERE id = p_reconciliation_id;
$$;
