-- Add secondary positions as an array of the existing player_position enum.
-- Defaults to empty array so existing rows are unaffected.
ALTER TABLE public.players
  ADD COLUMN secondary_positions public.player_position[] NOT NULL DEFAULT '{}';
