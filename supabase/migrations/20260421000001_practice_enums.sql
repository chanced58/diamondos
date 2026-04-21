-- ============================================================================
-- Practice Engine — Tier 1 MVP
-- Migration 1: enum types used by drills, templates, blocks, and stations
-- ============================================================================

create type public.practice_skill_category as enum (
  'hitting',
  'pitching',
  'fielding',
  'baserunning',
  'team_defense',
  'conditioning',
  'agility',
  'mental'
);

create type public.practice_equipment as enum (
  'baseballs',
  'tees',
  'nets',
  'cones',
  'bases',
  'catchers_gear',
  'radar_gun',
  'pitching_machine',
  'l_screen',
  'weights',
  'agility_ladder',
  'medicine_ball',
  'bat',
  'helmet',
  'none'
);

-- Numbered variants (cage_1/cage_2/bullpen_1/bullpen_2) let field-space
-- conflict detection use simple token equality. full_field subsumes infield
-- and outfield; that relationship is encoded in packages/shared utils.
create type public.practice_field_space as enum (
  'full_field',
  'infield',
  'outfield',
  'cage_1',
  'cage_2',
  'bullpen_1',
  'bullpen_2',
  'gym',
  'classroom',
  'open_space'
);

create type public.practice_block_type as enum (
  'warmup',
  'individual_skill',
  'team_defense',
  'situational',
  'conditioning',
  'bullpen',
  'scrimmage',
  'stretch',
  'meeting',
  'water_break',
  'custom'
);

create type public.practice_age_level as enum (
  '8u',
  '10u',
  '12u',
  '14u',
  'high_school_jv',
  'high_school_varsity',
  'college',
  'adult',
  'all'
);

create type public.practice_template_kind as enum (
  'weekly_recurring',
  'seasonal',
  'quick_90',
  'custom'
);

create type public.practice_season_phase as enum (
  'preseason',
  'in_season',
  'playoff',
  'offseason',
  'any'
);

create type public.practice_weather_mode as enum (
  'outdoor',
  'indoor_gym',
  'classroom',
  'cancelled'
);

-- system = curated seed rows owned by NULL team; team = coach-authored.
create type public.practice_drill_visibility as enum (
  'system',
  'team'
);

create type public.practice_run_status as enum (
  'not_started',
  'running',
  'completed'
);

create type public.practice_block_status as enum (
  'pending',
  'active',
  'completed',
  'skipped'
);
