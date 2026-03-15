-- ============================================================================
-- Migration: Move coach_notes out of game_notes into a coach-only table
--
-- The coach_notes column on game_notes was readable by all team members via
-- the team_members_view_game_notes SELECT policy. Moving it to a dedicated
-- table allows RLS to restrict it to coaches only.
-- ============================================================================

-- ─── New table ───────────────────────────────────────────────────────────────
create table public.game_coach_notes (
  id          uuid primary key default gen_random_uuid(),
  game_id     uuid references public.games(id) on delete cascade not null unique,
  coach_notes text,
  updated_by  uuid references auth.users(id),
  created_at  timestamptz default now() not null,
  updated_at  timestamptz default now() not null
);

comment on table public.game_coach_notes is
  'Coach-private notes for a game. Accessible only to coaching staff.';

-- ─── Migrate existing data ───────────────────────────────────────────────────
insert into public.game_coach_notes (game_id, coach_notes, updated_by, updated_at)
select game_id, coach_notes, updated_by, updated_at
from   public.game_notes
where  coach_notes is not null;

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table public.game_coach_notes enable row level security;

create policy "coaches_manage_game_coach_notes"
  on public.game_coach_notes for all
  using (
    exists (
      select 1 from public.games g
      where g.id = public.game_coach_notes.game_id
        and public.is_coach(g.team_id, auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.games g
      where g.id = public.game_coach_notes.game_id
        and public.is_coach(g.team_id, auth.uid())
    )
  );

-- ─── Drop old column ─────────────────────────────────────────────────────────
alter table public.game_notes drop column coach_notes;

-- ─── Index ───────────────────────────────────────────────────────────────────
create index idx_game_coach_notes_game_id on public.game_coach_notes(game_id);
