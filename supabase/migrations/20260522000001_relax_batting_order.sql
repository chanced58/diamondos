-- Relax batting_order from 1-9 to 1-30 on both lineup tables to support
-- "everyone bats" rosters and mid-game batter additions. Also bring the
-- opponent table to parity with game_lineups by allowing NULL batting_order
-- (DH rule: opponent pitchers who do not bat).
--
-- Additive only: no row backfill — every existing batting_order between
-- 1 and 9 already satisfies the new constraint.

alter table public.game_lineups
  drop constraint if exists game_lineups_batting_order_check;

alter table public.game_lineups
  add constraint game_lineups_batting_order_check
  check (batting_order is null or batting_order between 1 and 30);

alter table public.opponent_game_lineups
  drop constraint if exists opponent_game_lineups_batting_order_check;

alter table public.opponent_game_lineups
  alter column batting_order drop not null;

alter table public.opponent_game_lineups
  add constraint opponent_game_lineups_batting_order_check
  check (batting_order is null or batting_order between 1 and 30);

comment on column public.game_lineups.batting_order is
  'Batting slot (1–30). NULL for pitchers who do not bat (DH rule).';

comment on column public.opponent_game_lineups.batting_order is
  'Batting slot (1–30). NULL for opponent pitchers who do not bat (DH rule).';
