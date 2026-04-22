-- ============================================================================
-- Tier 5 — Integration Hub foundation
-- Migration: training_sessions (cage/bullpen sensor work not tied to a game)
-- ============================================================================

create table public.training_sessions (
  id                    uuid primary key default gen_random_uuid(),
  team_id               uuid not null references public.teams(id) on delete cascade,
  player_id             uuid not null references public.players(id) on delete cascade,
  service               text not null,
  external_session_id   text,
  occurred_at           timestamptz not null,
  metrics               jsonb not null,
  imported_by           uuid references auth.users(id) on delete set null,
  imported_at           timestamptz not null default now()
);

comment on table public.training_sessions is
  'Standalone sensor sessions (Rapsodo hitting/pitching, Blast swings, HitTrax '
  'cage work, etc.) that are not tied to a game. In-game sensor metrics live '
  'on game_events.payload instead. See packages/shared/src/types/training-session.ts '
  'for the shape of `metrics`.';

comment on column public.training_sessions.external_session_id is
  'Vendor-assigned session id. Nullable for hand-entered sessions; when present, '
  'enforced unique per service so re-import is idempotent.';

-- Idempotent re-import: a given (service, external_session_id) resolves to
-- exactly one row, but hand-entered sessions (external_session_id IS NULL) can
-- coexist without colliding.
create unique index idx_training_sessions_service_external
  on public.training_sessions(service, external_session_id)
  where external_session_id is not null;

-- Common access patterns: "latest sessions for a player" and "team-wide feed".
create index idx_training_sessions_player_occurred
  on public.training_sessions(player_id, occurred_at desc);
create index idx_training_sessions_team_occurred
  on public.training_sessions(team_id, occurred_at desc);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table public.training_sessions enable row level security;

-- Read: any active member of the team. Metrics can contain vendor-side PII-ish
-- identifiers, so we do NOT expose these publicly.
create policy "training_sessions_select"
  on public.training_sessions for select
  using (
    exists (
      select 1 from public.team_members tm
      where tm.team_id = public.training_sessions.team_id
        and tm.user_id = auth.uid()
        and tm.is_active = true
    )
  );

-- Write: coaches on the team only. (Edge functions inserting from CSV imports
-- use the service-role key and bypass RLS.)
create policy "training_sessions_coach_insert"
  on public.training_sessions for insert
  with check (public.is_coach(team_id, auth.uid()));

create policy "training_sessions_coach_update"
  on public.training_sessions for update
  using (public.is_coach(team_id, auth.uid()))
  with check (public.is_coach(team_id, auth.uid()));

create policy "training_sessions_coach_delete"
  on public.training_sessions for delete
  using (public.is_coach(team_id, auth.uid()));
