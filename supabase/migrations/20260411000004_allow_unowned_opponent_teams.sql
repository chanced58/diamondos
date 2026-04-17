-- Allow opponent_teams to exist without a team or league owner.
-- This supports platform-admin team removal: when a team has stats/roster,
-- it gets converted to an opponent_team with both team_id and league_id NULL.

-- Drop the existing XOR constraint
ALTER TABLE public.opponent_teams
  DROP CONSTRAINT IF EXISTS chk_opponent_teams_owner;

-- Replace with a looser constraint: at most one owner (not "exactly one")
-- Both can be NULL for platform-admin-converted teams.
ALTER TABLE public.opponent_teams
  ADD CONSTRAINT chk_opponent_teams_owner
  CHECK (NOT (team_id IS NOT NULL AND league_id IS NOT NULL));

-- Relax player_team_memberships FK on team_id from RESTRICT to CASCADE
-- so that team deletion cascades memberships rather than blocking.
ALTER TABLE public.player_team_memberships
  DROP CONSTRAINT IF EXISTS player_team_memberships_team_id_fkey;

ALTER TABLE public.player_team_memberships
  ADD CONSTRAINT player_team_memberships_team_id_fkey
  FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;
