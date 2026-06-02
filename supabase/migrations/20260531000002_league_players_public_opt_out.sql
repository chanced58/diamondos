-- Per-league, per-player suppression from public listings (minor-privacy control).
alter table public.league_players
  add column public_opt_out boolean not null default false;

comment on column public.league_players.public_opt_out is
  'When true, this player is omitted from publicly visible league leaderboards/spotlights. Full names are only shown to signed-in members regardless.';
