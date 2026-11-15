-- Error log: web, mobile, edge functions and the database record errors here.
-- Service role only: RLS is on with no policies, and anon/authenticated hold no privileges.
CREATE TABLE public.app_error_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  source      text NOT NULL CHECK (source IN ('web', 'web_client', 'mobile', 'edge', 'db')),
  area        text NOT NULL,
  message     text NOT NULL,
  details     jsonb NOT NULL DEFAULT '{}',
  user_id     uuid,
  team_id     uuid,
  game_id     uuid,
  app_version text,
  device_id   text
);

CREATE INDEX app_error_log_occurred_at_idx ON public.app_error_log (occurred_at DESC);
CREATE INDEX app_error_log_source_occurred_at_idx ON public.app_error_log (source, occurred_at DESC);

ALTER TABLE public.app_error_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_error_log FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.app_error_log TO service_role;
