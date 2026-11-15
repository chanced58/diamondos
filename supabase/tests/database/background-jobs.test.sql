BEGIN;
SELECT plan(15);

-- Fixture: a coach, a team, a season and a regular (non-tournament) game.
INSERT INTO auth.users (id, instance_id, email, aud, role, raw_app_meta_data, created_at, updated_at)
VALUES
  ('91000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'jobs-coach@example.test', 'authenticated', 'authenticated', '{"provider":"email","providers":["email"]}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.teams (id, name, created_by)
VALUES ('92000000-0000-4000-8000-000000000001', 'Jobs Team', '91000000-0000-4000-8000-000000000001');
INSERT INTO public.team_members (team_id, user_id, role)
VALUES ('92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 'head_coach');
INSERT INTO public.seasons (id, team_id, name, start_date, end_date, is_active)
VALUES ('93000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', 'Fall', '2026-09-01', '2026-11-30', false);
INSERT INTO public.games (id, team_id, season_id, opponent_name, scheduled_at, created_by)
VALUES ('96000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000001', 'Hawks', '2026-11-10 16:00:00+00', '91000000-0000-4000-8000-000000000001');

-- 1. The trigger ships disabled.
SELECT is(
  (SELECT tgenabled::text FROM pg_trigger
    WHERE tgrelid = 'public.game_events'::regclass AND tgname = 'game_events_notify_pitch_count'),
  'D',
  'the pitch-count trigger exists and is disabled'
);

-- 2. The four schedules.
SELECT results_eq(
  $$ SELECT jobname::text, schedule::text FROM cron.job
     WHERE jobname IN ('rebuild-league-snapshots', 'practice-notifications-dispatch', 'collect-job-runs', 'prune-logs')
     ORDER BY jobname $$,
  $$ VALUES ('collect-job-runs', '*/5 * * * *'),
            ('practice-notifications-dispatch', '*/5 * * * *'),
            ('prune-logs', '15 9 * * *'),
            ('rebuild-league-snapshots', '0 */6 * * *') $$,
  'the four cron jobs are scheduled'
);

-- 3. Clients cannot reach job runs or configuration.
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT count(*) FROM public.job_runs $$, '42501', NULL, 'authenticated cannot read job_runs');
SELECT throws_ok($$ SELECT private.job_config('job_internal_secret') $$, '42501', NULL, 'authenticated cannot read job configuration');
RESET ROLE;

-- 4. Enabled, with no Vault secrets: the pitch is saved and the missing config is logged.
ALTER TABLE public.game_events ENABLE TRIGGER game_events_notify_pitch_count;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000001', true);
SELECT lives_ok(
  $$ INSERT INTO public.game_events (game_id, sequence_number, event_type, inning, is_top_of_inning, payload, occurred_at, created_by, device_id)
     VALUES ('96000000-0000-4000-8000-000000000001', 1, 'pitch_thrown', 1, true, '{"pitcherId":"x"}', now(), auth.uid(), 'jobs-test') $$,
  'a pitch insert succeeds when the job configuration is missing'
);
RESET ROLE;
SELECT is(
  (SELECT count(*) FROM public.app_error_log WHERE area = 'job.config'),
  1::bigint,
  'the missing configuration is logged once'
);

-- 5. A non-pitch event does not call the job.
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$ INSERT INTO public.game_events (game_id, sequence_number, event_type, inning, is_top_of_inning, payload, occurred_at, created_by, device_id)
     VALUES ('96000000-0000-4000-8000-000000000001', 2, 'game_start', 1, true, '{}', now(), auth.uid(), 'jobs-test') $$,
  'a non-pitch insert succeeds'
);
RESET ROLE;
SELECT is((SELECT count(*) FROM public.app_error_log), 1::bigint, 'a non-pitch event logs nothing');
SELECT is((SELECT count(*) FROM public.job_runs), 0::bigint, 'a non-pitch event queues no job run');

-- 6. With configuration, a failure inside job_http is logged and never raised.
SELECT vault.create_secret('http://127.0.0.1:54321/functions/v1', 'job_functions_base_url');
SELECT vault.create_secret('http://127.0.0.1:3000', 'job_web_base_url');
SELECT vault.create_secret('test-internal-secret', 'job_internal_secret');
SELECT vault.create_secret('test-cron-secret', 'job_cron_secret');

SELECT lives_ok(
  $$ SELECT private.job_http('pitch-count-calculator', 'BOGUS', 'job_functions_base_url', '/pitch-count-calculator', 'internal', '{}'::jsonb, 10000) $$,
  'job_http does not raise when the call fails'
);
SELECT is(
  (SELECT count(*) FROM public.app_error_log WHERE area = 'job.pitch-count-calculator'),
  1::bigint,
  'the failed call is logged under the job area'
);

-- 7. With configuration and the real pg_net, the pitch queues a request.
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$ INSERT INTO public.game_events (game_id, sequence_number, event_type, inning, is_top_of_inning, payload, occurred_at, created_by, device_id)
     VALUES ('96000000-0000-4000-8000-000000000001', 3, 'pitch_thrown', 1, true, '{"pitcherId":"x"}', now(), auth.uid(), 'jobs-test') $$,
  'a pitch insert succeeds when the job is configured'
);
RESET ROLE;
SELECT is(
  (SELECT count(*) FROM public.job_runs WHERE job = 'pitch-count-calculator' AND request_id IS NOT NULL),
  1::bigint,
  'the pitch records one job run with its pg_net request id'
);

-- 8. Health, with the trigger back off.
ALTER TABLE public.game_events DISABLE TRIGGER game_events_notify_pitch_count;
SET LOCAL ROLE service_role;
SELECT is((SELECT count(*) FROM public.admin_job_health()), 3::bigint, 'admin_job_health reports three jobs');
SELECT is(
  (SELECT enabled FROM public.admin_job_health() WHERE job = 'pitch-count-calculator'),
  false,
  'admin_job_health reports the pitch-count job disabled'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
