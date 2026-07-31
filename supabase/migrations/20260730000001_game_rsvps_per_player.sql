-- ============================================================================
-- Game RSVPs — re-key per player, parent-aware RLS
-- ============================================================================
--
-- game_rsvps (20260220000008_create_messaging.sql) was created but never
-- written by any application code, so this migration is free to change its
-- shape. It was originally keyed on (game_id, user_id) — the responding auth
-- account. The coach-facing deliverable is a roster of *players*, and
-- players.user_id is nullable (youth players without accounts), so we re-key
-- on (game_id, player_id) instead. user_id is kept as "who responded" (the
-- player's own account, or a linked parent via parent_player_links).
--
-- The backfill/delete below is defensive only — the table is expected to be
-- empty in every environment.

alter table public.game_rsvps
  add column if not exists player_id  uuid references public.players(id) on delete cascade,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

-- Defensive backfill: map any legacy user-keyed row to that user's player on
-- the game's team. Rows that can't be mapped (no matching player) are dropped.
update public.game_rsvps r
set player_id = pl.id
from public.games g
join public.players pl on pl.team_id = g.team_id
where r.player_id is null
  and g.id = r.game_id
  and pl.user_id = r.user_id;

delete from public.game_rsvps where player_id is null;

alter table public.game_rsvps alter column player_id set not null;

alter table public.game_rsvps
  drop constraint if exists game_rsvps_game_id_user_id_key;

alter table public.game_rsvps
  add constraint game_rsvps_game_id_player_id_key unique (game_id, player_id);

alter table public.game_rsvps
  add constraint game_rsvps_note_length check (note is null or length(note) <= 200);

comment on table public.game_rsvps is
  'Per-game, per-player attendance response. Lazy: absence of a row = pending. user_id records who responded (the player themselves, or a linked parent).';

create index if not exists idx_game_rsvps_game   on public.game_rsvps(game_id);
create index if not exists idx_game_rsvps_player on public.game_rsvps(player_id);

-- ─── updated_at trigger ──────────────────────────────────────────────────────
create or replace function public.touch_game_rsvps_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_game_rsvps_touch_updated_at on public.game_rsvps;

create trigger trg_game_rsvps_touch_updated_at
  before update on public.game_rsvps
  for each row execute function public.touch_game_rsvps_updated_at();

-- ─── Helper: may this user respond on behalf of this player? ────────────────
-- True for the player's own account, or a linked parent/guardian.
create or replace function public.can_rsvp_for_player(p_player_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.players pl
    where pl.id = p_player_id
      and pl.user_id = p_user_id
  ) or exists (
    select 1 from public.parent_player_links ppl
    where ppl.player_id = p_player_id
      and ppl.parent_user_id = p_user_id
  );
$$;

grant execute on function public.can_rsvp_for_player(uuid, uuid) to authenticated;

-- ─── RLS ─────────────────────────────────────────────────────────────────────
drop policy if exists "team_members_view_rsvps" on public.game_rsvps;
drop policy if exists "users_manage_own_rsvp"    on public.game_rsvps;

-- Coaches and team admins (head coach / assistant coach / athletic director)
-- on the game's team may read and manage every RSVP for that game.
-- public.is_coach() alone would exclude athletic_director, so it is OR'd with
-- an explicit role check. with check also verifies the player belongs to the
-- same team (no cross-team writes).
create policy "game_rsvps_coach_manage"
  on public.game_rsvps for all
  using (
    exists (
      select 1 from public.games g
      where g.id = public.game_rsvps.game_id
        and (
          public.is_coach(g.team_id, auth.uid())
          or public.get_team_role(g.team_id, auth.uid()) = 'athletic_director'
        )
    )
  )
  with check (
    exists (
      select 1
      from public.games g
      join public.players pl on pl.id = public.game_rsvps.player_id
      where g.id = public.game_rsvps.game_id
        and pl.team_id = g.team_id
        and (
          public.is_coach(g.team_id, auth.uid())
          or public.get_team_role(g.team_id, auth.uid()) = 'athletic_director'
        )
    )
  );

-- A player (own account) or a linked parent may manage that player's RSVP.
-- Kept shallow (players / parent_player_links only) to avoid the RLS
-- recursion issues this repo has hit before.
create policy "game_rsvps_responder_manage"
  on public.game_rsvps for all
  using (
    public.can_rsvp_for_player(public.game_rsvps.player_id, auth.uid())
  )
  with check (
    public.game_rsvps.user_id = auth.uid()
    and public.can_rsvp_for_player(public.game_rsvps.player_id, auth.uid())
    and exists (
      select 1
      from public.games g
      join public.players pl on pl.id = public.game_rsvps.player_id
      where g.id = public.game_rsvps.game_id
        and pl.team_id = g.team_id
    )
  );
