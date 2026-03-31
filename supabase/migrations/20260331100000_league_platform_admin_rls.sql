-- Allow platform admins to manage all league tables (INSERT, UPDATE, DELETE).
-- The existing SELECT policies already include is_platform_admin() checks.
-- This migration extends the mutation policies so platform admins can manage
-- any league from the admin panel without needing league_staff membership.

-- ─── leagues ────────────────────────────────────────────────────────────────

create policy "league_staff_or_admin_insert_league"
  on public.leagues for insert
  with check (
    public.is_platform_admin()
  );

drop policy if exists "league_staff_update_league" on public.leagues;
create policy "league_staff_or_admin_update_league"
  on public.leagues for update
  using (
    public.is_league_staff(id, auth.uid())
    or public.is_platform_admin()
  );

create policy "league_staff_or_admin_delete_league"
  on public.leagues for delete
  using (
    public.is_league_staff(id, auth.uid())
    or public.is_platform_admin()
  );

-- ─── league_divisions ───────────────────────────────────────────────────────

drop policy if exists "league_staff_manage_divisions" on public.league_divisions;
create policy "league_staff_or_admin_manage_divisions"
  on public.league_divisions for insert
  with check (
    public.is_league_staff(league_id, auth.uid())
    or public.is_platform_admin()
  );

drop policy if exists "league_staff_update_divisions" on public.league_divisions;
create policy "league_staff_or_admin_update_divisions"
  on public.league_divisions for update
  using (
    public.is_league_staff(league_id, auth.uid())
    or public.is_platform_admin()
  );

drop policy if exists "league_staff_delete_divisions" on public.league_divisions;
create policy "league_staff_or_admin_delete_divisions"
  on public.league_divisions for delete
  using (
    public.is_league_staff(league_id, auth.uid())
    or public.is_platform_admin()
  );

-- ─── league_members ─────────────────────────────────────────────────────────

drop policy if exists "league_staff_manage_membership" on public.league_members;
create policy "league_staff_or_admin_manage_membership"
  on public.league_members for insert
  with check (
    public.is_league_staff(league_id, auth.uid())
    or public.is_platform_admin()
  );

drop policy if exists "league_staff_update_membership" on public.league_members;
create policy "league_staff_or_admin_update_membership"
  on public.league_members for update
  using (
    public.is_league_staff(league_id, auth.uid())
    or public.is_platform_admin()
  );

drop policy if exists "league_staff_delete_membership" on public.league_members;
create policy "league_staff_or_admin_delete_membership"
  on public.league_members for delete
  using (
    public.is_league_staff(league_id, auth.uid())
    or public.is_platform_admin()
  );

-- ─── league_staff ───────────────────────────────────────────────────────────

drop policy if exists "league_admin_manage_staff" on public.league_staff;
create policy "league_admin_or_platform_admin_manage_staff"
  on public.league_staff for insert
  with check (
    public.get_league_role(league_id, auth.uid()) = 'league_admin'
    or public.is_platform_admin()
  );

drop policy if exists "league_admin_update_staff" on public.league_staff;
create policy "league_admin_or_platform_admin_update_staff"
  on public.league_staff for update
  using (
    public.get_league_role(league_id, auth.uid()) = 'league_admin'
    or public.is_platform_admin()
  );

drop policy if exists "league_admin_delete_staff" on public.league_staff;
create policy "league_admin_or_platform_admin_delete_staff"
  on public.league_staff for delete
  using (
    public.get_league_role(league_id, auth.uid()) = 'league_admin'
    or public.is_platform_admin()
  );

-- ─── league_channels ────────────────────────────────────────────────────────

drop policy if exists "league_staff_manage_channels" on public.league_channels;
create policy "league_staff_or_admin_manage_channels"
  on public.league_channels for insert
  with check (
    public.is_league_staff(league_id, auth.uid())
    or public.is_platform_admin()
  );

drop policy if exists "league_staff_update_channels" on public.league_channels;
create policy "league_staff_or_admin_update_channels"
  on public.league_channels for update
  using (
    public.is_league_staff(league_id, auth.uid())
    or public.is_platform_admin()
  );

drop policy if exists "league_staff_delete_channels" on public.league_channels;
create policy "league_staff_or_admin_delete_channels"
  on public.league_channels for delete
  using (
    public.is_league_staff(league_id, auth.uid())
    or public.is_platform_admin()
  );
