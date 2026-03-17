-- Expand leads table to capture richer context from the interest form,
-- and add enrichment columns populated by n8n automation.

-- Core fields captured at form submission
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS contact_name       TEXT,         -- coach, AD, or league coordinator
  ADD COLUMN IF NOT EXISTS organization       TEXT,         -- school or league name
  ADD COLUMN IF NOT EXISTS state              TEXT,         -- US state abbreviation (e.g. 'TX')
  ADD COLUMN IF NOT EXISTS program_type_input TEXT;         -- optional hint: HS / College / Travel

-- Enrichment fields written by n8n after submission
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS enriched               BOOLEAN     DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS enriched_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS program_type           TEXT,         -- High School / College / Travel/Club / Youth League
  ADD COLUMN IF NOT EXISTS program_summary        TEXT,
  ADD COLUMN IF NOT EXISTS school_enrollment      TEXT,
  ADD COLUMN IF NOT EXISTS estimated_roster_size  TEXT,
  ADD COLUMN IF NOT EXISTS league_district        TEXT,
  ADD COLUMN IF NOT EXISTS program_history        TEXT,
  ADD COLUMN IF NOT EXISTS coaching_staff         TEXT,
  ADD COLUMN IF NOT EXISTS pitch_count_regulated  BOOLEAN,
  ADD COLUMN IF NOT EXISTS pitch_count_notes      TEXT,
  ADD COLUMN IF NOT EXISTS tech_adoption_signals  TEXT,
  ADD COLUMN IF NOT EXISTS lead_score             SMALLINT,
  ADD COLUMN IF NOT EXISTS score_reasoning        TEXT,
  ADD COLUMN IF NOT EXISTS key_talking_points     TEXT,         -- JSON string array
  ADD COLUMN IF NOT EXISTS outreach_subject       TEXT,
  ADD COLUMN IF NOT EXISTS outreach_email         TEXT;
