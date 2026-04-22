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
