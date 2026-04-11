-- Fix disabled_by FK to SET NULL when the referenced auth user is deleted,
-- preventing FK violations on user removal.
ALTER TABLE public.players
  DROP CONSTRAINT IF EXISTS players_disabled_by_fkey;

ALTER TABLE public.players
  ADD CONSTRAINT players_disabled_by_fkey
  FOREIGN KEY (disabled_by) REFERENCES auth.users(id) ON DELETE SET NULL;
