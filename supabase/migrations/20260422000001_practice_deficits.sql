-- ============================================================================
-- Practice Engine — Tier 4 development layer
-- Migration: deficits vocabulary (system + team-authored)
-- ============================================================================

create table public.practice_deficits (
  id               uuid primary key default gen_random_uuid(),
  team_id          uuid references public.teams(id) on delete cascade,
  visibility       public.practice_drill_visibility not null default 'team',
  slug             text not null,
  name             text not null,
  description      text,
  skill_categories public.practice_skill_category[] not null default '{}',
  created_by       uuid references auth.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint practice_deficits_visibility_team_coherent check (
    (visibility = 'system' and team_id is null)
    or (visibility = 'team' and team_id is not null)
  ),
  constraint practice_deficits_slug_scope unique nulls not distinct (team_id, slug),
  constraint practice_deficits_skills_non_empty check (
    array_length(skill_categories, 1) >= 1
  )
);

comment on table public.practice_deficits is
  'Skill-deficit vocabulary. System rows (visibility=system, team_id null) ship via seed migrations and are API-immutable; team rows are coach-authored per team.';

-- ─── Indexes ─────────────────────────────────────────────────────────────────
create index idx_practice_deficits_team_id    on public.practice_deficits(team_id);
create index idx_practice_deficits_visibility on public.practice_deficits(visibility);
create index idx_practice_deficits_skills_gin on public.practice_deficits using gin(skill_categories);
create index idx_practice_deficits_name_trgm  on public.practice_deficits using gin(name gin_trgm_ops);

-- ─── updated_at trigger ──────────────────────────────────────────────────────
create or replace function public.touch_practice_deficits_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_practice_deficits_touch_updated_at
  before update on public.practice_deficits
  for each row execute function public.touch_practice_deficits_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table public.practice_deficits enable row level security;

-- Read: system rows visible to all authenticated; team rows visible to active
-- members of that team.
create policy "practice_deficits_select"
  on public.practice_deficits for select
  using (
    visibility = 'system'
    or (
      team_id is not null
      and exists (
        select 1 from public.team_members tm
        where tm.team_id = public.practice_deficits.team_id
          and tm.user_id = auth.uid()
          and tm.is_active = true
      )
    )
  );

-- Write: only coaches on the owning team may mutate team rows. System rows
-- are unreachable from the API (no team_id to match; policy denies).
create policy "practice_deficits_coach_insert"
  on public.practice_deficits for insert
  with check (
    visibility = 'team'
    and team_id is not null
    and public.is_coach(team_id, auth.uid())
  );

create policy "practice_deficits_coach_update"
  on public.practice_deficits for update
  using (
    visibility = 'team'
    and team_id is not null
    and public.is_coach(team_id, auth.uid())
  )
  with check (
    visibility = 'team'
    and team_id is not null
    and public.is_coach(team_id, auth.uid())
  );

create policy "practice_deficits_coach_delete"
  on public.practice_deficits for delete
  using (
    visibility = 'team'
    and team_id is not null
    and public.is_coach(team_id, auth.uid())
  );
