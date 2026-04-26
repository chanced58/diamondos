-- Patch the live-viewer policy to also grant access to platform admins.
-- Without this, an admin watching a live game receives the SSR-rendered
-- initial state but their browser realtime subscription is rejected
-- (Realtime respects RLS), so events stop appearing live.
--
-- Uses the existing SECURITY DEFINER helper public.is_platform_admin()
-- (see 20260225000022_fix_rls_platform_admin.sql) to avoid the
-- recursive-RLS issue that a direct user_profiles EXISTS would hit.

DROP POLICY IF EXISTS "authorized_viewers_view_live_game_events" ON public.game_events;

CREATE POLICY "authorized_viewers_view_live_game_events"
  ON public.game_events FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      public.is_platform_admin()
      OR EXISTS (
        SELECT 1
        FROM public.games g
        LEFT JOIN public.opponent_teams ot ON ot.id = g.opponent_team_id
        WHERE g.id = public.game_events.game_id
          AND g.status = 'in_progress'
          AND (
            -- parent of a home-team player
            EXISTS (
              SELECT 1
              FROM public.parent_player_links ppl
              JOIN public.players p ON p.id = ppl.player_id
              WHERE ppl.parent_user_id = auth.uid()
                AND p.team_id = g.team_id
            )
            OR
            -- team_member of opponent's linked DiamondOS team
            (ot.linked_team_id IS NOT NULL AND EXISTS (
              SELECT 1
              FROM public.team_members tm
              WHERE tm.team_id = ot.linked_team_id
                AND tm.user_id = auth.uid()
                AND tm.is_active = true
            ))
            OR
            -- parent of an opponent-team player (when opponent is linked)
            (ot.linked_team_id IS NOT NULL AND EXISTS (
              SELECT 1
              FROM public.parent_player_links ppl
              JOIN public.players p ON p.id = ppl.player_id
              WHERE ppl.parent_user_id = auth.uid()
                AND p.team_id = ot.linked_team_id
            ))
          )
      )
    )
  );

COMMENT ON POLICY "authorized_viewers_view_live_game_events" ON public.game_events IS
  'Read access for authenticated viewers with a stake in the live game: platform admins, parents of either team, and team_members of the opponent''s linked DiamondOS team. Home team_members are covered by team_members_view_game_events.';
