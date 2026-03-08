-- Prevent platform admins from holding team_members rows.
-- Platform admins get implicit access to all teams via is_platform_admin = true;
-- they must never appear as coaches or staff on any team roster.

-- Trigger function: raise exception if the user being inserted/updated is a platform admin
create or replace function public.prevent_platform_admin_team_membership()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1 from public.user_profiles
    where id = new.user_id and is_platform_admin = true
  ) then
    raise exception 'Platform administrators cannot be members of a team';
  end if;
  return new;
end;
$$;

-- Attach trigger to team_members
create trigger no_platform_admin_in_team_members
  before insert or update on public.team_members
  for each row execute function public.prevent_platform_admin_team_membership();

-- Cleanup: remove any existing team_members rows for platform admin users
delete from public.team_members
where user_id in (
  select id from public.user_profiles where is_platform_admin = true
);
