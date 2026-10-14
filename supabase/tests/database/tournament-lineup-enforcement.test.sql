BEGIN;
SELECT plan(10);

INSERT INTO auth.users (id, instance_id, email, aud, role, created_at, updated_at)
VALUES
  ('71000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'lineup-coach@example.test', 'authenticated', 'authenticated', now(), now()),
  ('71000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'lineup-scorekeeper@example.test', 'authenticated', 'authenticated', now(), now()),
  ('71000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'lineup-outsider@example.test', 'authenticated', 'authenticated', now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.teams (id, name, created_by)
VALUES ('72000000-0000-4000-8000-000000000001', 'Lineup Test Team', '71000000-0000-4000-8000-000000000001');
INSERT INTO public.team_members (team_id, user_id, role)
VALUES
  ('72000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001', 'head_coach'),
  ('72000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000002', 'scorekeeper');
INSERT INTO public.seasons (id, team_id, name, start_date, end_date, is_active)
VALUES ('73000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001', 'Regular', '2026-03-01', '2026-07-01', true);
INSERT INTO public.seasons (id, team_id, name, start_date, end_date, is_active)
VALUES ('73000000-0000-4000-8000-000000000002', '72000000-0000-4000-8000-000000000001', 'Tournament', '2026-10-20', '2026-10-22', false);
INSERT INTO public.players (id, team_id, first_name, last_name, jersey_number)
VALUES
  ('74000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001', 'Alex', 'One', 1),
  ('74000000-0000-4000-8000-000000000002', '72000000-0000-4000-8000-000000000001', 'Blake', 'Two', 2),
  ('74000000-0000-4000-8000-000000000003', '72000000-0000-4000-8000-000000000001', 'Casey', 'Three', 3),
  ('74000000-0000-4000-8000-000000000004', '72000000-0000-4000-8000-000000000001', 'Drew', 'Four', 4),
  ('74000000-0000-4000-8000-000000000005', '72000000-0000-4000-8000-000000000001', 'Evan', 'Five', 5),
  ('74000000-0000-4000-8000-000000000006', '72000000-0000-4000-8000-000000000001', 'Finley', 'Six', 6);
INSERT INTO public.tournaments (id, name, created_by, start_date, end_date, scoring_settings, request_id, request_payload)
VALUES
  ('75000000-0000-4000-8000-000000000001', 'Lineup Rules Cup', '71000000-0000-4000-8000-000000000001', '2026-10-20', '2026-10-22',
   '{"lineup":{"allowExpanded":true,"maxBatters":4,"allowMidGameExtension":true,"allowMidGameContraction":true}}',
   '76000000-0000-4000-8000-000000000001', '{}'),
  ('75000000-0000-4000-8000-000000000002', 'Fixed Lineup Cup', '71000000-0000-4000-8000-000000000001', '2026-10-20', '2026-10-22',
   '{"lineup":{"allowExpanded":false,"maxBatters":9,"allowMidGameExtension":false,"allowMidGameContraction":false}}',
   '76000000-0000-4000-8000-000000000002', '{}');
INSERT INTO public.tournament_teams (tournament_id, team_id, season_id)
VALUES
  ('75000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001', '73000000-0000-4000-8000-000000000002'),
  ('75000000-0000-4000-8000-000000000002', '72000000-0000-4000-8000-000000000001', '73000000-0000-4000-8000-000000000002');
INSERT INTO public.games (id, team_id, season_id, tournament_id, opponent_name, scheduled_at, created_by)
VALUES
  ('77000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001', '73000000-0000-4000-8000-000000000002', '75000000-0000-4000-8000-000000000001', 'Tigers', '2026-10-20 16:00:00+00', '71000000-0000-4000-8000-000000000001'),
  ('77000000-0000-4000-8000-000000000002', '72000000-0000-4000-8000-000000000001', '73000000-0000-4000-8000-000000000002', '75000000-0000-4000-8000-000000000002', 'Bears', '2026-10-21 16:00:00+00', '71000000-0000-4000-8000-000000000001');
INSERT INTO public.game_lineups (game_id, player_id, batting_order, starting_position, is_starter)
VALUES
  ('77000000-0000-4000-8000-000000000001', '74000000-0000-4000-8000-000000000001', 1, NULL, true),
  ('77000000-0000-4000-8000-000000000001', '74000000-0000-4000-8000-000000000002', 2, NULL, true),
  ('77000000-0000-4000-8000-000000000001', '74000000-0000-4000-8000-000000000003', 3, NULL, true),
  ('77000000-0000-4000-8000-000000000001', '74000000-0000-4000-8000-000000000004', 4, NULL, true),
  ('77000000-0000-4000-8000-000000000002', '74000000-0000-4000-8000-000000000001', 1, NULL, true),
  ('77000000-0000-4000-8000-000000000002', '74000000-0000-4000-8000-000000000002', 2, NULL, true);

SELECT public.start_tournament_game(
  '77000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001',
  '{"homeLeadoffBatterId":"74000000-0000-4000-8000-000000000001"}', now()
);
SELECT public.start_tournament_game(
  '77000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000001',
  '{"homeLeadoffBatterId":"74000000-0000-4000-8000-000000000001"}', now()
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000001', true);
SELECT throws_ok(
  $$ INSERT INTO public.game_events (id, game_id, sequence_number, event_type, inning, is_top_of_inning, payload, occurred_at, created_by, device_id)
     VALUES ('78000000-0000-4000-8000-000000000001', '77000000-0000-4000-8000-000000000001', 2, 'substitution', 1, false,
       '{"substitutionType":"lineup_contraction","outPlayerId":"74000000-0000-4000-8000-000000000001","removedBattingOrderPosition":1}', now(), auth.uid(), 'test') $$,
  '23514', NULL, 'the active leadoff slot cannot be contracted'
);

INSERT INTO public.game_events (id, game_id, sequence_number, event_type, inning, is_top_of_inning, payload, occurred_at, created_by, device_id)
VALUES ('78000000-0000-4000-8000-000000000002', '77000000-0000-4000-8000-000000000001', 2, 'hit', 1, false,
  '{"batterId":"74000000-0000-4000-8000-000000000001","hitType":"single"}', now(), auth.uid(), 'test');

SELECT set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000002', true);
SELECT throws_ok(
  $$ INSERT INTO public.game_events (id, game_id, sequence_number, event_type, inning, is_top_of_inning, payload, occurred_at, created_by, device_id)
     VALUES ('78000000-0000-4000-8000-000000000003', '77000000-0000-4000-8000-000000000001', 3, 'substitution', 1, false,
       '{"substitutionType":"lineup_extension","inPlayerId":"74000000-0000-4000-8000-000000000005","battingOrderPosition":5}', now(), auth.uid(), 'test') $$,
  '42501', NULL, 'scorekeepers cannot forge tournament lineup changes'
);

SELECT set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000003', true);
SELECT throws_ok(
  $$ INSERT INTO public.game_events (id, game_id, sequence_number, event_type, inning, is_top_of_inning, payload, occurred_at, created_by, device_id)
     VALUES ('78000000-0000-4000-8000-000000000010', '77000000-0000-4000-8000-000000000001', 3, 'substitution', 1, false,
       '{"substitutionType":"lineup_extension","inPlayerId":"74000000-0000-4000-8000-000000000005","battingOrderPosition":5}', now(), auth.uid(), 'test') $$,
  '42501', NULL, 'a non-member cannot forge a tournament lineup event'
);

SELECT set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000001', true);
SELECT throws_ok(
  $$ INSERT INTO public.game_events (id, game_id, sequence_number, event_type, inning, is_top_of_inning, payload, occurred_at, created_by, device_id)
     VALUES ('78000000-0000-4000-8000-000000000004', '77000000-0000-4000-8000-000000000001', 3, 'substitution', 1, false,
       '{"substitutionType":"lineup_contraction","outPlayerId":"74000000-0000-4000-8000-000000000001","removedBattingOrderPosition":1}', now(), auth.uid(), 'test') $$,
  '23514', NULL, 'a player currently on base cannot be contracted'
);

INSERT INTO public.game_events (id, game_id, sequence_number, event_type, inning, is_top_of_inning, payload, occurred_at, created_by, device_id)
VALUES ('78000000-0000-4000-8000-000000000005', '77000000-0000-4000-8000-000000000001', 3, 'substitution', 1, false,
  '{"substitutionType":"lineup_contraction","outPlayerId":"74000000-0000-4000-8000-000000000004","removedBattingOrderPosition":4}', now(), auth.uid(), 'test');
SELECT is((SELECT count(*) FROM public.game_lineups WHERE game_id = '77000000-0000-4000-8000-000000000001'), 4::bigint,
  'contraction records an event but keeps historical lineup rows');

INSERT INTO public.game_events (id, game_id, sequence_number, event_type, inning, is_top_of_inning, payload, occurred_at, created_by, device_id)
VALUES ('78000000-0000-4000-8000-000000000006', '77000000-0000-4000-8000-000000000001', 4, 'substitution', 1, false,
  '{"substitutionType":"lineup_extension","inPlayerId":"74000000-0000-4000-8000-000000000005","battingOrderPosition":5}', now(), auth.uid(), 'test');
SELECT is((SELECT count(*) FROM public.game_lineups WHERE game_id = '77000000-0000-4000-8000-000000000001' AND player_id = '74000000-0000-4000-8000-000000000005' AND batting_order = 5), 1::bigint,
  'an accepted extension projects its new slot for later stat consumers');
SELECT throws_ok(
  $$ INSERT INTO public.game_events (id, game_id, sequence_number, event_type, inning, is_top_of_inning, payload, occurred_at, created_by, device_id)
     VALUES ('78000000-0000-4000-8000-000000000007', '77000000-0000-4000-8000-000000000001', 5, 'substitution', 1, false,
       '{"substitutionType":"lineup_extension","inPlayerId":"74000000-0000-4000-8000-000000000006","battingOrderPosition":6}', now(), auth.uid(), 'test') $$,
  '23514', NULL, 'a serialized final-slot addition cannot exceed the tournament cap'
);

SELECT throws_ok(
  $$ INSERT INTO public.game_events (id, game_id, sequence_number, event_type, inning, is_top_of_inning, payload, occurred_at, created_by, device_id)
     VALUES ('78000000-0000-4000-8000-000000000011', '77000000-0000-4000-8000-000000000001', 5, 'substitution', 1, false,
       '{"substitutionType":"lineup_contraction","outPlayerId":"74000000-0000-4000-8000-000000000003","removedBattingOrderPosition":2}', now(), auth.uid(), 'test') $$,
  '23514', NULL, 'a forged player and stable-slot pair is rejected'
);

SELECT throws_ok(
  $$ INSERT INTO public.game_events (id, game_id, sequence_number, event_type, inning, is_top_of_inning, payload, occurred_at, created_by, device_id)
     VALUES ('78000000-0000-4000-8000-000000000008', '77000000-0000-4000-8000-000000000002', 2, 'substitution', 1, false,
       '{"substitutionType":"lineup_extension","inPlayerId":"74000000-0000-4000-8000-000000000005","battingOrderPosition":3}', now(), auth.uid(), 'test') $$,
  '23514', NULL, 'fixed tournament rules reject mid-game expansion'
);
SELECT throws_ok(
  $$ INSERT INTO public.game_events (id, game_id, sequence_number, event_type, inning, is_top_of_inning, payload, occurred_at, created_by, device_id)
     VALUES ('78000000-0000-4000-8000-000000000009', '77000000-0000-4000-8000-000000000002', 2, 'substitution', 1, false,
       '{"substitutionType":"lineup_contraction","outPlayerId":"74000000-0000-4000-8000-000000000002","removedBattingOrderPosition":2}', now(), auth.uid(), 'test') $$,
  '23514', NULL, 'fixed tournament rules reject mid-game contraction'
);

SELECT * FROM finish();
ROLLBACK;
