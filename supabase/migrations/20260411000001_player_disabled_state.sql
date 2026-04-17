-- Add disabled_at and disabled_by columns to players for audit trail
ALTER TABLE public.players ADD COLUMN disabled_at TIMESTAMPTZ;
ALTER TABLE public.players ADD COLUMN disabled_by UUID REFERENCES auth.users(id);

-- Helper: check if user is a league admin for any league containing this team
CREATE OR REPLACE FUNCTION public.is_league_admin_for_team(p_team_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.league_members lm
    JOIN public.league_staff ls ON ls.league_id = lm.league_id
    WHERE lm.team_id = p_team_id
      AND ls.user_id = p_user_id
      AND ls.role = 'league_admin'
      AND ls.is_active = true
      AND lm.is_active = true
  );
$$;

-- Allow league admins to update players on teams in their league
CREATE POLICY "league_admin_update_players"
  ON public.players FOR UPDATE
  USING (
    team_id IS NOT NULL AND public.is_league_admin_for_team(team_id, auth.uid())
  );

-- Allow league admins to view players on teams in their league
CREATE POLICY "league_admin_view_players"
  ON public.players FOR SELECT
  USING (
    team_id IS NOT NULL AND public.is_league_admin_for_team(team_id, auth.uid())
  );
