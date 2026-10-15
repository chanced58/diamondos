BEGIN;
SELECT plan(11);

INSERT INTO auth.users (id, instance_id, email, aud, role, created_at, updated_at)
VALUES
  ('61000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'tournament-coach@example.test', 'authenticated', 'authenticated', now(), now()),
  ('61000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'other-user@example.test', 'authenticated', 'authenticated', now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.teams (id, name, created_by)
VALUES ('62000000-0000-4000-8000-000000000001', 'Tournament Test Team', '61000000-0000-4000-8000-000000000001');
INSERT INTO public.team_members (team_id, user_id, role)
VALUES ('62000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001', 'head_coach');
INSERT INTO public.seasons (id, team_id, name, start_date, end_date, is_active)
VALUES
  ('63000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000001', 'Regular 2026', '2026-03-01', '2026-07-01', true),
  ('63000000-0000-4000-8000-000000000002', '62000000-0000-4000-8000-000000000001', 'Tournament Cup', '2026-10-20', '2026-10-22', false);
INSERT INTO public.tournaments (
  id, name, created_by, start_date, end_date, scoring_settings, request_id, request_payload
)
VALUES (
  '64000000-0000-4000-8000-000000000001', 'Tournament Cup', '61000000-0000-4000-8000-000000000001',
  '2026-10-20', '2026-10-22',
  '{"lineup":{"allowExpanded":true,"maxBatters":12,"allowMidGameExtension":true,"allowMidGameContraction":true}}',
  '65000000-0000-4000-8000-000000000001', '{}'
);
INSERT INTO public.tournament_teams (tournament_id, team_id, season_id)
VALUES ('64000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000001', '63000000-0000-4000-8000-000000000002');
INSERT INTO public.games (
  id, team_id, season_id, tournament_id, opponent_name, scheduled_at, created_by
)
VALUES (
  '66000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000001',
  '63000000-0000-4000-8000-000000000002', '64000000-0000-4000-8000-000000000001',
  'Ravens', '2026-10-20 16:00:00+00', '61000000-0000-4000-8000-000000000001'
);

SELECT is(
  (SELECT count(*) FROM public.games WHERE id = '66000000-0000-4000-8000-000000000001'
    AND tournament_id = '64000000-0000-4000-8000-000000000001'
    AND season_id = '63000000-0000-4000-8000-000000000002'),
  1::bigint,
  'game is registered to the tournament team and its dedicated season'
);

SELECT throws_ok(
  $$ INSERT INTO public.games (id, team_id, season_id, tournament_id, opponent_name, scheduled_at, created_by)
     VALUES ('66000000-0000-4000-8000-000000000002', '62000000-0000-4000-8000-000000000001',
       '63000000-0000-4000-8000-000000000001', '64000000-0000-4000-8000-000000000001',
       'Falcons', '2026-10-21 16:00:00+00', '61000000-0000-4000-8000-000000000001') $$,
  '23503', NULL, 'tournament cannot be paired with an unregistered team-season combination'
);

SELECT throws_ok(
  $$ SELECT public.start_tournament_game(
       '66000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000002',
       '{"pitchTypeEnabled":true}'::jsonb, now()) $$,
  '42501', NULL, 'starting a tournament game requires an active team coach'
);

SELECT isnt(
  public.start_tournament_game(
    '66000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001',
    '{"pitchTypeEnabled":true}'::jsonb, now()
  ),
  NULL::uuid,
  'authorized coach starts the tournament game'
);
SELECT is(
  (SELECT scoring_settings_snapshot->'lineup'->>'maxBatters' FROM public.games
   WHERE id = '66000000-0000-4000-8000-000000000001'),
  '12',
  'game freezes the tournament rules when it starts'
);
SELECT is(
  (SELECT status::text FROM public.games WHERE id = '66000000-0000-4000-8000-000000000001'),
  'in_progress',
  'game status and the frozen settings update with the start event'
);
SELECT is(
  (SELECT payload->'tournamentScoringSettings'->'lineup'->>'maxBatters'
   FROM public.game_events WHERE game_id = '66000000-0000-4000-8000-000000000001' AND event_type = 'game_start'),
  '12',
  'immutable start event records the same tournament rule snapshot'
);
SELECT is(
  public.start_tournament_game(
    '66000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001',
    '{"pitchTypeEnabled":true}'::jsonb, now()
  ),
  (SELECT id FROM public.game_events WHERE game_id = '66000000-0000-4000-8000-000000000001' AND event_type = 'game_start'),
  'retry returns the original start event without duplicating it'
);

UPDATE public.tournaments
SET scoring_settings = '{"lineup":{"allowExpanded":false,"maxBatters":9,"allowMidGameExtension":false,"allowMidGameContraction":false}}'
WHERE id = '64000000-0000-4000-8000-000000000001';
SELECT is(
  (SELECT scoring_settings_snapshot->'lineup'->>'maxBatters' FROM public.games
   WHERE id = '66000000-0000-4000-8000-000000000001'),
  '12',
  'later tournament rule edits do not alter a started game snapshot'
);

SELECT throws_ok(
  $$ UPDATE public.games
     SET scoring_settings_snapshot = '{"lineup":{"allowExpanded":false,"maxBatters":9}}'
     WHERE id = '66000000-0000-4000-8000-000000000001' $$,
  '23514', NULL, 'a started game rejects changes to its frozen settings'
);

INSERT INTO public.games (id, team_id, season_id, opponent_name, scheduled_at, created_by)
VALUES (
  '66000000-0000-4000-8000-000000000003', '62000000-0000-4000-8000-000000000001',
  '63000000-0000-4000-8000-000000000001', 'Regular Opponent', '2026-06-01 16:00:00+00',
  '61000000-0000-4000-8000-000000000001'
);
SELECT is(
  (SELECT tournament_id FROM public.games WHERE id = '66000000-0000-4000-8000-000000000003'),
  NULL::uuid,
  'regular games retain an untagged regular-season path'
);

SELECT * FROM finish();
ROLLBACK;
