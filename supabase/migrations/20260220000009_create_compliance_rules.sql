-- Pitch count compliance rules (per-state / per-organization)

create table public.pitch_compliance_rules (
  id                    uuid primary key default gen_random_uuid(),
  -- null team_id = system-level preset (NFHS, Little League, etc.)
  team_id               uuid references public.teams(id) on delete cascade,
  rule_name             text not null,
  max_pitches_per_day   smallint not null,
  -- JSON map: threshold (as string) → required rest days
  -- Example: {"1": 0, "26": 1, "51": 2, "76": 3, "101": 4}
  rest_day_thresholds   jsonb not null,
  age_min               smallint,
  age_max               smallint,
  applies_from          date,
  applies_until         date,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now()
);

comment on table public.pitch_compliance_rules is
  'Defines pitch count limits and rest day rules for a ruleset. Rows with null team_id are system presets (NFHS, Little League, NCAA).';

-- Which compliance rule is active for a given season
create table public.season_compliance_rules (
  season_id             uuid primary key references public.seasons(id) on delete cascade,
  compliance_rule_id    uuid not null references public.pitch_compliance_rules(id)
);

-- Seed system preset rules
insert into public.pitch_compliance_rules
  (rule_name, max_pitches_per_day, rest_day_thresholds)
values
  ('NFHS (High School)', 110, '{"1": 0, "26": 1, "51": 2, "76": 3, "101": 4}'),
  ('Little League (Ages 13-16)', 95, '{"1": 0, "36": 1, "61": 2, "76": 3}'),
  ('Little League (Ages 11-12)', 85, '{"1": 0, "26": 1, "41": 2, "61": 3}'),
  ('NCAA', 105, '{"1": 0, "31": 1, "61": 2, "91": 3}');
