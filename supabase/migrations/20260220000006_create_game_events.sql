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
