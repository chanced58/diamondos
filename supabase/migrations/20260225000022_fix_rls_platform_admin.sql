-- ============================================================
-- Migration: Fix infinite recursion in platform admin RLS policies
-- ============================================================
--
-- Root cause:
--   The "platform_admin_view_all_profiles" policy on user_profiles does a
--   subquery against user_profiles itself:
--
--     EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_platform_admin = true)
--
--   When a user has is_platform_admin=true, PostgreSQL must fetch that user's
--   row to evaluate the EXISTS condition. Fetching a user_profiles row triggers
--   the same RLS policy again → infinite recursion →
--   "infinite recursion detected in policy for relation user_profiles"
--
--   The other two policies (on teams and team_members) also subquery
--   user_profiles, which triggers the same recursive chain.
--
-- Fix:
--   Create a SECURITY DEFINER helper function that reads user_profiles
--   WITHOUT applying RLS (because SECURITY DEFINER runs as the function
--   owner, not the calling user). Replace all three inline subqueries with
--   a call to this function.
-- ============================================================

-- 1. Create the SECURITY DEFINER helper
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid() AND is_platform_admin = true
  );
$$;

-- 2. Recreate platform_admin_view_all_teams (no subquery on user_profiles)
DROP POLICY IF EXISTS "platform_admin_view_all_teams" ON public.teams;
CREATE POLICY "platform_admin_view_all_teams"
  ON public.teams FOR SELECT
  USING (public.is_platform_admin());

-- 3. Recreate platform_admin_view_all_profiles (was self-referential — now safe)
DROP POLICY IF EXISTS "platform_admin_view_all_profiles" ON public.user_profiles;
CREATE POLICY "platform_admin_view_all_profiles"
  ON public.user_profiles FOR SELECT
  USING (public.is_platform_admin());

-- 4. Recreate platform_admin_view_all_team_members
DROP POLICY IF EXISTS "platform_admin_view_all_team_members" ON public.team_members;
CREATE POLICY "platform_admin_view_all_team_members"
  ON public.team_members FOR SELECT
  USING (public.is_platform_admin());
