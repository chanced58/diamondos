BEGIN;
SELECT plan(20);

INSERT INTO auth.users (id, instance_id, email, aud, role, created_at, updated_at)
VALUES
  ('51000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'tournament-enabled@example.test', 'authenticated', 'authenticated', now(), now()),
  ('51000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'tournament-disabled@example.test', 'authenticated', 'authenticated', now(), now()),
  ('51000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'other-coach@example.test', 'authenticated', 'authenticated', now(), now())
ON CONFLICT (id) DO NOTHING;

UPDATE public.user_profiles SET tournament_mode_enabled = true
WHERE id = '51000000-0000-4000-8000-000000000001';
INSERT INTO public.teams (id, name, created_by)
VALUES ('52000000-0000-4000-8000-000000000001', 'Administered Lions', '51000000-0000-4000-8000-000000000001');
INSERT INTO public.team_members (team_id, user_id, role)
VALUES ('52000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', 'head_coach');
INSERT INTO public.seasons (id, team_id, name, start_date, end_date, is_active)
VALUES ('53000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000001', 'Regular season', '2026-03-01', '2026-07-01', true);

CREATE FUNCTION pg_temp.fail_rollback_tournament_channel()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.teams WHERE id = NEW.team_id AND name = 'Rollback Test Team') THEN
    RAISE EXCEPTION 'injected announcement channel failure';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER tournament_creation_test_channel_failure
  BEFORE INSERT ON public.channels
  FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_rollback_tournament_channel();

UPDATE public.user_profiles SET tournament_mode_enabled = true
WHERE id = '51000000-0000-4000-8000-000000000003';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '51000000-0000-4000-8000-000000000002', true);
SELECT throws_ok(
  $$ UPDATE public.user_profiles SET tournament_mode_enabled = true WHERE id = '51000000-0000-4000-8000-000000000002' $$,
  '42501', NULL, 'users cannot grant tournament mode to themselves'
);
SELECT lives_ok(
  $$ SELECT * FROM public.create_tournament('{"name":"Open Cup","startDate":"2026-10-20","endDate":"2026-10-22","requestId":"54000000-0000-4000-8000-000000000001","team":{"type":"new","name":"Open Cup Team"},"lineup":{"allowExpanded":false,"allowMidGameChanges":false}}'::jsonb) $$,
  'any signed-in user can create a separate tournament team without a tournament mode grant'
);

SELECT set_config('request.jwt.claim.sub', '51000000-0000-4000-8000-000000000001', true);
SELECT throws_ok(
  $$ SELECT * FROM public.create_tournament('{"name":"Foreign Team Cup","startDate":"2026-10-20","endDate":"2026-10-22","requestId":"54000000-0000-4000-8000-000000000004","team":{"type":"existing","teamId":"52000000-0000-4000-8000-000000000002"},"lineup":{"allowExpanded":false,"allowMidGameChanges":false}}'::jsonb) $$,
  '42501', NULL, 'creators still need an active admin role on the selected team'
);
SELECT isnt(
  (SELECT season_id FROM public.create_tournament('{"name":"Existing Team Cup","startDate":"2026-10-20","endDate":"2026-10-22","requestId":"54000000-0000-4000-8000-000000000002","team":{"type":"existing","teamId":"52000000-0000-4000-8000-000000000001"},"lineup":{"allowExpanded":false,"allowMidGameChanges":false}}'::jsonb)),
  '53000000-0000-4000-8000-000000000001'::uuid,
  'existing-team tournament creates a dedicated season'
);
SELECT is((SELECT count(*) FROM public.tournaments WHERE name = 'Existing Team Cup'), 1::bigint, 'existing-team branch creates one tournament');
SELECT ok(NOT has_function_privilege('anon', 'public.is_tournament_member(uuid,uuid)', 'EXECUTE'),
 'anonymous callers cannot invoke the membership lookup');
SELECT ok(public.is_tournament_member((SELECT id FROM public.tournaments WHERE name = 'Existing Team Cup'),
 '51000000-0000-4000-8000-000000000001'),
 'authenticated participants can check their own membership');
SELECT set_config('test.tournament_id', (SELECT id::text FROM public.tournaments WHERE name = 'Existing Team Cup'), true);
SELECT set_config('request.jwt.claim.sub', '51000000-0000-4000-8000-000000000002', true);
SELECT ok(NOT public.is_tournament_member(current_setting('test.tournament_id')::uuid,
 '51000000-0000-4000-8000-000000000001'), 'authenticated callers cannot inspect another user membership');
SELECT set_config('request.jwt.claim.sub', '51000000-0000-4000-8000-000000000001', true);


SELECT is((SELECT count(*) FROM public.seasons WHERE team_id = '52000000-0000-4000-8000-000000000001' AND is_active), 1::bigint, 'existing-team branch preserves its active regular season');
SELECT is((SELECT count(*) FROM public.tournament_teams tt JOIN public.tournaments t ON t.id = tt.tournament_id WHERE t.name = 'Existing Team Cup' AND tt.team_id <> '52000000-0000-4000-8000-000000000001'), 0::bigint, 'existing-team branch does not create an extra team');
SELECT is((SELECT count(*) FROM public.create_tournament('{"name":"Existing Team Cup","startDate":"2026-10-20","endDate":"2026-10-22","requestId":"54000000-0000-4000-8000-000000000002","team":{"type":"existing","teamId":"52000000-0000-4000-8000-000000000001"},"lineup":{"allowExpanded":false,"allowMidGameChanges":false}}'::jsonb)), 1::bigint, 'retry with the same request ID returns the original result');
CREATE TEMP TABLE new_tournament_result AS SELECT * FROM public.create_tournament('{"name":"One Weekend Cup","startDate":"2026-10-20","endDate":"2026-10-22","requestId":"54000000-0000-4000-8000-000000000003","team":{"type":"new","name":"One Weekend Team"},"lineup":{"allowExpanded":true,"maxBatters":12,"allowMidGameChanges":true}}'::jsonb);
SELECT is(
  (SELECT count(*) FROM new_tournament_result r
   JOIN public.tournament_teams tt ON tt.tournament_id = r.tournament_id AND tt.team_id = r.team_id AND tt.season_id = r.season_id
   JOIN public.seasons s ON s.id = r.season_id AND s.team_id = r.team_id AND s.is_active
   JOIN public.team_members tm ON tm.team_id = r.team_id AND tm.user_id = auth.uid() AND tm.role = 'head_coach'
   JOIN public.channels c ON c.team_id = r.team_id AND c.name = 'Announcements'
   JOIN public.channel_members cm ON cm.channel_id = c.id AND cm.user_id = auth.uid() AND cm.can_post),
  1::bigint,
  'new-team branch creates a coach-managed tournament team and announcement channel'
);
SELECT throws_ok(
  $$ SELECT * FROM public.create_tournament('{"name":"Rollback Cup","startDate":"2026-10-20","endDate":"2026-10-22","requestId":"54000000-0000-4000-8000-000000000005","team":{"type":"new","name":"Rollback Test Team"},"lineup":{"allowExpanded":false,"allowMidGameChanges":false}}'::jsonb) $$,
  'P0001', 'injected announcement channel failure', 'channel creation failure aborts the tournament transaction'
);
SELECT is(
  (SELECT count(*) FROM public.tournaments WHERE request_id = '54000000-0000-4000-8000-000000000005')
  + (SELECT count(*) FROM public.teams WHERE name = 'Rollback Test Team'),
  0::bigint,
  'failed creation leaves no tournament or orphan team'
);

SELECT throws_ok(
 $$ SELECT public.set_tournament_mode_permission(auth.uid(), true) $$,
 '42501', NULL, 'a non-admin cannot grant permissions through the management RPC');
SELECT throws_ok(
 $$ SELECT * FROM public.create_tournament('{"name":"Different request body","startDate":"2026-10-20","endDate":"2026-10-22","requestId":"54000000-0000-4000-8000-000000000002","team":{"type":"existing","teamId":"52000000-0000-4000-8000-000000000001"},"lineup":{"allowExpanded":false,"allowMidGameChanges":false}}') $$,
 '23505', NULL, 'an idempotency key cannot be reused for different input');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
UPDATE public.user_profiles SET tournament_mode_enabled = false WHERE id = '51000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '51000000-0000-4000-8000-000000000001', true);
SELECT lives_ok(
 $$ SELECT * FROM public.create_tournament('{"name":"Revoked grant","startDate":"2026-10-20","endDate":"2026-10-22","requestId":"54000000-0000-4000-8000-000000000006","team":{"type":"new","name":"Revoked grant team"},"lineup":{"allowExpanded":false,"allowMidGameChanges":false}}') $$,
 'the legacy tournament mode flag no longer gates creation');
SELECT is((SELECT count(*) FROM public.tournaments WHERE name = 'Existing Team Cup'), 1::bigint,
 'clearing the legacy flag preserves access to the existing tournament');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
UPDATE public.user_profiles SET tournament_mode_enabled = true WHERE id = '51000000-0000-4000-8000-000000000001';
UPDATE public.team_members SET is_active = false WHERE team_id = '52000000-0000-4000-8000-000000000001';
SELECT is((SELECT count(*) FROM public.tournament_mode_permission_audit WHERE user_id = '51000000-0000-4000-8000-000000000001'),
 3::bigint, 'grant, revocation, and regrant each produce an audit record');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '51000000-0000-4000-8000-000000000001', true);
SELECT throws_ok(
 $$ SELECT * FROM public.create_tournament('{"name":"Inactive membership","startDate":"2026-10-20","endDate":"2026-10-22","requestId":"54000000-0000-4000-8000-000000000007","team":{"type":"existing","teamId":"52000000-0000-4000-8000-000000000001"},"lineup":{"allowExpanded":false,"allowMidGameChanges":false}}') $$,
 '42501', NULL, 'inactive team administration cannot create a tournament');
SELECT * FROM finish();
ROLLBACK;
