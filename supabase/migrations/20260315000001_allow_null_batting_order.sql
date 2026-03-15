-- Allow a pitcher to be in the lineup without a batting order slot.
-- This enables DH rules where the pitcher does not bat but still needs
-- to be tracked for pitch counts and pitching-change purposes.

alter table public.game_lineups
  alter column batting_order drop not null;

-- Replace the existing check so NULL is explicitly permitted.
alter table public.game_lineups
  drop constraint if exists game_lineups_batting_order_check;

alter table public.game_lineups
  add constraint game_lineups_batting_order_check
  check (batting_order is null or batting_order between 1 and 9);

comment on column public.game_lineups.batting_order is
  'Batting slot (1–9). NULL for pitchers who do not bat (DH rule).';
