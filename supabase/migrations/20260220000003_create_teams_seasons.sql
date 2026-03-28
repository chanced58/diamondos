-- Teams, Seasons, and Team Membership with RBAC roles

create type public.team_role as enum (
  'head_coach',
  'assistant_coach',
  'player',
  'parent',
  'athletic_director'
);

create table public.teams (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  organization  text,
  logo_url      text,
  state_code    char(2),
  created_by    uuid not null references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.teams is 'A baseball team. One user may belong to multiple teams.';
comment on column public.teams.state_code is 'Two-letter US state code for pitch compliance rule lookup.';

create table public.seasons (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams(id) on delete cascade,
  name        text not null,
  start_date  date not null,
  end_date    date,
  is_active   boolean not null default false,
  created_at  timestamptz not null default now()
);

comment on table public.seasons is 'A time period (e.g. Spring 2026) grouping games and rosters.';

-- Only one season may be active per team at a time
create unique index seasons_one_active_per_team
  on public.seasons(team_id)
  where is_active = true;

create table public.team_members (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        public.team_role not null,
  is_active   boolean not null default true,
  joined_at   timestamptz not null default now(),
  unique(team_id, user_id)
);

comment on table public.team_members is 'Junction table linking users to teams with a specific role.';

-- Helper: get a user''s role on a team (returns null if not a member)
create or replace function public.get_team_role(p_team_id uuid, p_user_id uuid)
returns public.team_role
language sql
security definer
stable
as $$
  select role
  from public.team_members
  where team_id = p_team_id
    and user_id = p_user_id
    and is_active = true
  limit 1;
$$;

-- Helper: returns true if the user is head_coach or assistant_coach on the team
create or replace function public.is_coach(p_team_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1
    from public.team_members
    where team_id = p_team_id
      and user_id = p_user_id
      and role in ('head_coach', 'assistant_coach')
      and is_active = true
  );
$$;
