-- Allow coaches to designate which team is "home" at a neutral site.
-- Values: 'us' (our team is home, default) or 'opponent'.
-- NULL means the column is irrelevant (home / away games).
alter table public.games
  add column neutral_home_team text
  check (neutral_home_team in ('us', 'opponent'));

comment on column public.games.neutral_home_team is
  'When location_type = neutral, indicates which team is designated as the home team. NULL for home/away games.';
