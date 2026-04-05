-- Allow opponent_teams to be league members alongside platform teams.
-- Exactly one of team_id / opponent_team_id must be non-null per row.

-- 1. Make team_id nullable (existing rows all have team_id, so no data issue)
ALTER TABLE public.league_members
  ALTER COLUMN team_id DROP NOT NULL;

-- 2. Add opponent_team_id column
ALTER TABLE public.league_members
  ADD COLUMN opponent_team_id uuid REFERENCES public.opponent_teams(id) ON DELETE CASCADE;

-- 3. CHECK: exactly one of team_id / opponent_team_id is set
ALTER TABLE public.league_members
  ADD CONSTRAINT chk_league_members_one_team
  CHECK (
    (team_id IS NOT NULL AND opponent_team_id IS NULL)
    OR (team_id IS NULL AND opponent_team_id IS NOT NULL)
  );

-- 4. Replace the UNIQUE constraint with partial unique indexes
--    (NULLs are not considered equal in PostgreSQL unique constraints)
ALTER TABLE public.league_members
  DROP CONSTRAINT league_members_league_id_team_id_key;

CREATE UNIQUE INDEX uq_league_members_team
  ON public.league_members (league_id, team_id)
  WHERE team_id IS NOT NULL;

CREATE UNIQUE INDEX uq_league_members_opponent_team
  ON public.league_members (league_id, opponent_team_id)
  WHERE opponent_team_id IS NOT NULL;

-- 5. Index for opponent_team_id lookups
CREATE INDEX idx_league_members_opponent_team_id
  ON public.league_members(opponent_team_id);

-- 6. RLS: allow league members to view opponent_teams that are in their league
CREATE POLICY "league_members_view_league_opponent_teams"
  ON public.opponent_teams FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.league_members lm_opp
      JOIN public.league_members lm_user
        ON lm_user.league_id = lm_opp.league_id
        AND lm_user.team_id IS NOT NULL
        AND lm_user.is_active = true
      JOIN public.team_members tm
        ON tm.team_id = lm_user.team_id
        AND tm.user_id = auth.uid()
        AND tm.is_active = true
      WHERE lm_opp.opponent_team_id = public.opponent_teams.id
        AND lm_opp.is_active = true
    )
    OR public.is_platform_admin()
  );

-- 7. RLS: allow league members to view opponent_players for league opponent teams
CREATE POLICY "league_members_view_league_opponent_players"
  ON public.opponent_players FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.league_members lm_opp
      JOIN public.league_members lm_user
        ON lm_user.league_id = lm_opp.league_id
        AND lm_user.team_id IS NOT NULL
        AND lm_user.is_active = true
      JOIN public.team_members tm
        ON tm.team_id = lm_user.team_id
        AND tm.user_id = auth.uid()
        AND tm.is_active = true
      WHERE lm_opp.opponent_team_id = public.opponent_players.opponent_team_id
        AND lm_opp.is_active = true
    )
    OR public.is_platform_admin()
  );
