-- ============================================================================
-- Migration 13: Create practices tables
-- ============================================================================

-- ─── practices ───────────────────────────────────────────────────────────────
create table public.practices (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid references public.teams(id) on delete cascade not null,
  scheduled_at  timestamptz not null,
  duration_minutes int,
  location      text,
  created_by    uuid references auth.users(id) not null,
  created_at    timestamptz default now() not null,
  updated_at    timestamptz default now() not null
);

comment on table public.practices is 'A single team practice session.';

-- ─── practice_notes ──────────────────────────────────────────────────────────
-- One row per practice. overall_notes is public to the team;
-- coach_notes is visible to coaches only (enforced in application layer).
create table public.practice_notes (
  id             uuid primary key default gen_random_uuid(),
  practice_id    uuid references public.practices(id) on delete cascade not null unique,
  overall_notes  text,
  coach_notes    text,
  updated_by     uuid references auth.users(id),
  created_at     timestamptz default now() not null,
  updated_at     timestamptz default now() not null
);

comment on table public.practice_notes is
  'Overall and coach-only notes for a practice. One row per practice.';

-- ─── practice_player_notes ───────────────────────────────────────────────────
create table public.practice_player_notes (
  id                uuid primary key default gen_random_uuid(),
  practice_id       uuid references public.practices(id) on delete cascade not null,
  player_id         uuid references public.players(id) on delete cascade not null,
  pitching          text,
  hitting           text,
  fielding_catching text,
  baserunning       text,
  athleticism       text,
  attitude          text,
  updated_by        uuid references auth.users(id),
  created_at        timestamptz default now() not null,
  updated_at        timestamptz default now() not null,
  unique (practice_id, player_id)
);

comment on table public.practice_player_notes is
  'Per-player notes for a practice session, broken down by skill category.';

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table public.practices             enable row level security;
alter table public.practice_notes        enable row level security;
alter table public.practice_player_notes enable row level security;

-- practices: all team members can view; coaches can create/update
create policy "team_members_view_practices"
  on public.practices for select
  using (
    exists (
      select 1 from public.team_members
      where team_id = public.practices.team_id
        and user_id = auth.uid()
        and is_active = true
    )
  );

create policy "coaches_manage_practices"
  on public.practices for all
  using  (public.is_coach(team_id, auth.uid()))
  with check (public.is_coach(team_id, auth.uid()));

-- practice_notes: all team members can view the row (coach_notes filtered in app)
create policy "team_members_view_practice_notes"
  on public.practice_notes for select
  using (
    exists (
      select 1 from public.practices p
      join public.team_members tm on tm.team_id = p.team_id
      where p.id = public.practice_notes.practice_id
        and tm.user_id = auth.uid()
        and tm.is_active = true
    )
  );

create policy "coaches_manage_practice_notes"
  on public.practice_notes for all
  using (
    exists (
      select 1 from public.practices p
      where p.id = public.practice_notes.practice_id
        and public.is_coach(p.team_id, auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.practices p
      where p.id = public.practice_notes.practice_id
        and public.is_coach(p.team_id, auth.uid())
    )
  );

-- practice_player_notes: coaches see all; players see only their own row
create policy "coaches_view_all_player_notes"
  on public.practice_player_notes for select
  using (
    exists (
      select 1 from public.practices p
      where p.id = public.practice_player_notes.practice_id
        and public.is_coach(p.team_id, auth.uid())
    )
  );

create policy "players_view_own_practice_notes"
  on public.practice_player_notes for select
  using (
    exists (
      select 1 from public.players pl
      where pl.id = public.practice_player_notes.player_id
        and pl.user_id = auth.uid()
    )
  );

create policy "coaches_manage_player_notes"
  on public.practice_player_notes for all
  using (
    exists (
      select 1 from public.practices p
      where p.id = public.practice_player_notes.practice_id
        and public.is_coach(p.team_id, auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.practices p
      where p.id = public.practice_player_notes.practice_id
        and public.is_coach(p.team_id, auth.uid())
    )
  );

-- ─── Indexes ─────────────────────────────────────────────────────────────────
create index idx_practices_team_id      on public.practices(team_id);
create index idx_practices_scheduled_at on public.practices(scheduled_at desc);
create index idx_practice_notes_practice_id
  on public.practice_notes(practice_id);
create index idx_practice_player_notes_practice_id
  on public.practice_player_notes(practice_id);
create index idx_practice_player_notes_player_id
  on public.practice_player_notes(player_id);
