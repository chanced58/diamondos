-- ============================================================================
-- Practice Engine — Tier 1 MVP
-- Migration 4: extend practices with runner fields; add practice_blocks and
--              practice_block_players; reorder RPC and totals trigger
-- ============================================================================

-- ─── Extend practices ────────────────────────────────────────────────────────
alter table public.practices
  add column template_id             uuid references public.practice_templates(id) on delete set null,
  add column indoor_template_id      uuid references public.practice_templates(id) on delete set null,
  add column weather_mode            public.practice_weather_mode not null default 'outdoor',
  add column run_status              public.practice_run_status not null default 'not_started',
  add column started_at              timestamptz,
  add column completed_at            timestamptz,
  add column total_planned_minutes   int not null default 0,
  add column is_quick_practice       boolean not null default false;

-- active_block_id added after practice_blocks exists; see bottom of this file.

-- ─── practice_blocks ─────────────────────────────────────────────────────────
create table public.practice_blocks (
  id                         uuid primary key default gen_random_uuid(),
  practice_id                uuid not null references public.practices(id) on delete cascade,
  position                   int not null check (position >= 0),
  block_type                 public.practice_block_type not null,
  title                      text not null,
  planned_duration_minutes   int not null check (planned_duration_minutes between 1 and 600),
  actual_duration_minutes    int check (actual_duration_minutes is null or actual_duration_minutes >= 0),
  drill_id                   uuid references public.practice_drills(id) on delete set null,
  assigned_coach_id          uuid references auth.users(id),
  field_spaces               public.practice_field_space[] not null default '{}',
  notes                      text,
  status                     public.practice_block_status not null default 'pending',
  started_at                 timestamptz,
  completed_at               timestamptz,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  constraint practice_blocks_unique_position
    unique (practice_id, position) deferrable initially deferred
);

comment on table public.practice_blocks is
  'Ordered blocks composing a scheduled practice. Coaches edit on the web; mobile runner updates status/started_at/completed_at during execution.';

-- ─── practice_block_players ──────────────────────────────────────────────────
create table public.practice_block_players (
  id              uuid primary key default gen_random_uuid(),
  block_id        uuid not null references public.practice_blocks(id) on delete cascade,
  player_id       uuid not null references public.players(id) on delete cascade,
  rotation_group  int,
  created_at      timestamptz not null default now(),
  unique (block_id, player_id)
);

comment on table public.practice_block_players is
  'Players assigned to a block. rotation_group optionally partitions the block for station rotations.';

-- Now that practice_blocks exists, link practices.active_block_id.
alter table public.practices
  add column active_block_id uuid references public.practice_blocks(id) on delete set null;

-- ─── Indexes ─────────────────────────────────────────────────────────────────
create index idx_practice_blocks_practice_position on public.practice_blocks(practice_id, position);
create index idx_practice_blocks_practice_status   on public.practice_blocks(practice_id, status);
create index idx_practice_blocks_drill_id          on public.practice_blocks(drill_id);
create index idx_practice_block_players_block      on public.practice_block_players(block_id);
create index idx_practice_block_players_player     on public.practice_block_players(player_id);
create index idx_practices_template_id             on public.practices(template_id);
create index idx_practices_active_block_id         on public.practices(active_block_id);

-- ─── Keep total_planned_minutes in sync with child blocks ────────────────────
create or replace function public.practices_sync_totals()
returns trigger language plpgsql as $$
declare
  target_practice_id uuid := coalesce(new.practice_id, old.practice_id);
begin
  update public.practices p
     set total_planned_minutes = coalesce((
           select sum(b.planned_duration_minutes)
           from public.practice_blocks b
           where b.practice_id = target_practice_id
         ), 0)
   where p.id = target_practice_id;
  return coalesce(new, old);
end;
$$;

create trigger trg_practice_blocks_sync_totals
  after insert or update of planned_duration_minutes or delete on public.practice_blocks
  for each row execute function public.practices_sync_totals();

-- ─── updated_at trigger for practice_blocks ──────────────────────────────────
create or replace function public.touch_practice_blocks_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_practice_blocks_touch_updated_at
  before update on public.practice_blocks
  for each row execute function public.touch_practice_blocks_updated_at();

-- ─── Atomic reorder RPC ──────────────────────────────────────────────────────
-- Rewrites `position` for every block of a practice in one transaction. The
-- deferrable unique constraint above lets us set values without temporary
-- collision workarounds.
create or replace function public.practice_reorder_blocks(
  p_practice_id uuid,
  p_order uuid[]
)
returns void
language plpgsql
security definer
as $$
declare
  is_coach_on_team boolean;
begin
  if p_order is null or array_length(p_order, 1) is null then
    return;
  end if;

  select public.is_coach(pr.team_id, auth.uid())
    into is_coach_on_team
    from public.practices pr
   where pr.id = p_practice_id;

  if not coalesce(is_coach_on_team, false) then
    raise exception 'Only coaches on this team may reorder blocks';
  end if;

  update public.practice_blocks b
     set position = idx - 1
    from unnest(p_order) with ordinality as ord(block_id, idx)
   where b.id = ord.block_id
     and b.practice_id = p_practice_id;
end;
$$;

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table public.practice_blocks        enable row level security;
alter table public.practice_block_players enable row level security;

create policy "practice_blocks_select"
  on public.practice_blocks for select
  using (
    exists (
      select 1
      from public.practices pr
      join public.team_members tm on tm.team_id = pr.team_id
      where pr.id = public.practice_blocks.practice_id
        and tm.user_id = auth.uid()
        and tm.is_active = true
    )
  );

create policy "practice_blocks_coach_manage"
  on public.practice_blocks for all
  using (
    exists (
      select 1 from public.practices pr
      where pr.id = public.practice_blocks.practice_id
        and public.is_coach(pr.team_id, auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.practices pr
      where pr.id = public.practice_blocks.practice_id
        and public.is_coach(pr.team_id, auth.uid())
    )
  );

create policy "practice_block_players_select"
  on public.practice_block_players for select
  using (
    exists (
      select 1
      from public.practice_blocks b
      join public.practices pr on pr.id = b.practice_id
      join public.team_members tm on tm.team_id = pr.team_id
      where b.id = public.practice_block_players.block_id
        and tm.user_id = auth.uid()
        and tm.is_active = true
    )
  );

create policy "practice_block_players_coach_manage"
  on public.practice_block_players for all
  using (
    exists (
      select 1 from public.practice_blocks b
      join public.practices pr on pr.id = b.practice_id
      where b.id = public.practice_block_players.block_id
        and public.is_coach(pr.team_id, auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.practice_blocks b
      join public.practices pr on pr.id = b.practice_id
      where b.id = public.practice_block_players.block_id
        and public.is_coach(pr.team_id, auth.uid())
    )
  );

-- Execute grant on RPC
grant execute on function public.practice_reorder_blocks(uuid, uuid[]) to authenticated;
