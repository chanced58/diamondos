-- Adult leagues play nine innings, so their rate stats (ERA, K/9, BB/9) are per
-- nine. New adult leagues get `gameLength.statInnings = 9` from the league setup
-- wizard; this sets it on adult leagues created before the setting existed.
-- Leagues that already have a statInnings keep it, and every other league keeps
-- reading the default of 7 (`mergeWithDefaults`), so their numbers don't change.
-- Run the league snapshot rebuild afterwards so stored ERAs pick it up.

update public.leagues
set scoring_settings = jsonb_set(
  coalesce(scoring_settings, '{}'::jsonb),
  '{gameLength}',
  coalesce(scoring_settings -> 'gameLength', '{}'::jsonb) || '{"statInnings": 9}'::jsonb
)
where league_type = 'adult'
  and (scoring_settings -> 'gameLength' -> 'statInnings') is null;
