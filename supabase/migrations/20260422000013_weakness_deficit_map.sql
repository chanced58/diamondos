-- ============================================================================
-- Practice Engine — Tier 6 Game-Prep Linkage
-- Migration: map weakness-detector codes → practice_deficits (system slugs)
-- ============================================================================
--
-- One row per (weakness_code, deficit_slug) pair. Many-to-many so a single
-- weakness can recommend multiple system deficits, and the generator can
-- dedupe across overlapping weaknesses. Keyed by slug (not uuid) because
-- the deficit seed uses deterministic UUID5(slug) and slugs are the stable
-- handle coaches and seeds reference.

create table public.weakness_deficit_map (
  weakness_code  text not null,
  deficit_slug   text not null,
  primary key (weakness_code, deficit_slug)
);

comment on table public.weakness_deficit_map is
  'Maps Tier 6 weakness detector codes to system practice_deficit slugs. Joined at query time against practice_deficits where visibility=system to hydrate deficit ids for the prep-practice generator. Read-only data — seeded here, never user-mutable.';

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table public.weakness_deficit_map enable row level security;

-- Read: any authenticated user. This is static reference data like a codebook.
create policy "weakness_deficit_map_authenticated_select"
  on public.weakness_deficit_map for select
  to authenticated
  using (true);

-- No insert/update/delete policies — nothing can mutate via API. Seeds use
-- migration-time privileges which bypass RLS.

-- ─── Seed ────────────────────────────────────────────────────────────────────
-- Maps align with detection rules in packages/shared/src/utils/game-weakness-detector.ts.
insert into public.weakness_deficit_map (weakness_code, deficit_slug) values
  -- High strikeout rate on off-speed / breaking balls.
  ('k_vs_offspeed',       'struggles-vs-off-speed'),
  ('k_vs_offspeed',       'no-backside-on-breaking'),

  -- Elevated two-strike strikeout rate.
  ('two_strike_approach', 'poor-two-strike-approach'),
  ('two_strike_approach', 'chases-out-of-zone'),

  -- RISP failure: low contact/production with runners in scoring position.
  ('risp_failure',        'poor-two-strike-approach'),
  ('risp_failure',        'chases-out-of-zone'),

  -- Multiple defensive errors in a single game.
  ('defensive_errors',    'rushes-transfer'),
  ('defensive_errors',    'slow-first-step'),
  ('defensive_errors',    'weak-backhand'),
  ('defensive_errors',    'poor-throw-accuracy-on-the-run'),

  -- Pitching staff walks ≥ threshold.
  ('walks_issued',        'glove-side-command'),
  ('walks_issued',        'arm-side-command'),
  ('walks_issued',        'inconsistent-release-point'),

  -- High left-on-base count — proxy for hitting approach with RISP.
  ('left_on_base',        'chases-out-of-zone'),
  ('left_on_base',        'poor-two-strike-approach')
on conflict (weakness_code, deficit_slug) do nothing;
