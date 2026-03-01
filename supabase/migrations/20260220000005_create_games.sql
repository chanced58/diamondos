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
