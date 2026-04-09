-- Allow league admins to create and manage opponent teams directly.
-- Previously opponent_teams required a team_id (owned by a platform team).
-- Now they can also be owned by a league (league_id set, team_id null).

-- 1. Make team_id nullable (league-created teams won't have one)
ALTER TABLE public.opponent_teams
  ALTER COLUMN team_id DROP NOT NULL;

-- 2. Add league_id for league-owned opponent teams
ALTER TABLE public.opponent_teams
  ADD COLUMN league_id uuid REFERENCES public.leagues(id) ON DELETE SET NULL;

-- 3. Add linked_team_id for future conversion to a platform team
ALTER TABLE public.opponent_teams
  ADD COLUMN linked_team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL;

-- 4. Add stats_visible toggle (controls whether full stats are exposed beyond opponent context)
ALTER TABLE public.opponent_teams
  ADD COLUMN stats_visible boolean NOT NULL DEFAULT false;

-- 5. CHECK: exactly one owner (team_id XOR league_id) must be set
ALTER TABLE public.opponent_teams
  ADD CONSTRAINT chk_opponent_teams_owner
  CHECK (
    (team_id IS NOT NULL AND league_id IS NULL)
    OR (team_id IS NULL AND league_id IS NOT NULL)
  );

-- 6. Index on league_id for league-scoped queries
CREATE INDEX idx_opponent_teams_league_id
  ON public.opponent_teams(league_id)
  WHERE league_id IS NOT NULL;

-- ─── Helper: is_league_admin ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_league_admin(p_league_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.league_staff
    WHERE league_id = p_league_id
      AND user_id = p_user_id
      AND role = 'league_admin'
      AND is_active = true
  );
$$;

-- ─── RLS for league staff ────────────────────────────────────────────────────

-- League staff can view opponent teams owned by their league
CREATE POLICY "league_staff_view_opponent_teams"
  ON public.opponent_teams FOR SELECT
  USING (
    league_id IS NOT NULL
    AND public.is_league_staff(league_id, auth.uid())
  );

-- League admins can create/update/delete opponent teams owned by their league
CREATE POLICY "league_admin_manage_opponent_teams"
  ON public.opponent_teams FOR ALL
  USING (
    league_id IS NOT NULL
    AND public.is_league_admin(league_id, auth.uid())
  )
  WITH CHECK (
    league_id IS NOT NULL
    AND public.is_league_admin(league_id, auth.uid())
  );

-- League staff can view opponent players belonging to league-owned opponent teams
CREATE POLICY "league_staff_view_opponent_players"
  ON public.opponent_players FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.opponent_teams ot
      WHERE ot.id = public.opponent_players.opponent_team_id
        AND ot.league_id IS NOT NULL
        AND public.is_league_staff(ot.league_id, auth.uid())
    )
  );

-- League admins can manage opponent players belonging to league-owned opponent teams
CREATE POLICY "league_admin_manage_opponent_players"
  ON public.opponent_players FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.opponent_teams ot
      WHERE ot.id = public.opponent_players.opponent_team_id
        AND ot.league_id IS NOT NULL
        AND public.is_league_admin(ot.league_id, auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.opponent_teams ot
      WHERE ot.id = public.opponent_players.opponent_team_id
        AND ot.league_id IS NOT NULL
        AND public.is_league_admin(ot.league_id, auth.uid())
    )
  );

-- Platform admins can manage all opponent teams
CREATE POLICY "platform_admins_manage_opponent_teams"
  ON public.opponent_teams FOR ALL
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());
