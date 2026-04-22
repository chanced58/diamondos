-- ============================================================================
-- Practice Engine — Tier 7 (optional)
-- Migration: ai_generations audit log — per-call token/latency/cost tracking
-- ============================================================================

create type public.ai_generation_feature as enum (
  'practice_generator',
  'practice_summary',
  'scouting_card',
  'drill_recommendation'
);

create type public.ai_generation_status as enum ('success', 'error');

create table public.ai_generations (
  id                       uuid primary key default gen_random_uuid(),
  feature                  public.ai_generation_feature not null,
  team_id                  uuid references public.teams(id) on delete set null,
  user_id                  uuid references auth.users(id) on delete set null,
  model                    text not null,
  input_tokens             integer not null default 0,
  output_tokens            integer not null default 0,
  cache_read_tokens        integer not null default 0,
  cache_creation_tokens    integer not null default 0,
  latency_ms               integer,
  status                   public.ai_generation_status not null,
  error_message            text,
  created_at               timestamptz not null default now()
);

comment on table public.ai_generations is
  'Per-call audit log for Tier 7 AI features. One row per /api/ai/* invocation (success or error). Enables cost dashboards and debugging without needing to re-run prompts.';

create index idx_ai_generations_team_created
  on public.ai_generations(team_id, created_at desc);
create index idx_ai_generations_feature
  on public.ai_generations(feature, created_at desc);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table public.ai_generations enable row level security;

-- Read: coaches can see their team's generations. team_id may be null for
-- requests that failed before team context loaded — those stay service-role only.
create policy "ai_generations_coaches_select"
  on public.ai_generations for select
  using (
    public.ai_generations.team_id is not null
    and public.is_coach(public.ai_generations.team_id, auth.uid())
  );

-- No insert/update/delete policies: only the service role (bypasses RLS) writes.
