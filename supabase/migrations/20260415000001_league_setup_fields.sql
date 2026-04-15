-- Add setup-related columns to leagues for the onboarding wizard

alter table public.leagues
  add column league_type text,
  add column level text,
  add column current_season text,
  add column setup_completed_at timestamptz;

-- Constrain league_type to known values
alter table public.leagues
  add constraint leagues_league_type_check
  check (league_type in ('recreational', 'travel', 'high_school', 'college', 'adult', 'tournament'));

-- Constrain level to match teams.level values
alter table public.leagues
  add constraint leagues_level_check
  check (level in ('youth', 'middle_school', 'high_school', 'college', 'pro'));

-- Backfill: existing leagues are already set up (created before the wizard existed)
update public.leagues
  set setup_completed_at = created_at
  where setup_completed_at is null;

-- Allow league staff to view their own league's setup_completed_at
-- (the existing league_staff_update_league policy already covers UPDATE)

-- Also add an is_league_admin helper function that checks for the specific role
create or replace function public.is_league_admin(p_league_id uuid, p_user_id uuid)
returns boolean
language sql security definer stable
as $$
  select exists (
    select 1 from public.league_staff
    where league_id = p_league_id
      and user_id = p_user_id
      and role = 'league_admin'
      and is_active = true
  );
$$;
