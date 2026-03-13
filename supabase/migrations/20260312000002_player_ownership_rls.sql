-- RLS policies for player-owned identity tables
-- Updates existing player policies to work with player_team_memberships
-- and adds policies for the new tables.

-- ─── Enable RLS on new tables ──────────────────────────────────────────────────

ALTER TABLE public.player_team_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_transfers ENABLE ROW LEVEL SECURITY;


-- ─── players: update policies for nullable team_id ─────────────────────────────

-- Replace the existing policy that checks players.team_id directly.
-- Now checks through player_team_memberships OR if the user IS the player.
DROP POLICY IF EXISTS "team_members_view_players" ON public.players;
CREATE POLICY "team_members_view_players"
  ON public.players FOR SELECT
  USING (
    -- Can view if you're on any team this player is/was on
    EXISTS (
      SELECT 1 FROM public.player_team_memberships ptm
      JOIN public.team_members tm ON tm.team_id = ptm.team_id
      WHERE ptm.player_id = public.players.id
        AND tm.user_id = auth.uid()
        AND tm.is_active = true
    )
    -- Or if YOU are the player
    OR user_id = auth.uid()
    -- Or platform admin
    OR public.is_platform_admin()
  );

-- Coaches can insert players if team_id matches a team they coach
-- (team_id may be NULL for transferred-away players, but new inserts always have team_id)
DROP POLICY IF EXISTS "coaches_manage_players" ON public.players;
CREATE POLICY "coaches_manage_players"
  ON public.players FOR INSERT
  WITH CHECK (
    team_id IS NOT NULL AND public.is_coach(team_id, auth.uid())
  );

-- Coaches can update players that are currently on their team
DROP POLICY IF EXISTS "coaches_update_players" ON public.players;
CREATE POLICY "coaches_update_players"
  ON public.players FOR UPDATE
  USING (
    -- Coach of the player's current team
    (team_id IS NOT NULL AND public.is_coach(team_id, auth.uid()))
    -- OR coach of any active membership team
    OR EXISTS (
      SELECT 1 FROM public.player_team_memberships ptm
      WHERE ptm.player_id = public.players.id
        AND ptm.is_active = true
        AND public.is_coach(ptm.team_id, auth.uid())
    )
  );


-- ─── parent_player_links: update coaches policy to use memberships ─────────────

DROP POLICY IF EXISTS "coaches_view_player_links" ON public.parent_player_links;
CREATE POLICY "coaches_view_player_links"
  ON public.parent_player_links FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.player_team_memberships ptm
      JOIN public.team_members tm ON tm.team_id = ptm.team_id
      WHERE ptm.player_id = public.parent_player_links.player_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('head_coach', 'assistant_coach', 'athletic_director')
        AND tm.is_active = true
    )
  );


-- ─── player_team_memberships ───────────────────────────────────────────────────

-- Team members can view their team's player memberships
CREATE POLICY "team_members_view_ptm"
  ON public.player_team_memberships FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = public.player_team_memberships.team_id
        AND tm.user_id = auth.uid()
        AND tm.is_active = true
    )
    -- Or if YOU are the player
    OR EXISTS (
      SELECT 1 FROM public.players p
      WHERE p.id = public.player_team_memberships.player_id
        AND p.user_id = auth.uid()
    )
    -- Or platform admin
    OR public.is_platform_admin()
  );

-- Coaches can manage memberships for their team
CREATE POLICY "coaches_manage_ptm"
  ON public.player_team_memberships FOR INSERT
  WITH CHECK (public.is_coach(team_id, auth.uid()));

CREATE POLICY "coaches_update_ptm"
  ON public.player_team_memberships FOR UPDATE
  USING (public.is_coach(team_id, auth.uid()));


-- ─── player_transfers ──────────────────────────────────────────────────────────

-- Viewable by coaches of either team, or the player themselves
CREATE POLICY "view_player_transfers"
  ON public.player_transfers FOR SELECT
  USING (
    (from_team_id IS NOT NULL AND public.is_coach(from_team_id, auth.uid()))
    OR (to_team_id IS NOT NULL AND public.is_coach(to_team_id, auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.players p
      WHERE p.id = public.player_transfers.player_id
        AND p.user_id = auth.uid()
    )
    OR public.is_platform_admin()
  );

-- Coaches can create transfer records (from their team or to their team)
CREATE POLICY "coaches_create_transfers"
  ON public.player_transfers FOR INSERT
  WITH CHECK (
    (from_team_id IS NOT NULL AND public.is_coach(from_team_id, auth.uid()))
    OR (to_team_id IS NOT NULL AND public.is_coach(to_team_id, auth.uid()))
  );
