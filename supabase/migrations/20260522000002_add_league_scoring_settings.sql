-- Add per-league scoring feature flags (League Settings portal).
-- Stored as JSONB so individual flags can be added without future schema
-- migrations. Detailed shape validation lives in the @baseball/shared Zod
-- schema (leagueScoringSettingsSchema); we only assert at the DB layer that
-- the column is a JSON object.
--
-- Existing leagues retain their current behavior: an empty `{}` object is
-- merged with platform defaults at read time, and the defaults preserve
-- the recently-shipped expanded-lineup / mid-game-extension behavior.

alter table public.leagues
  add column scoring_settings jsonb not null default '{}'::jsonb;

alter table public.leagues
  add constraint leagues_scoring_settings_is_object
  check (jsonb_typeof(scoring_settings) = 'object');

comment on column public.leagues.scoring_settings is
  'League-wide scoring feature flags. Empty object means platform defaults. '
  'Shape is validated by @baseball/shared/validation/league-scoring-settings.ts. '
  'Only users with league_admin role should write this column (enforced in '
  'the application layer; RLS allows any league_staff to update the row).';
