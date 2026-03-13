-- Add default UUID generation for game_events.id so server-side inserts
-- that omit the id column (e.g. web app) don't violate the NOT NULL constraint.
-- Mobile clients still provide their own client-generated UUIDs for offline-first support.
alter table public.game_events
  alter column id set default gen_random_uuid();
