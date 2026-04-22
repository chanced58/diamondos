-- ============================================================================
-- Practice Engine — Tier 3A
-- Migration: practice_attendance table + RLS
-- ============================================================================
--
-- Lazy model: no rows are created until a coach actively marks a player.
-- The mobile client merges this table with the team roster; missing rows are
-- rendered as "pending". We do NOT pre-populate per-roster rows, which keeps
-- lifecycle simple when rosters churn between creation and practice day.

create table public.practice_attendance (
  id              uuid primary key default gen_random_uuid(),
  practice_id     uuid not null references public.practices(id) on delete cascade,
  player_id       uuid not null references public.players(id)    on delete cascade,
  status          public.practice_attendance_status not null,
  checked_in_at   timestamptz,
  checked_in_by   uuid references auth.users(id),
  notes           text check (notes is null or length(notes) <= 500),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (practice_id, player_id)
);

comment on table public.practice_attendance is
  'Per-practice per-player attendance record. Lazy: absence of a row = pending.';

create index idx_practice_attendance_practice on public.practice_attendance(practice_id);
create index idx_practice_attendance_player   on public.practice_attendance(player_id);

-- ─── updated_at trigger ──────────────────────────────────────────────────────
create or replace function public.touch_practice_attendance_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_practice_attendance_touch_updated_at
  before update on public.practice_attendance
  for each row execute function public.touch_practice_attendance_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table public.practice_attendance enable row level security;

-- Coaches on the practice's team may read + manage all attendance for the practice.
-- with check also verifies the player belongs to the same team (no cross-team writes).
create policy "practice_attendance_coach_manage"
  on public.practice_attendance for all
  using (
    exists (
      select 1 from public.practices pr
      where pr.id = public.practice_attendance.practice_id
        and public.is_coach(pr.team_id, auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.practices pr
      join public.players pl on pl.id = public.practice_attendance.player_id
      where pr.id = public.practice_attendance.practice_id
        and public.is_coach(pr.team_id, auth.uid())
        and pl.team_id = pr.team_id
    )
  );

-- A player with an account may read their own row. Keeps the RLS shallow by
-- filtering via players.user_id rather than joining through team_members.
create policy "practice_attendance_player_select_own"
  on public.practice_attendance for select
  using (
    exists (
      select 1 from public.players pl
      where pl.id = public.practice_attendance.player_id
        and pl.user_id = auth.uid()
    )
  );
