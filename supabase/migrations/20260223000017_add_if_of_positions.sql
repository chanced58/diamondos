-- Add generic infield / outfield values to the player_position enum.
-- These are useful as secondary position designators (e.g. "can play anywhere in the IF").
ALTER TYPE public.player_position ADD VALUE IF NOT EXISTS 'infield';
ALTER TYPE public.player_position ADD VALUE IF NOT EXISTS 'outfield';
