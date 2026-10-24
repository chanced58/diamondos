-- Fix infinite recursion in the league_channel_members SELECT policy.
--
-- league_channel_members_view_co_members checked "can the user see this
-- row?" by querying league_channel_members itself, which applied the same
-- policy again: Postgres stops with 42P17 (infinite recursion). Every RLS
-- check that reads league_channel_members fails with it for anyone but a
-- platform admin, including posting (league_channel_members_post_messages),
-- reading league messages, and so their Realtime delivery.
--
-- Fix, as 20260323000001 did for team channel_members: a SECURITY DEFINER
-- helper that checks membership without RLS, breaking the cycle.

CREATE OR REPLACE FUNCTION public.is_league_channel_member(p_league_channel_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.league_channel_members
    WHERE league_channel_id = p_league_channel_id
      AND user_id = p_user_id
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_league_channel_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_league_channel_member(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "league_channel_members_view_co_members" ON public.league_channel_members;

CREATE POLICY "league_channel_members_view_co_members"
  ON public.league_channel_members FOR SELECT
  USING (public.is_league_channel_member(league_channel_id, auth.uid()) OR public.is_platform_admin());
