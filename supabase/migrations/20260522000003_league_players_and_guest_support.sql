-- Guest-player support for non-roster appearances (league setting: guests.allowed).
-- Adds three things:
--   1. Nullable players.team_id so a "guest-only" identity can exist without
--      belonging to any team. `is_guest_only` flag marks records created via
--      the guest flow so they can be filtered out of normal roster queries.
--   2. league_players registry — every player who has appeared in a league
--      (rostered OR guest). Lets the picker search the league's all-time pool
--      across seasons.
--   3. game_lineups annotations — `is_guest`, `guest_display_name` (for
--      ad-hoc named guests without an FK identity), and `count_toward_stats`
--      so stat aggregation can include/exclude guest appearances per the
--      league's `guests.countTowardStatsDefault` setting.

-- ── players: allow guest-only identities ──────────────────────────────────

alter table public.players
  alter column team_id drop not null;

alter table public.players
  add column is_guest_only boolean not null default false;

comment on column public.players.team_id is
  'Team this player belongs to. NULL for guest-only identities (see is_guest_only).';

comment on column public.players.is_guest_only is
  'TRUE if this row was created through the guest-player flow and is not part of any normal team roster.';

-- The original UNIQUE(team_id, jersey_number) keeps working: PostgreSQL treats
-- NULLs as distinct, so multiple guest players can share NULL team_id without
-- conflict. No constraint changes needed.

-- ── league_players: all-time appearance registry ──────────────────────────

create table public.league_players (
  league_id     uuid not null references public.leagues(id) on delete cascade,
  player_id     uuid not null references public.players(id) on delete cascade,
  first_seen_at timestamptz not null default now(),
  primary key (league_id, player_id)
);

comment on table public.league_players is
  'Every player (rostered or guest) who has appeared in any game played by a team in this league. Used to seed the guest-player picker across seasons.';

create index idx_league_players_player on public.league_players(player_id);

alter table public.league_players enable row level security;

-- League members can read the registry to seed the picker.
create policy "league_members_view_league_players"
  on public.league_players for select
  using (
    public.is_league_member(league_id, auth.uid())
    or public.is_league_staff(league_id, auth.uid())
    or public.is_platform_admin()
  );

-- Coaches add guest entries through a server action (service-role); no direct
-- client inserts. Restrict mutation to league staff for safety.
create policy "league_staff_insert_league_players"
  on public.league_players for insert
  with check (public.is_league_staff(league_id, auth.uid()));

create policy "league_staff_delete_league_players"
  on public.league_players for delete
  using (public.is_league_staff(league_id, auth.uid()));

-- ── game_lineups: per-appearance guest annotations ────────────────────────

alter table public.game_lineups
  add column is_guest boolean not null default false;

alter table public.game_lineups
  add column guest_display_name text;

alter table public.game_lineups
  add column count_toward_stats boolean not null default true;

comment on column public.game_lineups.is_guest is
  'TRUE if this lineup slot is occupied by a guest player (not on the home team roster).';

comment on column public.game_lineups.guest_display_name is
  'Display name for ad-hoc named guests with no players.id FK. NULL otherwise.';

comment on column public.game_lineups.count_toward_stats is
  'When is_guest=true, controls whether the appearance accumulates in the players home stat line. Ignored when is_guest=false.';
