-- Leagues: organizational grouping of teams with optional divisions
-- and league-scoped messaging

-- ─── Enum ────────────────────────────────────────────────────────────────────

create type public.league_role as enum (
  'league_admin',     -- Full league management (teams, divisions, channels, staff)
  'league_manager'    -- Limited management (channels, scheduling)
);

-- ─── Tables ──────────────────────────────────────────────────────────────────

create table public.leagues (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  description   text,
  logo_url      text,
  state_code    char(2),
  created_by    uuid not null references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.league_divisions (
  id            uuid primary key default gen_random_uuid(),
  league_id     uuid not null references public.leagues(id) on delete cascade,
  name          text not null,
  created_at    timestamptz not null default now(),
  unique(league_id, name)
);

create table public.league_members (
  id            uuid primary key default gen_random_uuid(),
  league_id     uuid not null references public.leagues(id) on delete cascade,
  team_id       uuid not null references public.teams(id) on delete cascade,
  division_id   uuid references public.league_divisions(id) on delete set null,
  is_active     boolean not null default true,
  joined_at     timestamptz not null default now(),
  unique(league_id, team_id)
);

create table public.league_staff (
  id            uuid primary key default gen_random_uuid(),
  league_id     uuid not null references public.leagues(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  role          public.league_role not null,
  is_active     boolean not null default true,
  joined_at     timestamptz not null default now(),
  unique(league_id, user_id)
);

create table public.league_channels (
  id            uuid primary key default gen_random_uuid(),
  league_id     uuid not null references public.leagues(id) on delete cascade,
  channel_type  public.channel_type not null,
  name          text,
  description   text,
  created_by    uuid not null references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.league_channel_members (
  id                  uuid primary key default gen_random_uuid(),
  league_channel_id   uuid not null references public.league_channels(id) on delete cascade,
  user_id             uuid not null references auth.users(id) on delete cascade,
  can_post            boolean not null default false,
  last_read_at        timestamptz,
  joined_at           timestamptz not null default now(),
  unique(league_channel_id, user_id)
);

create table public.league_messages (
  id                  uuid primary key default gen_random_uuid(),
  league_channel_id   uuid not null references public.league_channels(id) on delete cascade,
  sender_id           uuid not null references auth.users(id),
  body                text not null,
  parent_id           uuid references public.league_messages(id) on delete set null,
  is_pinned           boolean not null default false,
  edited_at           timestamptz,
  deleted_at          timestamptz,
  created_at          timestamptz not null default now()
);

-- ─── Helper Functions ────────────────────────────────────────────────────────

-- Check if user belongs to any active team in the league
create or replace function public.is_league_member(p_league_id uuid, p_user_id uuid)
returns boolean
language sql security definer stable
as $$
  select exists (
    select 1 from public.league_members lm
    join public.team_members tm on tm.team_id = lm.team_id
    where lm.league_id = p_league_id
      and tm.user_id = p_user_id
      and lm.is_active = true
      and tm.is_active = true
  );
$$;

-- Check if user is league staff (admin or manager)
create or replace function public.is_league_staff(p_league_id uuid, p_user_id uuid)
returns boolean
language sql security definer stable
as $$
  select exists (
    select 1 from public.league_staff
    where league_id = p_league_id
      and user_id = p_user_id
      and is_active = true
  );
$$;

-- Get the league role for a user (null if not staff)
create or replace function public.get_league_role(p_league_id uuid, p_user_id uuid)
returns public.league_role
language sql security definer stable
as $$
  select role from public.league_staff
  where league_id = p_league_id
    and user_id = p_user_id
    and is_active = true
  limit 1;
$$;

-- Get all league IDs for a team
create or replace function public.get_leagues_for_team(p_team_id uuid)
returns setof uuid
language sql security definer stable
as $$
  select league_id from public.league_members
  where team_id = p_team_id and is_active = true;
$$;

-- ─── Row Level Security ──────────────────────────────────────────────────────

alter table public.leagues                enable row level security;
alter table public.league_divisions       enable row level security;
alter table public.league_members         enable row level security;
alter table public.league_staff           enable row level security;
alter table public.league_channels        enable row level security;
alter table public.league_channel_members enable row level security;
alter table public.league_messages        enable row level security;

-- leagues
create policy "league_members_view_league"
  on public.leagues for select
  using (
    public.is_league_member(id, auth.uid())
    or public.is_league_staff(id, auth.uid())
    or public.is_platform_admin()
  );

create policy "league_staff_update_league"
  on public.leagues for update
  using (public.is_league_staff(id, auth.uid()));

-- league_divisions
create policy "league_members_view_divisions"
  on public.league_divisions for select
  using (public.is_league_member(league_id, auth.uid()) or public.is_platform_admin());

create policy "league_staff_manage_divisions"
  on public.league_divisions for insert
  with check (public.is_league_staff(league_id, auth.uid()));

create policy "league_staff_update_divisions"
  on public.league_divisions for update
  using (public.is_league_staff(league_id, auth.uid()));

create policy "league_staff_delete_divisions"
  on public.league_divisions for delete
  using (public.is_league_staff(league_id, auth.uid()));

-- league_members
create policy "league_members_view_membership"
  on public.league_members for select
  using (public.is_league_member(league_id, auth.uid()) or public.is_platform_admin());

create policy "league_staff_manage_membership"
  on public.league_members for insert
  with check (public.is_league_staff(league_id, auth.uid()));

create policy "league_staff_update_membership"
  on public.league_members for update
  using (public.is_league_staff(league_id, auth.uid()));

create policy "league_staff_delete_membership"
  on public.league_members for delete
  using (public.is_league_staff(league_id, auth.uid()));

-- league_staff
create policy "league_members_view_staff"
  on public.league_staff for select
  using (public.is_league_member(league_id, auth.uid()) or public.is_platform_admin());

create policy "league_admin_manage_staff"
  on public.league_staff for insert
  with check (
    public.get_league_role(league_id, auth.uid()) = 'league_admin'
  );

create policy "league_admin_update_staff"
  on public.league_staff for update
  using (
    public.get_league_role(league_id, auth.uid()) = 'league_admin'
  );

create policy "league_admin_delete_staff"
  on public.league_staff for delete
  using (
    public.get_league_role(league_id, auth.uid()) = 'league_admin'
  );

-- league_channels
create policy "league_channel_members_view_channels"
  on public.league_channels for select
  using (
    exists (
      select 1 from public.league_channel_members
      where league_channel_id = public.league_channels.id
        and user_id = auth.uid()
    )
    or public.is_league_staff(league_id, auth.uid())
    or public.is_platform_admin()
  );

create policy "league_staff_manage_channels"
  on public.league_channels for insert
  with check (public.is_league_staff(league_id, auth.uid()));

create policy "league_staff_update_channels"
  on public.league_channels for update
  using (public.is_league_staff(league_id, auth.uid()));

create policy "league_staff_delete_channels"
  on public.league_channels for delete
  using (public.is_league_staff(league_id, auth.uid()));

-- league_channel_members
create policy "league_channel_members_view_co_members"
  on public.league_channel_members for select
  using (
    exists (
      select 1 from public.league_channel_members lcm
      where lcm.league_channel_id = public.league_channel_members.league_channel_id
        and lcm.user_id = auth.uid()
    )
    or public.is_platform_admin()
  );

create policy "league_channel_members_update_own"
  on public.league_channel_members for update
  using (user_id = auth.uid());

-- league_messages
create policy "league_channel_members_view_messages"
  on public.league_messages for select
  using (
    exists (
      select 1 from public.league_channel_members
      where league_channel_id = public.league_messages.league_channel_id
        and user_id = auth.uid()
    )
    or public.is_platform_admin()
  );

create policy "league_channel_members_post_messages"
  on public.league_messages for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.league_channel_members
      where league_channel_id = public.league_messages.league_channel_id
        and user_id = auth.uid()
        and can_post = true
    )
  );

create policy "league_message_sender_update"
  on public.league_messages for update
  using (sender_id = auth.uid());

-- ─── Indexes ─────────────────────────────────────────────────────────────────

create index idx_league_members_team_id on public.league_members(team_id);
create index idx_league_members_league_id on public.league_members(league_id);
create index idx_league_staff_league_id on public.league_staff(league_id);
create index idx_league_staff_user_id on public.league_staff(user_id);
create index idx_league_channels_league_id on public.league_channels(league_id);
create index idx_league_channel_members_user_id on public.league_channel_members(user_id);
create index idx_league_channel_members_channel_id on public.league_channel_members(league_channel_id);
create index idx_league_messages_channel_id on public.league_messages(league_channel_id);
create index idx_league_messages_created_at on public.league_messages(created_at);

-- ─── Realtime ────────────────────────────────────────────────────────────────

alter publication supabase_realtime add table public.league_messages;
alter publication supabase_realtime add table public.league_channel_members;
