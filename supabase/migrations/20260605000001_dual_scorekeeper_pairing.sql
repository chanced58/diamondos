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
  -- Home-coach overrides: array of { conflictIndex, useAwayValue } records.
  -- Empty array means the home (canonical) value stands for every conflict.
  resolved_overrides jsonb not null default '[]'::jsonb,
  computed_at   timestamptz not null default now(),
  computed_by   uuid references auth.users(id),
  resolved_at   timestamptz,
  resolved_by   uuid references auth.users(id),
  unique (home_game_id),
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

-- Only the home team's coach may write/override the reconciliation row.
CREATE POLICY "home_coach_write_reconciliation"
  ON public.game_reconciliations FOR ALL
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
