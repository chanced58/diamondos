BEGIN;
SELECT plan(5);

INSERT INTO auth.users (id, instance_id, email, aud, role, created_at, updated_at)
VALUES
  ('81000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'mobile-tournament-coach@example.test', 'authenticated', 'authenticated', now(), now()),
  ('81000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'mobile-tournament-outsider@example.test', 'authenticated', 'authenticated', now(), now())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.teams (id, name, created_by)
VALUES ('82000000-0000-4000-8000-000000000001', 'Mobile Tournament Team', '81000000-0000-4000-8000-000000000001');
INSERT INTO public.team_members (team_id, user_id, role)
VALUES ('82000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', 'head_coach');
INSERT INTO public.seasons (id, team_id, name, start_date, end_date, is_active)
VALUES ('83000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', 'Tournament', '2026-10-20', '2026-10-22', false);
INSERT INTO public.tournaments (id, name, created_by, start_date, end_date, scoring_settings, request_id, request_payload)
VALUES ('84000000-0000-4000-8000-000000000001', 'Mobile Cup', '81000000-0000-4000-8000-000000000001', '2026-10-20', '2026-10-22',
  '{"lineup":{"allowExpanded":true,"maxBatters":12,"allowMidGameExtension":true,"allowMidGameContraction":true,"continuousBattingOrder":false}}',
  '85000000-0000-4000-8000-000000000001', '{}');
INSERT INTO public.tournament_teams (tournament_id, team_id, season_id)
VALUES ('84000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000001');
INSERT INTO public.games (id, team_id, season_id, tournament_id, opponent_name, scheduled_at, created_by)
VALUES ('86000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000001', '84000000-0000-4000-8000-000000000001', 'Falcons', '2026-10-20 16:00:00+00', '81000000-0000-4000-8000-000000000001');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000002', true);
SELECT throws_ok(
  $$ SELECT * FROM public.start_tournament_game_for_user(
       '86000000-0000-4000-8000-000000000001', '87000000-0000-4000-8000-000000000001', 1,
       '{"homeLeadoffBatterId":"88000000-0000-4000-8000-000000000001"}', now()) $$,
  '42501', NULL, 'mobile game start rejects a user who does not coach the team'
);

SELECT set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
SELECT is(
  (SELECT s.event_id FROM public.start_tournament_game_for_user(
    '86000000-0000-4000-8000-000000000001', '87000000-0000-4000-8000-000000000001', 1,
    '{"homeLeadoffBatterId":"88000000-0000-4000-8000-000000000001"}', now()) s),
  '87000000-0000-4000-8000-000000000001'::uuid,
  'mobile start preserves the client event id for offline sync'
);
SELECT is(
  (SELECT sequence_number FROM public.game_events WHERE id = '87000000-0000-4000-8000-000000000001'),
  1,
  'mobile start persists the client sequence after the game lock validates order'
);
SELECT is(
  (SELECT count(*) FROM public.game_events WHERE id = '87000000-0000-4000-8000-000000000001'
     AND NOT (payload ? '_tournamentClientEventId') AND NOT (payload ? '_tournamentClientSequence')),
  1::bigint,
  'internal retry markers are not stored in the immutable game-start payload'
);
SELECT is(
  (SELECT s.event_id FROM public.start_tournament_game_for_user(
    '86000000-0000-4000-8000-000000000001', '87000000-0000-4000-8000-000000000001', 1,
    '{"homeLeadoffBatterId":"88000000-0000-4000-8000-000000000001"}', now()) s),
  '87000000-0000-4000-8000-000000000001'::uuid,
  'retry returns the original game-start row without duplicating it'
);

SELECT * FROM finish();
ROLLBACK;
