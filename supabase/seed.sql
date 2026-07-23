-- Development seed data
-- Run with: supabase db reset (or supabase seed)
-- Note: pitch_compliance_rules presets are seeded in migration 000009

-- Seed a test user profile (user must exist in auth.users via Supabase Studio or CLI)
-- insert into public.user_profiles (id, first_name, last_name)
-- values ('00000000-0000-0000-0000-000000000001', 'Test', 'Coach')
-- on conflict do nothing;

-- ─── Tier 5 — Integration Hub test fixtures ─────────────────────────────────
-- Deterministic team + practices + games for ICS-feed verification. Scoped
-- entirely under the 5eed0000-… namespace so it's trivial to identify and
-- delete. Dates are relative to now() so the feed is always fresh.

-- Dummy auth.users row (required because practices.created_by and
-- games.created_by both have NOT NULL references to auth.users).
insert into auth.users (id, instance_id, email, aud, role, created_at, updated_at)
values (
  '5eed0000-0000-0000-0000-0000000000cc',
  '00000000-0000-0000-0000-000000000000',
  'tier5-seed@example.test',
  'authenticated',
  'authenticated',
  now(),
  now()
)
on conflict (id) do nothing;

insert into public.teams (id, name, organization, state_code, created_by)
values (
  '5eed0000-0000-0000-0000-000000000001',
  'Tier 5 Test Lions',
  'DiamondOS Dev',
  'CA',
  '5eed0000-0000-0000-0000-0000000000cc'
)
on conflict (id) do nothing;

insert into public.seasons (id, team_id, name, start_date, end_date, is_active)
values (
  '5eed0000-0000-0000-0000-000000000002',
  '5eed0000-0000-0000-0000-000000000001',
  'Tier 5 Test Season',
  current_date,
  current_date + interval '180 days',
  true
)
on conflict (id) do nothing;

insert into public.practices (id, team_id, scheduled_at, duration_minutes, location, created_by)
values
  ('5eed0000-0000-0000-0000-000000000101',
   '5eed0000-0000-0000-0000-000000000001',
   now() + interval '2 days',
   90,
   'Main Field',
   '5eed0000-0000-0000-0000-0000000000cc'),
  ('5eed0000-0000-0000-0000-000000000102',
   '5eed0000-0000-0000-0000-000000000001',
   now() + interval '5 days',
   75,
   'Batting Cages',
   '5eed0000-0000-0000-0000-0000000000cc'),
  ('5eed0000-0000-0000-0000-000000000103',
   '5eed0000-0000-0000-0000-000000000001',
   now() + interval '9 days',
   120,
   'Main Field; weather backup: Gym B',
   '5eed0000-0000-0000-0000-0000000000cc')
on conflict (id) do nothing;

insert into public.games (id, season_id, team_id, opponent_name, scheduled_at, location_type, venue_name, created_by)
values
  ('5eed0000-0000-0000-0000-000000000201',
   '5eed0000-0000-0000-0000-000000000002',
   '5eed0000-0000-0000-0000-000000000001',
   'Hillcrest Hornets',
   now() + interval '7 days',
   'home',
   'Lakeside Field',
   '5eed0000-0000-0000-0000-0000000000cc'),
  ('5eed0000-0000-0000-0000-000000000202',
   '5eed0000-0000-0000-0000-000000000002',
   '5eed0000-0000-0000-0000-000000000001',
   'Western, JV',  -- comma intentional — tests RFC 5545 escaping
   now() + interval '12 days',
   'away',
   'Western HS Stadium',
   '5eed0000-0000-0000-0000-0000000000cc')
on conflict (id) do nothing;

-- Calendar integration config with initial token version.
insert into public.team_integrations (team_id, service, config, connected_by)
values (
  '5eed0000-0000-0000-0000-000000000001',
  'calendar_ics',
  jsonb_build_object('ics_token_version', 1),
  '5eed0000-0000-0000-0000-0000000000cc'
)
on conflict (team_id, service) do nothing;

-- ─── Tier 5 — Mobile dev fixtures ────────────────────────────────────────────
-- Test coach login + full 14-player roster + pre-set starting lineup for
-- the Hillcrest Hornets game. Scoped under 5eed0001-… (coach) and 5eed0002-…
-- (players). Password: DiamondOS123!
--
-- After running `supabase db reset`, sign in on the mobile app with:
--   Email:    coach@diamondos.test
--   Password: DiamondOS123!

-- pgcrypto is available in local Supabase for bcrypt hashing.
create extension if not exists pgcrypto;

-- Test coach — email/password auth so the emulator can log in without magic-link.
insert into auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  aud,
  role,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  is_sso_user,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change
)
values (
  '5eed0001-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'coach@diamondos.test',
  crypt('DiamondOS123!', gen_salt('bf', 10)),
  now(),
  'authenticated',
  'authenticated',
  '{"provider":"email","providers":["email"]}',
  '{}',
  false,
  false,
  now(),
  now(),
  '',
  '',
  '',
  ''
)
on conflict (id) do nothing;

-- The handle_new_user trigger creates an empty user_profiles row on INSERT.
-- Update it to set the coach's display name.
insert into public.user_profiles (id, first_name, last_name)
values ('5eed0001-0000-0000-0000-000000000001', 'Alex', 'Rivera')
on conflict (id) do update
  set first_name = excluded.first_name,
      last_name  = excluded.last_name;

-- Make the coach head coach of the Tier 5 Lions.
insert into public.team_members (team_id, user_id, role, is_active)
values (
  '5eed0000-0000-0000-0000-000000000001',
  '5eed0001-0000-0000-0000-000000000001',
  'head_coach',
  true
)
on conflict (team_id, user_id) do nothing;

-- ─── Roster: 14 players ───────────────────────────────────────────────────────

insert into public.players
  (id, team_id, first_name, last_name, jersey_number, primary_position, bats, throws, is_active)
values
  -- Starters (batting order 1-9)
  ('5eed0002-0000-0000-0000-000000000001', '5eed0000-0000-0000-0000-000000000001',
   'Ryan',   'Torres',   8,  'center_field',  'right', 'right', true),
  ('5eed0002-0000-0000-0000-000000000002', '5eed0000-0000-0000-0000-000000000001',
   'Dylan',  'Pierce',   11, 'second_base',   'right', 'right', true),
  ('5eed0002-0000-0000-0000-000000000003', '5eed0000-0000-0000-0000-000000000001',
   'Tyler',  'Brooks',   24, 'first_base',    'left',  'left',  true),
  ('5eed0002-0000-0000-0000-000000000004', '5eed0000-0000-0000-0000-000000000001',
   'Aiden',  'Scott',    17, 'designated_hitter', 'right', 'right', true),
  ('5eed0002-0000-0000-0000-000000000005', '5eed0000-0000-0000-0000-000000000001',
   'Zach',   'Williams', 15, 'third_base',    'right', 'right', true),
  ('5eed0002-0000-0000-0000-000000000006', '5eed0000-0000-0000-0000-000000000001',
   'Connor', 'Walsh',     7, 'catcher',       'right', 'right', true),
  ('5eed0002-0000-0000-0000-000000000007', '5eed0000-0000-0000-0000-000000000001',
   'Caleb',  'Johnson',  22, 'left_field',    'left',  'right', true),
  ('5eed0002-0000-0000-0000-000000000008', '5eed0000-0000-0000-0000-000000000001',
   'Noah',   'Campbell',  3, 'right_field',   'right', 'right', true),
  ('5eed0002-0000-0000-0000-000000000009', '5eed0000-0000-0000-0000-000000000001',
   'Marcus', 'Evans',     4, 'shortstop',     'right', 'right', true),
  -- Starting pitcher (DH lineup — no batting order)
  ('5eed0002-0000-0000-0000-00000000000a', '5eed0000-0000-0000-0000-000000000001',
   'Jake',   'Martinez', 18, 'pitcher',       'right', 'right', true),
  -- Bench / reserves
  ('5eed0002-0000-0000-0000-00000000000b', '5eed0000-0000-0000-0000-000000000001',
   'Hunter', 'Davis',    27, 'utility',       'switch', 'right', true),
  ('5eed0002-0000-0000-0000-00000000000c', '5eed0000-0000-0000-0000-000000000001',
   'Liam',   'Chen',     12, 'pitcher',       'right', 'right', true),
  ('5eed0002-0000-0000-0000-00000000000d', '5eed0000-0000-0000-0000-000000000001',
   'Owen',   'Rivera',    2, 'catcher',       'right', 'right', true),
  ('5eed0002-0000-0000-0000-00000000000e', '5eed0000-0000-0000-0000-000000000001',
   'Ethan',  'Murphy',    6, 'shortstop',     'right', 'right', true)
on conflict (id) do nothing;

-- Team memberships — team_members_view_players (and other RLS policies) key
-- off player_team_memberships, not players.team_id directly. Real roster
-- assignment goes through fn_transfer_player, which keeps both in sync; seed
-- data inserts players.team_id directly, so this block does the same work
-- fn_transfer_player would have done, or the roster is invisible to coaches.
insert into public.player_team_memberships (player_id, team_id, jersey_number, is_active)
values
  ('5eed0002-0000-0000-0000-000000000001', '5eed0000-0000-0000-0000-000000000001', 8,  true),
  ('5eed0002-0000-0000-0000-000000000002', '5eed0000-0000-0000-0000-000000000001', 11, true),
  ('5eed0002-0000-0000-0000-000000000003', '5eed0000-0000-0000-0000-000000000001', 24, true),
  ('5eed0002-0000-0000-0000-000000000004', '5eed0000-0000-0000-0000-000000000001', 17, true),
  ('5eed0002-0000-0000-0000-000000000005', '5eed0000-0000-0000-0000-000000000001', 15, true),
  ('5eed0002-0000-0000-0000-000000000006', '5eed0000-0000-0000-0000-000000000001', 7,  true),
  ('5eed0002-0000-0000-0000-000000000007', '5eed0000-0000-0000-0000-000000000001', 22, true),
  ('5eed0002-0000-0000-0000-000000000008', '5eed0000-0000-0000-0000-000000000001', 3,  true),
  ('5eed0002-0000-0000-0000-000000000009', '5eed0000-0000-0000-0000-000000000001', 4,  true),
  ('5eed0002-0000-0000-0000-00000000000a', '5eed0000-0000-0000-0000-000000000001', 18, true),
  ('5eed0002-0000-0000-0000-00000000000b', '5eed0000-0000-0000-0000-000000000001', 27, true),
  ('5eed0002-0000-0000-0000-00000000000c', '5eed0000-0000-0000-0000-000000000001', 12, true),
  ('5eed0002-0000-0000-0000-00000000000d', '5eed0000-0000-0000-0000-000000000001', 2,  true),
  ('5eed0002-0000-0000-0000-00000000000e', '5eed0000-0000-0000-0000-000000000001', 6,  true)
on conflict (player_id, team_id, joined_at) do nothing;

-- Add all 14 players to the active season roster.
insert into public.season_rosters (season_id, player_id)
values
  ('5eed0000-0000-0000-0000-000000000002', '5eed0002-0000-0000-0000-000000000001'),
  ('5eed0000-0000-0000-0000-000000000002', '5eed0002-0000-0000-0000-000000000002'),
  ('5eed0000-0000-0000-0000-000000000002', '5eed0002-0000-0000-0000-000000000003'),
  ('5eed0000-0000-0000-0000-000000000002', '5eed0002-0000-0000-0000-000000000004'),
  ('5eed0000-0000-0000-0000-000000000002', '5eed0002-0000-0000-0000-000000000005'),
  ('5eed0000-0000-0000-0000-000000000002', '5eed0002-0000-0000-0000-000000000006'),
  ('5eed0000-0000-0000-0000-000000000002', '5eed0002-0000-0000-0000-000000000007'),
  ('5eed0000-0000-0000-0000-000000000002', '5eed0002-0000-0000-0000-000000000008'),
  ('5eed0000-0000-0000-0000-000000000002', '5eed0002-0000-0000-0000-000000000009'),
  ('5eed0000-0000-0000-0000-000000000002', '5eed0002-0000-0000-0000-00000000000a'),
  ('5eed0000-0000-0000-0000-000000000002', '5eed0002-0000-0000-0000-00000000000b'),
  ('5eed0000-0000-0000-0000-000000000002', '5eed0002-0000-0000-0000-00000000000c'),
  ('5eed0000-0000-0000-0000-000000000002', '5eed0002-0000-0000-0000-00000000000d'),
  ('5eed0000-0000-0000-0000-000000000002', '5eed0002-0000-0000-0000-00000000000e')
on conflict (season_id, player_id) do nothing;

-- ─── Starting lineup for game 201 (vs Hillcrest Hornets) ─────────────────────
-- 9-batter DH lineup: Jake Martinez pitches but does not bat (null batting_order).
-- Starters are ordered: Torres(CF)-Pierce(2B)-Brooks(1B)-Scott(DH)-Williams(3B)-
--                       Walsh(C)-Johnson(LF)-Campbell(RF)-Evans(SS).

insert into public.game_lineups
  (id, game_id, player_id, batting_order, starting_position, is_starter, is_guest, count_toward_stats)
values
  -- Batting order (9 hitters)
  ('5eed0003-0000-0000-0000-000000000001',
   '5eed0000-0000-0000-0000-000000000201',
   '5eed0002-0000-0000-0000-000000000001',
   1, 'center_field', true, false, true),
  ('5eed0003-0000-0000-0000-000000000002',
   '5eed0000-0000-0000-0000-000000000201',
   '5eed0002-0000-0000-0000-000000000002',
   2, 'second_base', true, false, true),
  ('5eed0003-0000-0000-0000-000000000003',
   '5eed0000-0000-0000-0000-000000000201',
   '5eed0002-0000-0000-0000-000000000003',
   3, 'first_base', true, false, true),
  ('5eed0003-0000-0000-0000-000000000004',
   '5eed0000-0000-0000-0000-000000000201',
   '5eed0002-0000-0000-0000-000000000004',
   4, 'designated_hitter', true, false, true),
  ('5eed0003-0000-0000-0000-000000000005',
   '5eed0000-0000-0000-0000-000000000201',
   '5eed0002-0000-0000-0000-000000000005',
   5, 'third_base', true, false, true),
  ('5eed0003-0000-0000-0000-000000000006',
   '5eed0000-0000-0000-0000-000000000201',
   '5eed0002-0000-0000-0000-000000000006',
   6, 'catcher', true, false, true),
  ('5eed0003-0000-0000-0000-000000000007',
   '5eed0000-0000-0000-0000-000000000201',
   '5eed0002-0000-0000-0000-000000000007',
   7, 'left_field', true, false, true),
  ('5eed0003-0000-0000-0000-000000000008',
   '5eed0000-0000-0000-0000-000000000201',
   '5eed0002-0000-0000-0000-000000000008',
   8, 'right_field', true, false, true),
  ('5eed0003-0000-0000-0000-000000000009',
   '5eed0000-0000-0000-0000-000000000201',
   '5eed0002-0000-0000-0000-000000000009',
   9, 'shortstop', true, false, true),
  -- Starting pitcher — null batting_order (DH rule: pitcher does not bat)
  ('5eed0003-0000-0000-0000-00000000000a',
   '5eed0000-0000-0000-0000-000000000201',
   '5eed0002-0000-0000-0000-00000000000a',
   null, 'pitcher', true, false, true)
on conflict (id) do nothing;
