-- ============================================================================
-- Migration: Add game_notes and game_player_notes tables
-- Mirrors the structure of practice_notes / practice_player_notes
-- ============================================================================

-- ─── game_notes ──────────────────────────────────────────────────────────────
-- One row per game. overall_notes is public to the team;
-- coach_notes is visible to coaches only (enforced in application layer).
create table public.game_notes (
  id            uuid primary key default gen_random_uuid(),
  game_id       uuid references public.games(id) on delete cascade not null unique,
  overall_notes text,
  coach_notes   text,
  updated_by    uuid references auth.users(id),
  created_at    timestamptz default now() not null,
  updated_at    timestamptz default now() not null
);

comment on table public.game_notes is
  'Overall and coach-only notes for a game. One row per game.';

-- ─── game_player_notes ───────────────────────────────────────────────────────
create table public.game_player_notes (
  id                uuid primary key default gen_random_uuid(),
  game_id           uuid references public.games(id) on delete cascade not null,
  player_id         uuid references public.players(id) on delete cascade not null,
  pitching          text,
  hitting           text,
  fielding_catching text,
  baserunning       text,
  athleticism       text,
  attitude          text,
  player_notes      text,   -- written by the player themselves
  updated_by        uuid references auth.users(id),
  created_at        timestamptz default now() not null,
  updated_at        timestamptz default now() not null,
  unique (game_id, player_id)
);

comment on table public.game_player_notes is
  'Per-player notes for a game, broken down by skill category.';

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table public.game_notes        enable row level security;
alter table public.game_player_notes enable row level security;

-- game_notes: all team members can view
create policy "team_members_view_game_notes"
  on public.game_notes for select
  using (
    exists (
      select 1 from public.games g
      join public.team_members tm on tm.team_id = g.team_id
      where g.id = public.game_notes.game_id
        and tm.user_id = auth.uid()
        and tm.is_active = true
    )
  );

create policy "coaches_manage_game_notes"
  on public.game_notes for all
  using (
    exists (
      select 1 from public.games g
      where g.id = public.game_notes.game_id
        and public.is_coach(g.team_id, auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.games g
      where g.id = public.game_notes.game_id
        and public.is_coach(g.team_id, auth.uid())
    )
  );

-- game_player_notes: coaches see all; players see only their own row
create policy "coaches_view_all_game_player_notes"
  on public.game_player_notes for select
  using (
    exists (
      select 1 from public.games g
      where g.id = public.game_player_notes.game_id
        and public.is_coach(g.team_id, auth.uid())
    )
  );

create policy "players_view_own_game_notes"
  on public.game_player_notes for select
  using (
    exists (
      select 1 from public.players pl
      where pl.id = public.game_player_notes.player_id
        and pl.user_id = auth.uid()
    )
  );

create policy "coaches_manage_game_player_notes"
  on public.game_player_notes for all
  using (
    exists (
      select 1 from public.games g
      where g.id = public.game_player_notes.game_id
        and public.is_coach(g.team_id, auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.games g
      where g.id = public.game_player_notes.game_id
        and public.is_coach(g.team_id, auth.uid())
    )
  );

-- ─── Indexes ─────────────────────────────────────────────────────────────────
create index idx_game_notes_game_id
  on public.game_notes(game_id);
create index idx_game_player_notes_game_id
  on public.game_player_notes(game_id);
create index idx_game_player_notes_player_id
  on public.game_player_notes(player_id);
