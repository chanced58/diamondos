-- ============================================================================
-- Practice Engine — Tier 7 F2
-- Migration: per-practice AI-generated post-practice summary
-- ============================================================================

create table public.practice_summaries (
  id                  uuid primary key default gen_random_uuid(),
  practice_id         uuid not null unique references public.practices(id) on delete cascade,
  team_id             uuid not null references public.teams(id) on delete cascade,
  coach_recap         text not null,
  standout_players    jsonb not null default '[]'::jsonb,
  concerns            jsonb not null default '[]'::jsonb,
  player_summaries    jsonb not null default '{}'::jsonb,
  model               text not null,
  generated_by        uuid references auth.users(id),
  generated_at        timestamptz not null default now()
);

comment on table public.practice_summaries is
  'One AI-generated summary per practice (Tier 7 F2). Regenerating overwrites via upsert on practice_id. coach_recap is the narrative; standout_players / concerns / player_summaries are structured JSON for rendering.';

create index idx_practice_summaries_team
  on public.practice_summaries(team_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table public.practice_summaries enable row level security;

-- Read: active team members of the practice's team (same as practice_reps).
create policy "practice_summaries_team_members_select"
  on public.practice_summaries for select
  using (
    exists (
      select 1
        from public.team_members tm
       where tm.team_id = public.practice_summaries.team_id
         and tm.user_id = auth.uid()
         and tm.is_active = true
    )
  );

-- Write: coaches of the practice's team.
create policy "practice_summaries_coaches_insert"
  on public.practice_summaries for insert
  with check (
    public.is_coach(public.practice_summaries.team_id, auth.uid())
  );

create policy "practice_summaries_coaches_update"
  on public.practice_summaries for update
  using (public.is_coach(public.practice_summaries.team_id, auth.uid()))
  with check (public.is_coach(public.practice_summaries.team_id, auth.uid()));

create policy "practice_summaries_coaches_delete"
  on public.practice_summaries for delete
  using (public.is_coach(public.practice_summaries.team_id, auth.uid()));
