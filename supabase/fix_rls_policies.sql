-- ============================================================================
-- FIX: RLS policies for team creation flow
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ============================================================================

-- ─── 1. Fix team_members SELECT policy (infinite recursion) ─────────────────
-- The old policy queries team_members from within itself, causing recursion.
-- The fix uses get_team_role() which is SECURITY DEFINER (bypasses RLS).
DROP POLICY IF EXISTS "team_members_view_membership" ON public.team_members;
CREATE POLICY "team_members_view_membership"
  ON public.team_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.get_team_role(team_id, auth.uid()) IS NOT NULL
  );

-- ─── 2. Fix channel_members SELECT policy (same recursion bug) ──────────────
-- The old policy queries channel_members from within itself.
DROP POLICY IF EXISTS "channel_members_view_membership" ON public.channel_members;
CREATE POLICY "channel_members_view_membership"
  ON public.channel_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.channels c
      WHERE c.id = public.channel_members.channel_id
        AND public.is_coach(c.team_id, auth.uid())
    )
  );

-- ─── 3. INSERT policy: teams ────────────────────────────────────────────────
-- Any authenticated user can create a team (they become the owner via created_by).
DROP POLICY IF EXISTS "authenticated_users_create_teams" ON public.teams;
CREATE POLICY "authenticated_users_create_teams"
  ON public.teams FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND created_by = auth.uid());

-- ─── 4. INSERT policy: team_members ─────────────────────────────────────────
-- A user can insert themselves as a member (used during team creation).
DROP POLICY IF EXISTS "users_insert_own_membership" ON public.team_members;
CREATE POLICY "users_insert_own_membership"
  ON public.team_members FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- ─── 5. INSERT policy: channels ─────────────────────────────────────────────
-- A coach can create channels for their team.
-- Note: coaches_manage_channels (FOR ALL) already exists but uses is_coach(),
-- which checks team_members. At team creation time, the user just inserted
-- themselves as head_coach, so is_coach() should work. But let's also allow
-- the team creator to create channels.
DROP POLICY IF EXISTS "coaches_insert_channels" ON public.channels;
CREATE POLICY "coaches_insert_channels"
  ON public.channels FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND created_by = auth.uid()
    AND public.is_coach(team_id, auth.uid())
  );

-- ─── 6. INSERT policy: channel_members ──────────────────────────────────────
-- A user can add themselves to a channel.
DROP POLICY IF EXISTS "users_insert_own_channel_membership" ON public.channel_members;
CREATE POLICY "users_insert_own_channel_membership"
  ON public.channel_members FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- ─── Verify ─────────────────────────────────────────────────────────────────
-- List all policies to confirm they were created:
SELECT schemaname, tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('teams', 'team_members', 'channels', 'channel_members')
ORDER BY tablename, policyname;
