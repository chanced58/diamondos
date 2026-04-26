-- Restrict live game-event viewing to registered players & parents on the system.
--
-- Replaces the wide-open `public_view_events_for_live_games` policy (which let
-- anonymous visitors read events for any in-progress game) with an
-- authenticated-only policy. Authorized viewers are:
--   • home team_member (already covered by `team_members_view_game_events`)
--   • parent of a home-team player
--   • opponent team_member (only when opponent_teams.linked_team_id is set,
--     i.e. the opponent is a real DiamondOS team)
--   • parent of an opponent-team player (linked-team players)
--
-- Realtime in Supabase respects RLS, so any matching viewer will receive
-- INSERTs over the realtime channel without further work.

DROP POLICY IF EXISTS "public_view_events_for_live_games" ON public.game_events;

CREATE POLICY "authorized_viewers_view_live_game_events"
  ON public.game_events FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
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
  );

COMMENT ON POLICY "authorized_viewers_view_live_game_events" ON public.game_events IS
  'Read access for authenticated viewers with a stake in the live game: parents of either team and team_members of the opponent''s linked DiamondOS team. Home team_members are covered by team_members_view_game_events.';
