-- ============================================================================
-- Practice Engine — Tier 6 Game-Prep Linkage
-- Migration: per-player per-drill rep log (event-sourced BP / live-arm capture)
-- ============================================================================

create type public.practice_rep_outcome_category as enum (
  'positive',
  'neutral',
  'negative'
);

create type public.practice_rep_coach_tag as enum (
  'hot',
  'cold',
  'improved',
  'form_break'
);

create table public.practice_reps (
  id                uuid primary key default gen_random_uuid(),
  practice_id       uuid not null references public.practices(id) on delete cascade,
  block_id          uuid references public.practice_blocks(id) on delete cascade,
  drill_id          uuid references public.practice_drills(id) on delete set null,
  player_id         uuid references public.players(id) on delete set null,
  rep_number        smallint check (rep_number is null or rep_number >= 1),
  outcome           text not null,
  outcome_category  public.practice_rep_outcome_category not null,
  metrics           jsonb not null default '{}'::jsonb,
  coach_tag         public.practice_rep_coach_tag,
  recorded_by       uuid references auth.users(id),
  recorded_at       timestamptz not null default now()
);

comment on table public.practice_reps is
  'Event-sourced per-rep log for practices (BP, live arm, etc.). Each row is one at-bat-like interaction. Aggregated for hot-hitter ranking (Tier 6 F4).';
comment on column public.practice_reps.outcome is
  'Free-form outcome slug (e.g. hit_hard, line_drive, weak_contact, swing_miss, take, ground_out, fly_out, walk). Vocabulary enforced in application layer to allow progressive extension.';
comment on column public.practice_reps.outcome_category is
  'Bucket rollup of outcome into positive/neutral/negative for ranking math.';

create index idx_practice_reps_practice
  on public.practice_reps(practice_id);
create index idx_practice_reps_player
  on public.practice_reps(player_id);
create index idx_practice_reps_player_recorded
  on public.practice_reps(player_id, recorded_at desc);
create index idx_practice_reps_practice_player
  on public.practice_reps(practice_id, player_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table public.practice_reps enable row level security;

-- Read: active team members of the practice's team.
create policy "practice_reps_team_members_select"
  on public.practice_reps for select
  using (
    exists (
      select 1
        from public.practices p
        join public.team_members tm on tm.team_id = p.team_id
       where p.id = public.practice_reps.practice_id
         and tm.user_id = auth.uid()
         and tm.is_active = true
    )
  );

-- Write: coaches on the practice's team.
create policy "practice_reps_coaches_insert"
  on public.practice_reps for insert
  with check (
    exists (
      select 1 from public.practices p
       where p.id = public.practice_reps.practice_id
         and public.is_coach(p.team_id, auth.uid())
    )
  );

create policy "practice_reps_coaches_update"
  on public.practice_reps for update
  using (
    exists (
      select 1 from public.practices p
       where p.id = public.practice_reps.practice_id
         and public.is_coach(p.team_id, auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.practices p
       where p.id = public.practice_reps.practice_id
         and public.is_coach(p.team_id, auth.uid())
    )
  );

create policy "practice_reps_coaches_delete"
  on public.practice_reps for delete
  using (
    exists (
      select 1 from public.practices p
       where p.id = public.practice_reps.practice_id
         and public.is_coach(p.team_id, auth.uid())
    )
  );
