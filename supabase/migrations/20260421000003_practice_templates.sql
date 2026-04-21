-- ============================================================================
-- Practice Engine — Tier 1 MVP
-- Migration 3: reusable practice templates + their ordered block list
-- ============================================================================

-- ─── practice_templates ──────────────────────────────────────────────────────
create table public.practice_templates (
  id                        uuid primary key default gen_random_uuid(),
  team_id                   uuid not null references public.teams(id) on delete cascade,
  name                      text not null,
  description               text,
  kind                      public.practice_template_kind not null default 'custom',
  season_phase              public.practice_season_phase not null default 'any',
  default_duration_minutes  int not null default 90 check (default_duration_minutes between 15 and 600),
  is_indoor_fallback        boolean not null default false,
  paired_template_id        uuid references public.practice_templates(id) on delete set null,
  archived_at               timestamptz,
  created_by                uuid not null references auth.users(id),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

comment on table public.practice_templates is
  'Reusable practice plan. kind=weekly_recurring|seasonal|quick_90|custom. paired_template_id links an outdoor template to its indoor fallback for weather swap.';

-- ─── practice_template_blocks ────────────────────────────────────────────────
create table public.practice_template_blocks (
  id               uuid primary key default gen_random_uuid(),
  template_id      uuid not null references public.practice_templates(id) on delete cascade,
  position         int not null check (position >= 0),
  block_type       public.practice_block_type not null,
  title            text not null,
  duration_minutes int not null check (duration_minutes between 1 and 600),
  drill_id         uuid references public.practice_drills(id) on delete set null,
  field_spaces     public.practice_field_space[] not null default '{}',
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint practice_template_blocks_unique_position
    unique (template_id, position) deferrable initially deferred
);

comment on table public.practice_template_blocks is
  'Ordered blocks composing a template. position is 0-based; unique per template (deferrable so reorders can run in a single transaction).';

-- ─── Indexes ─────────────────────────────────────────────────────────────────
create index idx_practice_templates_team_id on public.practice_templates(team_id);
create index idx_practice_templates_team_kind on public.practice_templates(team_id, kind);
create index idx_practice_templates_paired on public.practice_templates(paired_template_id);
create index idx_practice_template_blocks_template_position
  on public.practice_template_blocks(template_id, position);
create index idx_practice_template_blocks_drill_id
  on public.practice_template_blocks(drill_id);

-- ─── updated_at triggers ─────────────────────────────────────────────────────
create or replace function public.touch_practice_templates_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_practice_templates_touch_updated_at
  before update on public.practice_templates
  for each row execute function public.touch_practice_templates_updated_at();

create or replace function public.touch_practice_template_blocks_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_practice_template_blocks_touch_updated_at
  before update on public.practice_template_blocks
  for each row execute function public.touch_practice_template_blocks_updated_at();

-- ─── Paired template validator ───────────────────────────────────────────────
-- If paired_template_id is set, it must point at an indoor_fallback template
-- on the SAME team and must not self-reference. Enforced at DB level so a
-- crafted request cannot pair across teams.
create or replace function public.validate_practice_template_pairing()
returns trigger
language plpgsql
as $$
declare
  v_team_id uuid;
  v_is_indoor boolean;
begin
  if new.paired_template_id is null then
    return new;
  end if;
  if new.paired_template_id = new.id then
    raise exception 'paired_template_id cannot reference the template itself';
  end if;
  select team_id, is_indoor_fallback
    into v_team_id, v_is_indoor
    from public.practice_templates
   where id = new.paired_template_id;
  if not found then
    raise exception 'paired_template_id % not found', new.paired_template_id;
  end if;
  if v_team_id is distinct from new.team_id then
    raise exception 'paired_template_id must belong to the same team';
  end if;
  if v_is_indoor is not true then
    raise exception 'paired_template_id must point at an indoor fallback template';
  end if;
  return new;
end;
$$;

create trigger trg_practice_templates_validate_pairing
  before insert or update of paired_template_id, team_id
  on public.practice_templates
  for each row execute function public.validate_practice_template_pairing();

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table public.practice_templates       enable row level security;
alter table public.practice_template_blocks enable row level security;

create policy "practice_templates_select"
  on public.practice_templates for select
  using (
    exists (
      select 1 from public.team_members tm
      where tm.team_id = public.practice_templates.team_id
        and tm.user_id = auth.uid()
        and tm.is_active = true
    )
  );

create policy "practice_templates_coach_manage"
  on public.practice_templates for all
  using  (public.is_coach(team_id, auth.uid()))
  with check (public.is_coach(team_id, auth.uid()));

create policy "practice_template_blocks_select"
  on public.practice_template_blocks for select
  using (
    exists (
      select 1
      from public.practice_templates t
      join public.team_members tm on tm.team_id = t.team_id
      where t.id = public.practice_template_blocks.template_id
        and tm.user_id = auth.uid()
        and tm.is_active = true
    )
  );

create policy "practice_template_blocks_coach_manage"
  on public.practice_template_blocks for all
  using (
    exists (
      select 1 from public.practice_templates t
      where t.id = public.practice_template_blocks.template_id
        and public.is_coach(t.team_id, auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.practice_templates t
      where t.id = public.practice_template_blocks.template_id
        and public.is_coach(t.team_id, auth.uid())
    )
  );
