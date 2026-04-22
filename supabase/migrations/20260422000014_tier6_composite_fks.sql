-- ============================================================================
-- Practice Engine — Tier 6 Game-Prep Linkage (review follow-up)
-- Migration: upgrade Tier 6 FKs to composite constraints so cross-team /
--            cross-practice references are impossible at the schema level.
-- ============================================================================
--
-- Background — review identified two weak FKs on Tier 6 data:
--   1. practices.linked_game_id → games.id does NOT enforce that the game
--      belongs to the same team as the practice. A stale / mis-authored
--      linked_game_id could point at another team's game.
--   2. practice_reps.block_id → practice_blocks.id does NOT enforce that
--      the block belongs to the same practice. A mis-authored rep could
--      point at a block from a different practice.
--
-- Fix: rebuild both FKs as composite references. practice_blocks already
-- carries a UNIQUE (id, practice_id) constraint from Tier 2
-- (practice_blocks_id_practice_unique). games needs a new UNIQUE (id, team_id)
-- to support the composite FK target.

-- ─── 1. Add (id, team_id) unique constraint on games ────────────────────────
alter table public.games
  add constraint games_id_team_id_unique unique (id, team_id);

-- ─── 2. Upgrade practices.linked_game_id → composite FK ──────────────────────
alter table public.practices
  drop constraint if exists practices_linked_game_id_fkey;

alter table public.practices
  add constraint practices_linked_game_in_team_fkey
  foreign key (linked_game_id, team_id)
  references public.games (id, team_id)
  on delete set null;

-- ─── 3. Upgrade practice_reps.block_id → composite FK ────────────────────────
alter table public.practice_reps
  drop constraint if exists practice_reps_block_id_fkey;

alter table public.practice_reps
  add constraint practice_reps_block_in_practice_fkey
  foreign key (block_id, practice_id)
  references public.practice_blocks (id, practice_id)
  on delete cascade;
