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
