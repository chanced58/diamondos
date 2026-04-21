-- ============================================================================
-- Practice Engine — Tier 1 MVP
-- Migration 2: drill library + attachment metadata
-- ============================================================================

-- ─── practice_drills ─────────────────────────────────────────────────────────
-- team_id is NULL for curated system drills (visibility='system'); otherwise
-- it's the owning team and visibility='team'.
create table public.practice_drills (
  id                        uuid primary key default gen_random_uuid(),
  team_id                   uuid references public.teams(id) on delete cascade,
  visibility                public.practice_drill_visibility not null default 'team',
  name                      text not null,
  description               text,
  default_duration_minutes  int check (default_duration_minutes between 1 and 240),
  skill_categories          public.practice_skill_category[] not null default '{}',
  positions                 text[] not null default '{}',
  age_levels                public.practice_age_level[] not null default '{all}',
  equipment                 public.practice_equipment[] not null default '{}',
  field_spaces              public.practice_field_space[] not null default '{}',
  min_players               int check (min_players is null or min_players >= 1),
  max_players               int,
  coaching_points           text,
  tags                      text[] not null default '{}',
  diagram_url               text,
  video_url                 text,
  source                    text,
  created_by                uuid references auth.users(id),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  constraint practice_drills_visibility_team_coherent check (
    (visibility = 'system' and team_id is null)
    or (visibility = 'team' and team_id is not null)
  ),
  constraint practice_drills_max_ge_min check (
    max_players is null or min_players is null or max_players >= min_players
  )
);

comment on table public.practice_drills is
  'Drill library entry. System drills (visibility=system, team_id null) are seeded and read-only via API; team drills are coach-authored.';

-- ─── practice_drill_attachments ──────────────────────────────────────────────
create table public.practice_drill_attachments (
  id           uuid primary key default gen_random_uuid(),
  drill_id     uuid not null references public.practice_drills(id) on delete cascade,
  storage_path text not null,
  mime_type    text not null,
  kind         text not null check (kind in ('video', 'diagram', 'pdf', 'image')),
  size_bytes   bigint,
  uploaded_by  uuid references auth.users(id),
  created_at   timestamptz not null default now()
);

comment on table public.practice_drill_attachments is
  'Video / diagram / pdf / image metadata for team-authored drills. Blobs live in the drill-attachments storage bucket.';

-- ─── Indexes ─────────────────────────────────────────────────────────────────
create index idx_practice_drills_team_id      on public.practice_drills(team_id);
create index idx_practice_drills_visibility   on public.practice_drills(visibility);
create index idx_practice_drills_skills_gin   on public.practice_drills using gin(skill_categories);
create index idx_practice_drills_equipment_gin on public.practice_drills using gin(equipment);
create index idx_practice_drills_spaces_gin   on public.practice_drills using gin(field_spaces);
create index idx_practice_drills_age_gin      on public.practice_drills using gin(age_levels);
create index idx_practice_drills_tags_gin     on public.practice_drills using gin(tags);
create index idx_practice_drills_name_trgm    on public.practice_drills using gin(name gin_trgm_ops);
create index idx_practice_drill_attachments_drill_id on public.practice_drill_attachments(drill_id);

-- ─── updated_at trigger ──────────────────────────────────────────────────────
create or replace function public.touch_practice_drills_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_practice_drills_touch_updated_at
  before update on public.practice_drills
  for each row execute function public.touch_practice_drills_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table public.practice_drills             enable row level security;
alter table public.practice_drill_attachments  enable row level security;

-- Team members of team_id may read; everyone authenticated may read system drills.
create policy "practice_drills_select"
  on public.practice_drills for select
  using (
    visibility = 'system'
    or (
      team_id is not null
      and exists (
        select 1 from public.team_members tm
        where tm.team_id = public.practice_drills.team_id
          and tm.user_id = auth.uid()
          and tm.is_active = true
      )
    )
  );

-- Only coaches on the owning team may mutate team drills. System drills are
-- effectively immutable from the API (no team_id to match, policies below fail).
create policy "practice_drills_coach_insert"
  on public.practice_drills for insert
  with check (
    visibility = 'team'
    and team_id is not null
    and public.is_coach(team_id, auth.uid())
  );

create policy "practice_drills_coach_update"
  on public.practice_drills for update
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

create policy "practice_drills_coach_delete"
  on public.practice_drills for delete
  using (
    visibility = 'team'
    and team_id is not null
    and public.is_coach(team_id, auth.uid())
  );

-- Attachments inherit visibility from their parent drill.
create policy "practice_drill_attachments_select"
  on public.practice_drill_attachments for select
  using (
    exists (
      select 1
      from public.practice_drills d
      where d.id = public.practice_drill_attachments.drill_id
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
  );

create policy "practice_drill_attachments_coach_manage"
  on public.practice_drill_attachments for all
  using (
    exists (
      select 1
      from public.practice_drills d
      where d.id = public.practice_drill_attachments.drill_id
        and d.visibility = 'team'
        and d.team_id is not null
        and public.is_coach(d.team_id, auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.practice_drills d
      where d.id = public.practice_drill_attachments.drill_id
        and d.visibility = 'team'
        and d.team_id is not null
        and public.is_coach(d.team_id, auth.uid())
    )
  );
