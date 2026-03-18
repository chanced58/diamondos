-- Allow scorekeepers to insert game events.
--
-- The original "coaches_insert_game_events" policy used is_coach(), which only
-- covers head_coach and assistant_coach.  Scorekeepers (role = 'scorekeeper')
-- need INSERT on game_events to persist pitch-by-pitch data — without this their
-- upserts were silently rejected by RLS and all progress was lost on navigation.

DROP POLICY IF EXISTS "coaches_insert_game_events" ON public.game_events;

CREATE POLICY "coaches_and_scorekeepers_insert_game_events"
  ON public.game_events FOR INSERT
  WITH CHECK (
    exists (
      select 1
      from public.games g
      join public.team_members tm on tm.team_id = g.team_id
      where g.id = public.game_events.game_id
        and tm.user_id = auth.uid()
        and tm.is_active = true
        and tm.role in ('head_coach', 'assistant_coach', 'athletic_director', 'scorekeeper')
    )
  );
