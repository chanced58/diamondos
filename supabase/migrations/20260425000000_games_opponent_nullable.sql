-- Allow games to be scheduled before the opponent is known (e.g. playoff brackets
-- where the opponent is "winner of game 3"). NULL = TBD.
alter table public.games alter column opponent_name drop not null;

comment on column public.games.opponent_name is
  'Opponent name. NULL means TBD (e.g. playoff bracket where the opponent has not yet been determined).';
