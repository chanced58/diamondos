-- Add missing INSERT and DELETE RLS policies for the leagues table.
-- The prior migration only added UPDATE; platform admins also need
-- INSERT (to create leagues via client) and DELETE.

drop policy if exists "league_staff_or_admin_insert_league" on public.leagues;
create policy "league_staff_or_admin_insert_league"
  on public.leagues for insert
  with check (
    public.is_platform_admin()
  );

drop policy if exists "league_staff_or_admin_delete_league" on public.leagues;
create policy "league_staff_or_admin_delete_league"
  on public.leagues for delete
  using (
    public.is_league_staff(id, auth.uid())
    or public.is_platform_admin()
  );
