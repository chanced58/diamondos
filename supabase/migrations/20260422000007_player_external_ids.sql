-- ============================================================================
-- Tier 5 — Integration Hub foundation
-- Migration: player_external_ids (maps players to vendor-side identifiers)
-- ============================================================================

create table public.player_external_ids (
  id            uuid primary key default gen_random_uuid(),
  player_id     uuid not null references public.players(id) on delete cascade,
  service       text not null,
  external_id   text not null,
  linked_by     uuid references auth.users(id) on delete set null,
  confidence    text,
  created_at    timestamptz not null default now(),
  -- A given (service, external_id) must resolve to exactly one player.
  unique (service, external_id),
  -- And the same (player, service, external_id) triple can't be inserted twice.
  unique (player_id, service, external_id)
);

comment on table public.player_external_ids is
  'Maps a DiamondOS player to a vendor-side identifier (Rapsodo player id, '
  'Blast sensor serial, GameChanger player_id, etc.). Populated by CSV '
  'importers in later tiers; read-only surface in Tier 5.';

comment on column public.player_external_ids.confidence is
  'Optional linker-provided confidence, e.g. "exact", "name_jersey_match", "coach_confirmed".';

create index idx_player_external_ids_service_external
  on public.player_external_ids(service, external_id);
create index idx_player_external_ids_player on public.player_external_ids(player_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table public.player_external_ids enable row level security;

-- Read: any active member of the player's team.
create policy "player_external_ids_select"
  on public.player_external_ids for select
  using (
    exists (
      select 1
      from public.players p
      join public.team_members tm on tm.team_id = p.team_id
      where p.id = public.player_external_ids.player_id
        and tm.user_id = auth.uid()
        and tm.is_active = true
    )
  );

-- Write: coaches on the player's team only.
create policy "player_external_ids_coach_insert"
  on public.player_external_ids for insert
  with check (
    exists (
      select 1 from public.players p
      where p.id = public.player_external_ids.player_id
        and public.is_coach(p.team_id, auth.uid())
    )
  );

create policy "player_external_ids_coach_update"
  on public.player_external_ids for update
  using (
    exists (
      select 1 from public.players p
      where p.id = public.player_external_ids.player_id
        and public.is_coach(p.team_id, auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.players p
      where p.id = public.player_external_ids.player_id
        and public.is_coach(p.team_id, auth.uid())
    )
  );

create policy "player_external_ids_coach_delete"
  on public.player_external_ids for delete
  using (
    exists (
      select 1 from public.players p
      where p.id = public.player_external_ids.player_id
        and public.is_coach(p.team_id, auth.uid())
    )
  );

-- ─── RPC: match_player_by_external_id ────────────────────────────────────────
-- Resolves a (service, external_id) pair to a player_id. security definer so
-- CSV importers can match without first loading the whole map into app code,
-- but the definer's reach is narrow: it only returns the player_id that the
-- caller already has access to read (RLS on players enforces team membership).
create or replace function public.match_player_by_external_id(
  p_service text,
  p_external_id text
)
returns uuid
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select pei.player_id
    from public.player_external_ids pei
    join public.players p on p.id = pei.player_id
    join public.team_members tm on tm.team_id = p.team_id
   where pei.service = p_service
     and pei.external_id = p_external_id
     and tm.user_id = auth.uid()
     and tm.is_active = true
   limit 1;
$$;

grant execute on function public.match_player_by_external_id(text, text) to authenticated;
