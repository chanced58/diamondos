-- Tighten league_members UPDATE and DELETE to require league_admin role
-- (not just any league_staff). League managers can still INSERT (add teams)
-- but cannot toggle active status or permanently remove teams.

DROP POLICY IF EXISTS "league_staff_or_admin_update_membership" ON public.league_members;
CREATE POLICY "league_admin_or_platform_admin_update_membership"
  ON public.league_members FOR UPDATE
  USING (
    public.get_league_role(league_id, auth.uid()) = 'league_admin'
    OR public.is_platform_admin()
  );

DROP POLICY IF EXISTS "league_staff_or_admin_delete_membership" ON public.league_members;
CREATE POLICY "league_admin_or_platform_admin_delete_membership"
  ON public.league_members FOR DELETE
  USING (
    public.get_league_role(league_id, auth.uid()) = 'league_admin'
    OR public.is_platform_admin()
  );
