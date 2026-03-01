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
