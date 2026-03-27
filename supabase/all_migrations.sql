-- Enable required Postgres extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";
-- Extends Supabase auth.users with app-specific profile data.
-- A row is automatically created when a new user signs up via the trigger below.

create table public.user_profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  first_name  text not null default '',
  last_name   text not null default '',
  phone       text,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.user_profiles is
  'App-level profile data for each authenticated user. PII — handle with care (FERPA).';

-- Automatically insert a profile row when a new auth user is created
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute procedure public.handle_new_user();
-- Teams, Seasons, and Team Membership with RBAC roles

create type public.team_role as enum (
  'head_coach',
  'assistant_coach',
  'player',
  'parent',
  'athletic_director'
);

create table public.teams (
  id            uuid primary key default uuid_generate_v4(),
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
  id          uuid primary key default uuid_generate_v4(),
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
  id          uuid primary key default uuid_generate_v4(),
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
-- Players, parent-player links, and season roster membership

create type public.player_position as enum (
  'pitcher',
  'catcher',
  'first_base',
  'second_base',
  'third_base',
  'shortstop',
  'left_field',
  'center_field',
  'right_field',
  'designated_hitter',
  'utility'
);

create type public.bats_throws as enum ('right', 'left', 'switch');

create table public.players (
  id                uuid primary key default uuid_generate_v4(),
  team_id           uuid not null references public.teams(id) on delete cascade,
  -- Links to auth.users if the player has an account (optional for youth players)
  user_id           uuid references auth.users(id) on delete set null,
  first_name        text not null,
  last_name         text not null,
  jersey_number     smallint,
  primary_position  public.player_position,
  bats              public.bats_throws,
  throws            public.bats_throws,
  date_of_birth     date,          -- Used for age-based compliance rule matching
  graduation_year   smallint,
  notes             text,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique(team_id, jersey_number)
);

comment on table public.players is 'An athlete on a team roster. PII — date_of_birth is sensitive (FERPA).';

-- Parent / guardian links to player records for access control
create table public.parent_player_links (
  id              uuid primary key default uuid_generate_v4(),
  parent_user_id  uuid not null references auth.users(id) on delete cascade,
  player_id       uuid not null references public.players(id) on delete cascade,
  relationship    text,           -- 'parent', 'guardian', 'stepparent', etc.
  created_at      timestamptz not null default now(),
  unique(parent_user_id, player_id)
);

comment on table public.parent_player_links is
  'Links a parent/guardian user account to their player record(s). PII — FERPA sensitive.';

-- Which players are on a given season''s roster
create table public.season_rosters (
  id          uuid primary key default uuid_generate_v4(),
  season_id   uuid not null references public.seasons(id) on delete cascade,
  player_id   uuid not null references public.players(id) on delete cascade,
  added_at    timestamptz not null default now(),
  unique(season_id, player_id)
);
-- Games and game lineups

create type public.game_status as enum (
  'scheduled',
  'in_progress',
  'completed',
  'cancelled',
  'postponed'
);

create type public.game_location_type as enum ('home', 'away', 'neutral');

create table public.games (
  id                uuid primary key default uuid_generate_v4(),
  season_id         uuid not null references public.seasons(id) on delete cascade,
  team_id           uuid not null references public.teams(id),
  opponent_name     text not null,
  scheduled_at      timestamptz not null,
  location_type     public.game_location_type not null default 'home',
  neutral_home_team text check (neutral_home_team in ('us', 'opponent')),
  venue_name        text,
  status            public.game_status not null default 'scheduled',
  home_score        smallint not null default 0,
  away_score        smallint not null default 0,
  current_inning    smallint not null default 1,
  is_top_of_inning  boolean not null default true,
  outs              smallint not null default 0,
  notes             text,
  started_at        timestamptz,
  completed_at      timestamptz,
  created_by        uuid not null references auth.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.games is 'A single scheduled or completed game for a season.';

-- The batting order for a game (pre-set before game start, updated via substitutions)
create table public.game_lineups (
  id                uuid primary key default uuid_generate_v4(),
  game_id           uuid not null references public.games(id) on delete cascade,
  player_id         uuid not null references public.players(id),
  batting_order     smallint not null check (batting_order between 1 and 9),
  starting_position public.player_position,
  is_starter        boolean not null default true,
  created_at        timestamptz not null default now(),
  unique(game_id, batting_order),
  unique(game_id, player_id)
);
-- Game Events: the immutable append-only event log (event sourcing core)
--
-- Every atomic action in a game (pitch, hit, out, substitution, etc.) is recorded
-- as a row here. Game state is always derived by replaying events in sequence_number
-- order. Rows in this table are NEVER updated or deleted.

create table public.game_events (
  id                uuid primary key,         -- Generated client-side (UUID v4); enables offline-first creation
  game_id           uuid not null references public.games(id) on delete cascade,
  sequence_number   integer not null,          -- Monotonically increasing per game; unique constraint enforces ordering
  event_type        text not null,             -- Matches EventType enum in @baseball/shared
  inning            smallint not null,
  is_top_of_inning  boolean not null,
  payload           jsonb not null default '{}',
  occurred_at       timestamptz not null,
  created_by        uuid not null references auth.users(id),
  device_id         text not null,             -- Stable UUID of the originating device (for conflict detection)
  synced_at         timestamptz not null default now(),
  unique(game_id, sequence_number)
);

comment on table public.game_events is
  'Immutable event log. Every pitch, hit, and out is a row. Never UPDATE or DELETE rows here.';
comment on column public.game_events.id is
  'Client-generated UUID. Allows offline creation; idempotent upsert on sync.';
comment on column public.game_events.sequence_number is
  'Monotonic sequence per game. Collision (two devices same seq_num) detected by unique constraint; sync engine retries with seq_num+1.';

-- Optimized index for "get all events for game in order" (most common query)
create index game_events_game_id_seq_idx
  on public.game_events(game_id, sequence_number);

-- Index for pitch count aggregation by pitcher
create index game_events_pitcher_id_idx
  on public.game_events((payload ->> 'pitcherId'))
  where event_type = 'pitch_thrown';
-- Pitch count tracking (derived from game_events, maintained by edge function)
--
-- Source of truth is always game_events. This table avoids replaying the full
-- event log on every compliance check. Updated by the pitch-count-calculator
-- edge function on every PITCH_THROWN event insert.

create table public.pitch_counts (
  id                  uuid primary key default uuid_generate_v4(),
  game_id             uuid not null references public.games(id) on delete cascade,
  player_id           uuid not null references public.players(id),
  season_id           uuid not null references public.seasons(id),
  game_date           date not null,
  pitch_count         smallint not null default 0,
  -- Populated after the game or when pitcher is removed from game
  required_rest_days  smallint,
  can_pitch_next_day  boolean,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique(game_id, player_id)
);

comment on table public.pitch_counts is
  'Derived pitch count per pitcher per game. Updated in real-time by edge function. Source of truth is game_events.';
-- Messaging: channels, messages, RSVPs, and push notification tokens

create type public.channel_type as enum (
  'announcement',   -- Coaches post only; all team members receive
  'topic',          -- Threaded discussion with role-based posting
  'direct'          -- 1:1 between two users
);

create type public.rsvp_status as enum (
  'attending',
  'not_attending',
  'maybe'
);

create table public.channels (
  id            uuid primary key default uuid_generate_v4(),
  team_id       uuid not null references public.teams(id) on delete cascade,
  channel_type  public.channel_type not null,
  name          text,           -- null for direct channels
  description   text,
  created_by    uuid not null references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.channel_members (
  id            uuid primary key default uuid_generate_v4(),
  channel_id    uuid not null references public.channels(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  can_post      boolean not null default false,  -- false for parents/players in announcement channels
  last_read_at  timestamptz,
  joined_at     timestamptz not null default now(),
  unique(channel_id, user_id)
);

create table public.messages (
  id          uuid primary key default uuid_generate_v4(),
  channel_id  uuid not null references public.channels(id) on delete cascade,
  sender_id   uuid not null references auth.users(id),
  body        text not null,
  parent_id   uuid references public.messages(id) on delete set null, -- thread reply
  is_pinned   boolean not null default false,
  edited_at   timestamptz,
  deleted_at  timestamptz,                      -- soft delete; body blanked but row kept for threading
  created_at  timestamptz not null default now()
);

-- RSVP tracking for scheduled games
create table public.game_rsvps (
  id            uuid primary key default uuid_generate_v4(),
  game_id       uuid not null references public.games(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  status        public.rsvp_status not null,
  note          text,
  responded_at  timestamptz not null default now(),
  unique(game_id, user_id)
);

-- Expo push notification tokens registered by mobile clients
create table public.push_tokens (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  token       text not null unique,
  platform    text not null check (platform in ('ios', 'android')),
  created_at  timestamptz not null default now(),
  last_used_at timestamptz
);
-- Pitch count compliance rules (per-state / per-organization)

create table public.pitch_compliance_rules (
  id                    uuid primary key default uuid_generate_v4(),
  -- null team_id = system-level preset (NFHS, Little League, etc.)
  team_id               uuid references public.teams(id) on delete cascade,
  rule_name             text not null,
  max_pitches_per_day   smallint not null,
  -- JSON map: threshold (as string) → required rest days
  -- Example: {"1": 0, "26": 1, "51": 2, "76": 3, "101": 4}
  rest_day_thresholds   jsonb not null,
  age_min               smallint,
  age_max               smallint,
  applies_from          date,
  applies_until         date,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now()
);

comment on table public.pitch_compliance_rules is
  'Defines pitch count limits and rest day rules for a ruleset. Rows with null team_id are system presets (NFHS, Little League, NCAA).';

-- Which compliance rule is active for a given season
create table public.season_compliance_rules (
  season_id             uuid primary key references public.seasons(id) on delete cascade,
  compliance_rule_id    uuid not null references public.pitch_compliance_rules(id)
);

-- Seed system preset rules
insert into public.pitch_compliance_rules
  (rule_name, max_pitches_per_day, rest_day_thresholds)
values
  ('NFHS (High School)', 110, '{"1": 0, "26": 1, "51": 2, "76": 3, "101": 4}'),
  ('Little League (Ages 13-16)', 95, '{"1": 0, "36": 1, "61": 2, "76": 3}'),
  ('Little League (Ages 11-12)', 85, '{"1": 0, "26": 1, "41": 2, "61": 3}'),
  ('NCAA', 105, '{"1": 0, "31": 1, "61": 2, "91": 3}');
-- Row Level Security (RLS) policies for all tablesa
-- This is the primary security enforcement layer. Never bypass with client-side checks only.

-- Enable RLS on every app table
alter table public.user_profiles         enable row level security;
alter table public.teams                 enable row level security;
alter table public.seasons               enable row level security;
alter table public.team_members          enable row level security;
alter table public.players               enable row level security;
alter table public.parent_player_links   enable row level security;
alter table public.season_rosters        enable row level security;
alter table public.games                 enable row level security;
alter table public.game_lineups          enable row level security;
alter table public.game_events           enable row level security;
alter table public.pitch_counts          enable row level security;
alter table public.channels              enable row level security;
alter table public.channel_members       enable row level security;
alter table public.messages              enable row level security;
alter table public.game_rsvps            enable row level security;
alter table public.push_tokens           enable row level security;
alter table public.pitch_compliance_rules enable row level security;
alter table public.season_compliance_rules enable row level security;

-- ─── user_profiles ───────────────────────────────────────────────────────────

create policy "users_view_own_profile"
  on public.user_profiles for select
  using (id = auth.uid());

create policy "team_members_view_co_member_profiles"
  on public.user_profiles for select
  using (
    exists (
      select 1 from public.team_members tm1
      join public.team_members tm2 on tm1.team_id = tm2.team_id
      where tm1.user_id = auth.uid()
        and tm2.user_id = public.user_profiles.id
        and tm1.is_active = true
        and tm2.is_active = true
    )
  );

create policy "users_update_own_profile"
  on public.user_profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- ─── teams ───────────────────────────────────────────────────────────────────

create policy "team_members_view_team"
  on public.teams for select
  using (
    exists (
      select 1 from public.team_members
      where team_id = public.teams.id
        and user_id = auth.uid()
        and is_active = true
    )
  );

create policy "coaches_update_team"
  on public.teams for update
  using (public.is_coach(id, auth.uid()));

-- Team creation is handled server-side (service role) when a user onboards
-- No client-side INSERT policy; use edge function for team creation

-- ─── seasons ─────────────────────────────────────────────────────────────────

create policy "team_members_view_seasons"
  on public.seasons for select
  using (
    exists (
      select 1 from public.team_members
      where team_id = public.seasons.team_id
        and user_id = auth.uid()
        and is_active = true
    )
  );

create policy "coaches_manage_seasons"
  on public.seasons for all
  using (public.is_coach(team_id, auth.uid()))
  with check (public.is_coach(team_id, auth.uid()));

-- ─── team_members ─────────────────────────────────────────────────────────────

create policy "team_members_view_membership"
  on public.team_members for select
  using (
    exists (
      select 1 from public.team_members tm
      where tm.team_id = public.team_members.team_id
        and tm.user_id = auth.uid()
        and tm.is_active = true
    )
  );

-- Only service role (edge functions) may insert/update team_members (invitation flow)

-- ─── players ─────────────────────────────────────────────────────────────────

create policy "team_members_view_players"
  on public.players for select
  using (
    exists (
      select 1 from public.team_members
      where team_id = public.players.team_id
        and user_id = auth.uid()
        and is_active = true
    )
  );

create policy "coaches_manage_players"
  on public.players for insert
  with check (public.is_coach(team_id, auth.uid()));

create policy "coaches_update_players"
  on public.players for update
  using (public.is_coach(team_id, auth.uid()));

-- ─── parent_player_links ──────────────────────────────────────────────────────

create policy "parents_view_own_links"
  on public.parent_player_links for select
  using (parent_user_id = auth.uid());

create policy "coaches_view_player_links"
  on public.parent_player_links for select
  using (
    exists (
      select 1 from public.players p
      join public.team_members tm on tm.team_id = p.team_id
      where p.id = public.parent_player_links.player_id
        and tm.user_id = auth.uid()
        and tm.role in ('head_coach', 'assistant_coach', 'athletic_director')
        and tm.is_active = true
    )
  );

-- ─── season_rosters ───────────────────────────────────────────────────────────

create policy "team_members_view_season_rosters"
  on public.season_rosters for select
  using (
    exists (
      select 1 from public.seasons s
      join public.team_members tm on tm.team_id = s.team_id
      where s.id = public.season_rosters.season_id
        and tm.user_id = auth.uid()
        and tm.is_active = true
    )
  );

create policy "coaches_manage_season_rosters"
  on public.season_rosters for all
  using (
    exists (
      select 1 from public.seasons s
      where s.id = public.season_rosters.season_id
        and public.is_coach(s.team_id, auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.seasons s
      where s.id = public.season_rosters.season_id
        and public.is_coach(s.team_id, auth.uid())
    )
  );

-- ─── games ────────────────────────────────────────────────────────────────────

create policy "team_members_view_games"
  on public.games for select
  using (
    exists (
      select 1 from public.team_members
      where team_id = public.games.team_id
        and user_id = auth.uid()
        and is_active = true
    )
  );

create policy "coaches_manage_games"
  on public.games for all
  using (public.is_coach(team_id, auth.uid()))
  with check (public.is_coach(team_id, auth.uid()));

-- Public read for live score page (no auth)
create policy "public_view_in_progress_games"
  on public.games for select
  using (status = 'in_progress');

-- ─── game_lineups ─────────────────────────────────────────────────────────────

create policy "team_members_view_lineups"
  on public.game_lineups for select
  using (
    exists (
      select 1 from public.games g
      join public.team_members tm on tm.team_id = g.team_id
      where g.id = public.game_lineups.game_id
        and tm.user_id = auth.uid()
        and tm.is_active = true
    )
  );

create policy "coaches_manage_lineups"
  on public.game_lineups for all
  using (
    exists (
      select 1 from public.games g
      where g.id = public.game_lineups.game_id
        and public.is_coach(g.team_id, auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.games g
      where g.id = public.game_lineups.game_id
        and public.is_coach(g.team_id, auth.uid())
    )
  );

-- ─── game_events (immutable append-only) ──────────────────────────────────────

create policy "team_members_view_game_events"
  on public.game_events for select
  using (
    exists (
      select 1 from public.games g
      join public.team_members tm on tm.team_id = g.team_id
      where g.id = public.game_events.game_id
        and tm.user_id = auth.uid()
        and tm.is_active = true
    )
  );

-- Public read for live score page
create policy "public_view_events_for_live_games"
  on public.game_events for select
  using (
    exists (
      select 1 from public.games g
      where g.id = public.game_events.game_id
        and g.status = 'in_progress'
    )
  );

create policy "coaches_insert_game_events"
  on public.game_events for insert
  with check (
    exists (
      select 1 from public.games g
      where g.id = public.game_events.game_id
        and public.is_coach(g.team_id, auth.uid())
    )
  );

-- No UPDATE or DELETE policies — game_events are immutable

-- ─── pitch_counts ─────────────────────────────────────────────────────────────

create policy "team_members_view_pitch_counts"
  on public.pitch_counts for select
  using (
    exists (
      select 1 from public.games g
      join public.team_members tm on tm.team_id = g.team_id
      where g.id = public.pitch_counts.game_id
        and tm.user_id = auth.uid()
        and tm.is_active = true
    )
  );

-- pitch_counts are written by the service-role edge function only
-- No client INSERT/UPDATE policies needed

-- ─── channels ─────────────────────────────────────────────────────────────────

create policy "channel_members_view_channels"
  on public.channels for select
  using (
    exists (
      select 1 from public.channel_members
      where channel_id = public.channels.id
        and user_id = auth.uid()
    )
  );

create policy "coaches_manage_channels"
  on public.channels for all
  using (public.is_coach(team_id, auth.uid()))
  with check (public.is_coach(team_id, auth.uid()));

-- ─── channel_members ──────────────────────────────────────────────────────────

create policy "channel_members_view_membership"
  on public.channel_members for select
  using (
    exists (
      select 1 from public.channel_members cm
      where cm.channel_id = public.channel_members.channel_id
        and cm.user_id = auth.uid()
    )
  );

create policy "users_update_own_channel_membership"
  on public.channel_members for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- channel_members inserts handled by service role (when user is invited to team/channel)

-- ─── messages ─────────────────────────────────────────────────────────────────

create policy "channel_members_read_messages"
  on public.messages for select
  using (
    exists (
      select 1 from public.channel_members
      where channel_id = public.messages.channel_id
        and user_id = auth.uid()
    )
  );

create policy "channel_members_with_post_perm_insert_messages"
  on public.messages for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.channel_members
      where channel_id = public.messages.channel_id
        and user_id = auth.uid()
        and can_post = true
    )
  );

create policy "users_update_own_messages"
  on public.messages for update
  using (sender_id = auth.uid())
  with check (sender_id = auth.uid());

-- ─── game_rsvps ───────────────────────────────────────────────────────────────

create policy "team_members_view_rsvps"
  on public.game_rsvps for select
  using (
    exists (
      select 1 from public.games g
      join public.team_members tm on tm.team_id = g.team_id
      where g.id = public.game_rsvps.game_id
        and tm.user_id = auth.uid()
        and tm.is_active = true
    )
  );

create policy "users_manage_own_rsvp"
  on public.game_rsvps for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ─── push_tokens ──────────────────────────────────────────────────────────────

create policy "users_manage_own_push_tokens"
  on public.push_tokens for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ─── pitch_compliance_rules ───────────────────────────────────────────────────

-- System presets (null team_id) are readable by all authenticated users
create policy "all_users_view_system_compliance_rules"
  on public.pitch_compliance_rules for select
  using (team_id is null);

-- Team-specific rules readable by team members
create policy "team_members_view_team_compliance_rules"
  on public.pitch_compliance_rules for select
  using (
    team_id is not null
    and exists (
      select 1 from public.team_members
      where team_id = public.pitch_compliance_rules.team_id
        and user_id = auth.uid()
        and is_active = true
    )
  );

create policy "coaches_manage_team_compliance_rules"
  on public.pitch_compliance_rules for all
  using (
    team_id is not null
    and public.is_coach(team_id, auth.uid())
  )
  with check (
    team_id is not null
    and public.is_coach(team_id, auth.uid())
  );

-- ─── season_compliance_rules ──────────────────────────────────────────────────

create policy "team_members_view_season_compliance"
  on public.season_compliance_rules for select
  using (
    exists (
      select 1 from public.seasons s
      join public.team_members tm on tm.team_id = s.team_id
      where s.id = public.season_compliance_rules.season_id
        and tm.user_id = auth.uid()
        and tm.is_active = true
    )
  );

create policy "coaches_manage_season_compliance"
  on public.season_compliance_rules for all
  using (
    exists (
      select 1 from public.seasons s
      where s.id = public.season_compliance_rules.season_id
        and public.is_coach(s.team_id, auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.seasons s
      where s.id = public.season_compliance_rules.season_id
        and public.is_coach(s.team_id, auth.uid())
    )
  );
-- Performance indexes

-- User lookups
create index user_profiles_name_idx
  on public.user_profiles using gin(to_tsvector('english', first_name || ' ' || last_name));

-- Team membership
create index team_members_user_id_idx on public.team_members(user_id);
create index team_members_team_id_idx on public.team_members(team_id) where is_active = true;

-- Player lookups
create index players_team_id_idx on public.players(team_id) where is_active = true;
create index players_user_id_idx on public.players(user_id) where user_id is not null;
create index players_name_idx
  on public.players using gin(to_tsvector('english', first_name || ' ' || last_name));

-- Parent-player links
create index parent_player_links_parent_idx on public.parent_player_links(parent_user_id);
create index parent_player_links_player_idx on public.parent_player_links(player_id);

-- Season rosters
create index season_rosters_season_idx on public.season_rosters(season_id);
create index season_rosters_player_idx on public.season_rosters(player_id);

-- Games
create index games_season_id_idx on public.games(season_id);
create index games_team_id_idx on public.games(team_id);
create index games_scheduled_at_idx on public.games(scheduled_at);
create index games_status_idx on public.games(status) where status in ('scheduled', 'in_progress');

-- Game events (already has primary index from migration 6)
-- Additional index for "events since sync" queries
create index game_events_synced_at_idx on public.game_events(game_id, synced_at);

-- Pitch counts
create index pitch_counts_player_season_idx on public.pitch_counts(player_id, season_id);
create index pitch_counts_game_date_idx on public.pitch_counts(game_date);

-- Messaging
create index messages_channel_id_idx
  on public.messages(channel_id, created_at desc)
  where deleted_at is null;
create index messages_parent_id_idx
  on public.messages(parent_id)
  where parent_id is not null;
create index channel_members_user_id_idx on public.channel_members(user_id);
create index channel_members_channel_id_idx on public.channel_members(channel_id);

-- Push tokens
create index push_tokens_user_id_idx on public.push_tokens(user_id);

-- Compliance
create index compliance_rules_team_id_idx
  on public.pitch_compliance_rules(team_id)
  where team_id is not null;
-- Enable Supabase Realtime on tables needed for live features

-- Live scorekeeping: broadcast game state and events to all subscribers (parents, remote viewers)
alter publication supabase_realtime add table public.game_events;
alter publication supabase_realtime add table public.games;

-- Pitch count compliance: real-time alerts in scoring screen
alter publication supabase_realtime add table public.pitch_counts;

-- Messaging: real-time message delivery in channel threads
alter publication supabase_realtime add table public.messages;

-- Channel membership changes (e.g., added to a channel)
alter publication supabase_realtime add table public.channel_members;
