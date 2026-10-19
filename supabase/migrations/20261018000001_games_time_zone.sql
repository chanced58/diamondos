-- Games get the IANA zone their start time was entered in.
--
-- scheduled_at stays the absolute instant (timestamptz). time_zone says which
-- wall clock that instant should be shown in, so the web (server-rendered in
-- UTC) and the mobile app (device zone) both show the game-local time a coach
-- typed. It comes from the venue's coordinates when the coach picked an
-- address, else from the coach's browser. Null means "unknown" — readers fall
-- back to the viewer's own zone.

alter table public.games
  add column if not exists time_zone text;

comment on column public.games.time_zone is
  'IANA zone (e.g. America/Boise) scheduled_at is displayed in: the venue''s zone, else the zone of the browser the game was scheduled from. Null = unknown; show in the viewer''s zone.';
