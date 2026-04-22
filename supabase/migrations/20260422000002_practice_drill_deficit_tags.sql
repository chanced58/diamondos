-- ============================================================================
-- Practice Engine — Tier 4 development layer
-- Migration: drill↔deficit junction with primary/secondary priority
-- ============================================================================

create type public.practice_drill_deficit_priority as enum ('primary', 'secondary');

create table public.practice_drill_deficit_tags (
  id          uuid primary key default gen_random_uuid(),
  drill_id    uuid not null references public.practice_drills(id) on delete cascade,
  deficit_id  uuid not null references public.practice_deficits(id) on delete cascade,
  team_id     uuid references public.teams(id) on delete cascade,
  priority    public.practice_drill_deficit_priority not null default 'primary',
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  constraint drill_deficit_tags_unique unique nulls not distinct (drill_id, deficit_id, team_id)
);

comment on table public.practice_drill_deficit_tags is
  'Tags connecting a drill to a deficit with primary/secondary priority. team_id null = system tag (seed-only); team_id set = team-scoped tag visible only to that team.';

-- ─── Indexes ─────────────────────────────────────────────────────────────────
create index idx_drill_deficit_tags_drill_id   on public.practice_drill_deficit_tags(drill_id);
create index idx_drill_deficit_tags_deficit_id on public.practice_drill_deficit_tags(deficit_id);
create index idx_drill_deficit_tags_team_id    on public.practice_drill_deficit_tags(team_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table public.practice_drill_deficit_tags enable row level security;

-- Read: caller must be able to see the parent drill, and the tag must be
-- either system (team_id null) or scoped to a team the caller belongs to.
create policy "drill_deficit_tags_select"
  on public.practice_drill_deficit_tags for select
  using (
    exists (
      select 1
      from public.practice_drills d
      where d.id = public.practice_drill_deficit_tags.drill_id
        and (
          d.visibility = 'system'
          or (
            d.team_id is not null
            and exists (
              select 1 from public.team_members tm
              where tm.team_id = d.team_id
                and tm.user_id = auth.uid()
                and tm.is_active = true
            )
          )
        )
    )
    and (
      team_id is null
      or exists (
        select 1 from public.team_members tm
        where tm.team_id = public.practice_drill_deficit_tags.team_id
          and tm.user_id = auth.uid()
          and tm.is_active = true
      )
    )
  );

-- Write: only coaches on the scoping team, who can also read the parent drill.
-- System tags (team_id null) are seed-only; policy denies non-service-role writes.
create policy "drill_deficit_tags_coach_insert"
  on public.practice_drill_deficit_tags for insert
  with check (
    team_id is not null
    and public.is_coach(team_id, auth.uid())
    and exists (
      select 1
      from public.practice_drills d
      where d.id = public.practice_drill_deficit_tags.drill_id
        and (
          d.visibility = 'system'
          or d.team_id = public.practice_drill_deficit_tags.team_id
        )
    )
  );

create policy "drill_deficit_tags_coach_update"
  on public.practice_drill_deficit_tags for update
  using (
    team_id is not null
    and public.is_coach(team_id, auth.uid())
  )
  with check (
    team_id is not null
    and public.is_coach(team_id, auth.uid())
  );

create policy "drill_deficit_tags_coach_delete"
  on public.practice_drill_deficit_tags for delete
  using (
    team_id is not null
    and public.is_coach(team_id, auth.uid())
  );
