-- Make season_id nullable on games so coaches can schedule games without an active season
ALTER TABLE public.games ALTER COLUMN season_id DROP NOT NULL;

-- Team event types
CREATE TYPE public.team_event_type AS ENUM (
  'meeting',
  'scrimmage',
  'travel',
  'other'
);

-- Team events (non-game calendar items: team meetings, travel days, etc.)
CREATE TABLE public.team_events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     uuid        NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  title       text        NOT NULL,
  event_type  public.team_event_type NOT NULL DEFAULT 'other',
  starts_at   timestamptz NOT NULL,
  ends_at     timestamptz,
  location    text,
  description text,
  created_by  uuid        NOT NULL REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.team_events IS 'Non-game calendar events: meetings, travel days, scrimmages, etc.';

-- RLS
ALTER TABLE public.team_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team_events_select" ON public.team_events
  FOR SELECT USING (public.get_team_role(team_id, auth.uid()) IS NOT NULL);

CREATE POLICY "team_events_insert" ON public.team_events
  FOR INSERT WITH CHECK (public.is_coach(team_id, auth.uid()));

CREATE POLICY "team_events_update" ON public.team_events
  FOR UPDATE USING (public.is_coach(team_id, auth.uid()));

CREATE POLICY "team_events_delete" ON public.team_events
  FOR DELETE USING (public.is_coach(team_id, auth.uid()));

-- Index for calendar range queries
CREATE INDEX idx_team_events_team_starts ON public.team_events (team_id, starts_at);
CREATE INDEX idx_games_team_scheduled    ON public.games (team_id, scheduled_at);
