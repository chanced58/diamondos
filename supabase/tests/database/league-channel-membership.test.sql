BEGIN;
SELECT plan(31);

-- Users: 1 league admin, 2 league manager, 3 head coach (team A),
-- 4 assistant coach (team A), 5 athletic director (team A), 6 player (team A),
-- 7 parent (team A), 8 head coach (team B), 9 later coach (team A).
-- Email-provider signups pass enforce_invite_only_signup.
INSERT INTO auth.users (id, instance_id, email, aud, role, raw_app_meta_data, created_at, updated_at)
SELECT ('61000000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-0000-0000-000000000000',
       'league-channel-' || n || '@example.test', 'authenticated', 'authenticated',
       '{"provider":"email","providers":["email"]}'::jsonb, now(), now()
FROM generate_series(1, 9) AS n
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.teams (id, name, created_by) VALUES
  ('62000000-0000-4000-8000-000000000001', 'Channel Huskies', '61000000-0000-4000-8000-000000000003'),
  ('62000000-0000-4000-8000-000000000002', 'Channel Bobcats', '61000000-0000-4000-8000-000000000008');
INSERT INTO public.team_members (team_id, user_id, role) VALUES
  ('62000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000003', 'head_coach'),
  ('62000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000004', 'assistant_coach'),
  ('62000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000005', 'athletic_director'),
  ('62000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000006', 'player'),
  ('62000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000007', 'parent'),
  ('62000000-0000-4000-8000-000000000002', '61000000-0000-4000-8000-000000000008', 'head_coach');

INSERT INTO public.leagues (id, name, slug, created_by)
VALUES ('63000000-0000-4000-8000-000000000001', 'Channel League', 'channel-league-test', '61000000-0000-4000-8000-000000000001');
INSERT INTO public.league_staff (league_id, user_id, role)
VALUES ('63000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001', 'league_admin');
INSERT INTO public.league_members (league_id, team_id)
VALUES ('63000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000001');

INSERT INTO public.league_channels (id, league_id, channel_type, name, created_by) VALUES
  ('64000000-0000-4000-8000-000000000001', '63000000-0000-4000-8000-000000000001', 'announcement', 'League Announcements', '61000000-0000-4000-8000-000000000001'),
  ('64000000-0000-4000-8000-000000000002', '63000000-0000-4000-8000-000000000001', 'direct', NULL, '61000000-0000-4000-8000-000000000001');

-- can_post of a user's membership in a channel, or NULL when not a member.
CREATE FUNCTION pg_temp.can_post(p_channel uuid, p_user uuid)
RETURNS boolean
LANGUAGE sql
AS $$
  SELECT can_post FROM public.league_channel_members
  WHERE league_channel_id = p_channel AND user_id = p_user;
$$;

-- A new channel gets every eligible member.
SELECT is(pg_temp.can_post('64000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001'), true,
  'league admin joins a new announcement channel and can post');
SELECT is(pg_temp.can_post('64000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000003'), false,
  'head coach of a member team joins read-only');
SELECT is(pg_temp.can_post('64000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000004'), false,
  'assistant coach of a member team joins read-only');
SELECT is(pg_temp.can_post('64000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000005'), false,
  'athletic director of a member team joins read-only');
SELECT is(pg_temp.can_post('64000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000006'), NULL,
  'players do not join league channels');
SELECT is(pg_temp.can_post('64000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000007'), NULL,
  'parents do not join league channels');
SELECT is(pg_temp.can_post('64000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000008'), NULL,
  'coaches of teams outside the league do not join');
SELECT is((SELECT count(*)::int FROM public.league_channel_members WHERE league_channel_id = '64000000-0000-4000-8000-000000000002'), 0,
  'direct league channels get no automatic members');

-- Team joins and leaves the league.
INSERT INTO public.league_members (league_id, team_id)
VALUES ('63000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000002');
SELECT is(pg_temp.can_post('64000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000008'), false,
  'a coach joins read-only when their team joins the league');
UPDATE public.league_members SET is_active = false
WHERE league_id = '63000000-0000-4000-8000-000000000001' AND team_id = '62000000-0000-4000-8000-000000000002';
SELECT is(pg_temp.can_post('64000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000008'), NULL,
  'a coach is removed when their team is deactivated in the league');
UPDATE public.league_members SET is_active = true
WHERE league_id = '63000000-0000-4000-8000-000000000001' AND team_id = '62000000-0000-4000-8000-000000000002';
SELECT is(pg_temp.can_post('64000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000008'), false,
  'a coach rejoins when their team is reactivated');
DELETE FROM public.league_members
WHERE league_id = '63000000-0000-4000-8000-000000000001' AND team_id = '62000000-0000-4000-8000-000000000002';
SELECT is(pg_temp.can_post('64000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000008'), NULL,
  'a coach is removed when their team leaves the league');

-- Coaches join, change role and leave a member team.
INSERT INTO public.team_members (team_id, user_id, role)
VALUES ('62000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000009', 'player');
SELECT is(pg_temp.can_post('64000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000009'), NULL,
  'joining a member team as a player adds nothing');
UPDATE public.team_members SET role = 'assistant_coach'
WHERE team_id = '62000000-0000-4000-8000-000000000001' AND user_id = '61000000-0000-4000-8000-000000000009';
SELECT is(pg_temp.can_post('64000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000009'), false,
  'becoming a coach of a member team joins read-only');
UPDATE public.team_members SET is_active = false
WHERE team_id = '62000000-0000-4000-8000-000000000001' AND user_id = '61000000-0000-4000-8000-000000000009';
SELECT is(pg_temp.can_post('64000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000009'), NULL,
  'a coach is removed when deactivated on the team');
UPDATE public.team_members SET is_active = true
WHERE team_id = '62000000-0000-4000-8000-000000000001' AND user_id = '61000000-0000-4000-8000-000000000009';
DELETE FROM public.team_members
WHERE team_id = '62000000-0000-4000-8000-000000000001' AND user_id = '61000000-0000-4000-8000-000000000009';
SELECT is(pg_temp.can_post('64000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000009'), NULL,
  'a coach is removed when they leave the team');

-- A coach on two member teams stays while either team remains.
INSERT INTO public.league_members (league_id, team_id)
VALUES ('63000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000002');
INSERT INTO public.team_members (team_id, user_id, role)
VALUES ('62000000-0000-4000-8000-000000000002', '61000000-0000-4000-8000-000000000003', 'assistant_coach');
UPDATE public.team_members SET is_active = false
WHERE team_id = '62000000-0000-4000-8000-000000000001' AND user_id = '61000000-0000-4000-8000-000000000003';
SELECT is(pg_temp.can_post('64000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000003'), false,
  'a coach leaving one member team stays through another');

-- Staff changes.
INSERT INTO public.league_staff (league_id, user_id, role)
VALUES ('63000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000002', 'league_manager');
SELECT is(pg_temp.can_post('64000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000002'), true,
  'a league manager joins and can post');
INSERT INTO public.league_staff (league_id, user_id, role)
VALUES ('63000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000004', 'league_manager');
SELECT is(pg_temp.can_post('64000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000004'), true,
  'a coach who becomes league staff can post');
UPDATE public.league_staff SET is_active = false
WHERE league_id = '63000000-0000-4000-8000-000000000001' AND user_id = '61000000-0000-4000-8000-000000000004';
SELECT is(pg_temp.can_post('64000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000004'), false,
  'staff who still coach a member team drop to read-only when removed from staff');
DELETE FROM public.league_staff
WHERE league_id = '63000000-0000-4000-8000-000000000001' AND user_id = '61000000-0000-4000-8000-000000000002';
SELECT is(pg_temp.can_post('64000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000002'), NULL,
  'staff with no member team are removed when removed from staff');

-- Channels created later.
INSERT INTO public.league_channels (id, league_id, channel_type, name, created_by)
VALUES ('64000000-0000-4000-8000-000000000003', '63000000-0000-4000-8000-000000000001', 'topic', 'Umpires', '61000000-0000-4000-8000-000000000001');
SELECT is(
  (SELECT array_agg(user_id::text || ':' || can_post::text ORDER BY user_id)
   FROM public.league_channel_members WHERE league_channel_id = '64000000-0000-4000-8000-000000000003'),
  ARRAY[
    '61000000-0000-4000-8000-000000000001:true',
    '61000000-0000-4000-8000-000000000003:false',
    '61000000-0000-4000-8000-000000000004:false',
    '61000000-0000-4000-8000-000000000005:false',
    '61000000-0000-4000-8000-000000000008:false'
  ],
  'a new topic channel gets staff (posting) and member-team coaches (read-only)'
);

-- Legacy explicit staff inserts from the service role.
SELECT lives_ok(
  $$ INSERT INTO public.league_channel_members (league_channel_id, user_id, can_post)
     VALUES ('64000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001', true) $$,
  'a trusted duplicate insert of an existing member is skipped instead of failing'
);
SELECT is(pg_temp.can_post('64000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001'), true,
  'the skipped duplicate leaves the derived membership in place');

-- Members cannot grant themselves posting rights.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000005', true);
SELECT throws_ok(
  $$ UPDATE public.league_channel_members SET can_post = true
     WHERE league_channel_id = '64000000-0000-4000-8000-000000000001' AND user_id = '61000000-0000-4000-8000-000000000005' $$,
  '42501', NULL, 'a read-only member cannot grant themselves can_post'
);
SELECT lives_ok(
  $$ UPDATE public.league_channel_members SET last_read_at = now()
     WHERE league_channel_id = '64000000-0000-4000-8000-000000000001' AND user_id = '61000000-0000-4000-8000-000000000005' $$,
  'a member can still mark the channel read'
);
SELECT throws_ok(
  $$ INSERT INTO public.league_channel_members (league_channel_id, user_id, can_post)
     VALUES ('64000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000005', true) $$,
  NULL, NULL, 'a signed-in user cannot use a duplicate insert to change their membership'
);
RESET ROLE;
SELECT is(pg_temp.can_post('64000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000005'), false,
  'the athletic director is still read-only');

-- Cascading deletes.
SELECT lives_ok(
  $$ DELETE FROM public.teams WHERE id = '62000000-0000-4000-8000-000000000002' $$,
  'deleting a member team cascades without error'
);
SELECT is(pg_temp.can_post('64000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000008'), NULL,
  'coaches of a deleted team leave the league channels');
SELECT lives_ok(
  $$ DELETE FROM public.leagues WHERE id = '63000000-0000-4000-8000-000000000001' $$,
  'deleting the league cascades without error'
);

SELECT * FROM finish();
ROLLBACK;
