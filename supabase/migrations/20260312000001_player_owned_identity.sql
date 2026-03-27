-- Player-Owned Identity: Foundation for cross-team player tracking
--
-- Creates player_team_memberships (junction table tracking team history)
-- and player_transfers (audit log). Alters players table to decouple
-- player identity from team ownership.

-- 1. Create player_team_memberships junction table
CREATE TABLE public.player_team_memberships (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id       UUID NOT NULL REFERENCES public.players(id) ON DELETE RESTRICT,
  team_id         UUID NOT NULL REFERENCES public.teams(id) ON DELETE RESTRICT,
  jersey_number   SMALLINT,
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at         TIMESTAMPTZ,           -- NULL = currently active on this team
  is_active       BOOLEAN NOT NULL DEFAULT true,
  transfer_reason TEXT,                   -- 'transfer', 'graduated', 'cut', 'quit'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(player_id, team_id, joined_at)  -- same player can rejoin a team later
);

COMMENT ON TABLE public.player_team_memberships IS
  'Junction table tracking which teams a player belongs to over time. Enables cross-team career views and transfer auditing.';

-- Index for the most common query: "all active players on a team"
CREATE INDEX ptm_team_active_idx
  ON public.player_team_memberships(team_id)
  WHERE is_active = true;

CREATE INDEX ptm_player_idx
  ON public.player_team_memberships(player_id);

-- Jersey number uniqueness: only one active player per team can have a given number
CREATE UNIQUE INDEX ptm_team_jersey_active_idx
  ON public.player_team_memberships(team_id, jersey_number)
  WHERE is_active = true AND jersey_number IS NOT NULL;


-- 2. Create player_transfers audit log
CREATE TABLE public.player_transfers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id       UUID NOT NULL REFERENCES public.players(id) ON DELETE RESTRICT,
  from_team_id    UUID REFERENCES public.teams(id),
  to_team_id      UUID REFERENCES public.teams(id),
  transferred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason          TEXT,
  initiated_by    UUID NOT NULL REFERENCES auth.users(id),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.player_transfers IS
  'Audit log of player movements between teams. Required for compliance tracking.';

CREATE INDEX player_transfers_player_idx
  ON public.player_transfers(player_id);

CREATE INDEX player_transfers_from_team_idx
  ON public.player_transfers(from_team_id);

CREATE INDEX player_transfers_to_team_idx
  ON public.player_transfers(to_team_id);


-- 3. Backfill player_team_memberships from existing players
INSERT INTO public.player_team_memberships (player_id, team_id, jersey_number, is_active, joined_at)
SELECT id, team_id, jersey_number, is_active, created_at
FROM public.players;


-- 4. Alter players table: decouple from team ownership

-- Drop the old unique constraint on (team_id, jersey_number)
-- Jersey number uniqueness is now enforced in player_team_memberships
ALTER TABLE public.players DROP CONSTRAINT players_team_id_jersey_number_key;

-- Change ON DELETE CASCADE to ON DELETE SET NULL
-- Deleting a team should NOT delete its players — only end their membership
ALTER TABLE public.players DROP CONSTRAINT players_team_id_fkey;
ALTER TABLE public.players
  ADD CONSTRAINT players_team_id_fkey
  FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE SET NULL;

-- Make team_id nullable — it's now a denormalized "current team" convenience field
ALTER TABLE public.players ALTER COLUMN team_id DROP NOT NULL;
