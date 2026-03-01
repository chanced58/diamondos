-- Add structured address fields to games, practices, and team_events.
-- The existing location/venue_name text columns are kept for backward compatibility
-- (they hold the short display name). New columns store the full address + coordinates.

-- games
ALTER TABLE public.games
  ADD COLUMN address   text,
  ADD COLUMN latitude  double precision,
  ADD COLUMN longitude double precision,
  ADD COLUMN place_id  text;

-- practices
ALTER TABLE public.practices
  ADD COLUMN address   text,
  ADD COLUMN latitude  double precision,
  ADD COLUMN longitude double precision,
  ADD COLUMN place_id  text;

-- team_events
ALTER TABLE public.team_events
  ADD COLUMN address   text,
  ADD COLUMN latitude  double precision,
  ADD COLUMN longitude double precision,
  ADD COLUMN place_id  text;
