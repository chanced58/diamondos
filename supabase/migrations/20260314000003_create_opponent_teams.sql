-- Opponent teams, players, and game lineups
-- Allows coaches to maintain a scouting/stats record for opposing teams.

-- Named opponent team records owned by a coaching staff team.
create table public.opponent_teams (
  id           uuid primary key default uuid_generate_v4(),
  team_id      uuid not null references public.teams(id) on delete cascade,
  name         text not null,
  abbreviation text,
  city         text,
  state_code   text,
  logo_url     text,
  notes        text,
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.opponent_teams is
  'Named opponent teams tracked by a coaching staff. Linked to games via games.opponent_team_id.';

-- Individual players on an opponent team.
create table public.opponent_players (
  id                uuid primary key default uuid_generate_v4(),
  opponent_team_id  uuid not null references public.opponent_teams(id) on delete cascade,
  first_name        text not null,
  last_name         text not null,
  jersey_number     text,
  primary_position  public.player_position,
  bats              text check (bats in ('left', 'right', 'switch')),
  throws            text check (throws in ('left', 'right')),
  notes             text,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.opponent_players is
  'Individual players belonging to an opponent team roster.';

-- Game-specific batting order and starting positions for opponent players.
create table public.opponent_game_lineups (
  id                 uuid primary key default uuid_generate_v4(),
  game_id            uuid not null references public.games(id) on delete cascade,
  opponent_player_id uuid not null references public.opponent_players(id) on delete cascade,
  batting_order      smallint check (batting_order between 1 and 9),
  starting_position  public.player_position,
  is_starter         boolean not null default true,
  created_at         timestamptz not null default now(),
  unique (game_id, batting_order),
  unique (game_id, opponent_player_id)
);

comment on table public.opponent_game_lineups is
  'Batting order and starting positions for opponent players in a specific game.';

-- Link games to a structured opponent team record (optional; opponent_name remains the display fallback).
alter table public.games
  add column opponent_team_id uuid references public.opponent_teams(id);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

create index idx_opponent_teams_team_id
  on public.opponent_teams(team_id);

create index idx_opponent_players_opponent_team_id
  on public.opponent_players(opponent_team_id);

create index idx_opponent_game_lineups_game_id
  on public.opponent_game_lineups(game_id);

create index idx_opponent_game_lineups_player_id
  on public.opponent_game_lineups(opponent_player_id);

-- ─── RLS ──────────────────────────────────────────────────────────────────────

alter table public.opponent_teams        enable row level security;
alter table public.opponent_players      enable row level security;
alter table public.opponent_game_lineups enable row level security;

-- opponent_teams — any team member can read; only coaches can write

create policy "team_members_view_opponent_teams"
  on public.opponent_teams for select
  using (
    exists (
      select 1 from public.team_members
      where team_id = public.opponent_teams.team_id
        and user_id = auth.uid()
        and is_active = true
    )
  );

create policy "coaches_manage_opponent_teams"
  on public.opponent_teams for all
  using (
    exists (
      select 1 from public.team_members
      where team_id = public.opponent_teams.team_id
        and user_id = auth.uid()
        and role in ('head_coach', 'assistant_coach', 'athletic_director')
        and is_active = true
    )
  )
  with check (
    exists (
      select 1 from public.team_members
      where team_id = public.opponent_teams.team_id
        and user_id = auth.uid()
        and role in ('head_coach', 'assistant_coach', 'athletic_director')
        and is_active = true
    )
  );

-- opponent_players — accessible via the opponent_team → team chain

create policy "team_members_view_opponent_players"
  on public.opponent_players for select
  using (
    exists (
      select 1 from public.opponent_teams ot
      join public.team_members tm on tm.team_id = ot.team_id
      where ot.id = public.opponent_players.opponent_team_id
        and tm.user_id = auth.uid()
        and tm.is_active = true
    )
  );

create policy "coaches_manage_opponent_players"
  on public.opponent_players for all
  using (
    exists (
      select 1 from public.opponent_teams ot
      join public.team_members tm on tm.team_id = ot.team_id
      where ot.id = public.opponent_players.opponent_team_id
        and tm.user_id = auth.uid()
        and tm.role in ('head_coach', 'assistant_coach', 'athletic_director')
        and tm.is_active = true
    )
  )
  with check (
    exists (
      select 1 from public.opponent_teams ot
      join public.team_members tm on tm.team_id = ot.team_id
      where ot.id = public.opponent_players.opponent_team_id
        and tm.user_id = auth.uid()
        and tm.role in ('head_coach', 'assistant_coach', 'athletic_director')
        and tm.is_active = true
    )
  );

-- opponent_game_lineups — accessible via the game → team chain

create policy "team_members_view_opponent_game_lineups"
  on public.opponent_game_lineups for select
  using (
    exists (
      select 1 from public.games g
      join public.team_members tm on tm.team_id = g.team_id
      where g.id = public.opponent_game_lineups.game_id
        and tm.user_id = auth.uid()
        and tm.is_active = true
    )
  );

create policy "coaches_manage_opponent_game_lineups"
  on public.opponent_game_lineups for all
  using (
    exists (
      select 1 from public.games g
      join public.team_members tm on tm.team_id = g.team_id
      where g.id = public.opponent_game_lineups.game_id
        and tm.user_id = auth.uid()
        and tm.role in ('head_coach', 'assistant_coach', 'athletic_director')
        and tm.is_active = true
    )
  )
  with check (
    exists (
      select 1 from public.games g
      join public.team_members tm on tm.team_id = g.team_id
      where g.id = public.opponent_game_lineups.game_id
        and tm.user_id = auth.uid()
        and tm.role in ('head_coach', 'assistant_coach', 'athletic_director')
        and tm.is_active = true
    )
  );
