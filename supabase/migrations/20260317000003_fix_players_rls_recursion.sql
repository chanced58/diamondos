-- Fix infinite RLS recursion between players and player_team_memberships.
--
-- Recursion chain:
--   game_events INSERT (RETURNING *) → players_view_own_game_events policy reads players
--   → team_members_view_players policy reads player_team_memberships
--   → team_members_view_ptm policy reads back players ("or if YOU are the player")
--   → team_members_view_players fires again → infinite loop (42P17)
--
-- Fix: extract the "is this user the owner of this player record?" check into a
-- SECURITY DEFINER function that bypasses RLS on players, breaking the cycle.

CREATE OR REPLACE FUNCTION public.is_player_owner(p_player_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.players
    WHERE id = p_player_id
      AND user_id = p_user_id
  );
$$;

-- Rebuild team_members_view_ptm using the new function instead of the direct
-- players subquery, which was the source of the recursion.
DROP POLICY IF EXISTS "team_members_view_ptm" ON public.player_team_memberships;

CREATE POLICY "team_members_view_ptm"
  ON public.player_team_memberships FOR SELECT
  USING (
    -- Team members can view their team's player memberships
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = public.player_team_memberships.team_id
        AND tm.user_id = auth.uid()
        AND tm.is_active = true
    )
    -- Or if YOU are the player (via SECURITY DEFINER to avoid recursion through players RLS)
    OR public.is_player_owner(public.player_team_memberships.player_id, auth.uid())
    -- Or platform admin
    OR public.is_platform_admin()
  );
