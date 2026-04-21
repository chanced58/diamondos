-- ============================================================================
-- Practice Engine — Tier 2 Coaching Collaboration (Phase A)
-- Migration: tighten practice_blocks RLS for per-block ownership.
--
-- Changes the authorization model from "any coach on the team can edit any
-- block" to:
--   - head_coach / athletic_director: create / delete / reorder / reassign /
--     edit any field on any block.
--   - assistant_coach: edit content fields on blocks where
--     assigned_coach_id = auth.uid(). Structural fields (position,
--     assigned_coach_id, block_type, planned_duration_minutes, drill_id,
--     practice_id) are reserved to head coach / AD.
--   - anyone else on team: read-only.
--
-- RLS handles the row-level gate. A BEFORE UPDATE trigger handles the
-- column-level restriction (Postgres RLS cannot compare OLD/NEW cleanly).
-- The web path uses the service role key, which bypasses RLS; the trigger
-- short-circuits for service_role so web server actions (which do their own
-- role-differentiated authz at the action boundary) are unaffected.
-- ============================================================================

-- ─── Helpers ─────────────────────────────────────────────────────────────────

-- Returns true if the user is a head coach or athletic director on the team.
-- Mirrors the shape of public.is_coach() in 20260220000003_create_teams_seasons.sql.
create or replace function public.is_head_coach_or_ad(p_team_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.team_members
    where team_id = p_team_id
      and user_id = p_user_id
      and role in ('head_coach', 'athletic_director')
      and is_active = true
  );
$$;

comment on function public.is_head_coach_or_ad(uuid, uuid) is
  'True when user has full-practice-management privileges (head coach or athletic director) on the team.';

-- Returns true if the caller (auth.uid()) can edit content fields on the given
-- block: they are head coach / AD on the owning team, OR they are the block''s
-- assigned coach AND still a coach on the team.
create or replace function public.can_edit_block(p_block_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.practice_blocks b
    join public.practices pr on pr.id = b.practice_id
    where b.id = p_block_id
      and (
        public.is_head_coach_or_ad(pr.team_id, auth.uid())
        or (
          b.assigned_coach_id = auth.uid()
          and exists (
            select 1 from public.team_members tm
            where tm.team_id = pr.team_id
              and tm.user_id = auth.uid()
              and tm.role in ('head_coach', 'assistant_coach', 'athletic_director')
              and tm.is_active = true
          )
        )
      )
  );
$$;

comment on function public.can_edit_block(uuid) is
  'True when caller can edit content fields on the given block: head coach / AD on the team, or the block''s assigned coach.';

grant execute on function public.is_head_coach_or_ad(uuid, uuid) to authenticated;
grant execute on function public.can_edit_block(uuid) to authenticated;

-- ─── practice_blocks: replace blanket policy with split policies ─────────────

drop policy if exists "practice_blocks_coach_manage" on public.practice_blocks;

create policy "practice_blocks_insert"
  on public.practice_blocks for insert
  with check (
    exists (
      select 1 from public.practices pr
      where pr.id = public.practice_blocks.practice_id
        and public.is_head_coach_or_ad(pr.team_id, auth.uid())
    )
  );

create policy "practice_blocks_delete"
  on public.practice_blocks for delete
  using (
    exists (
      select 1 from public.practices pr
      where pr.id = public.practice_blocks.practice_id
        and public.is_head_coach_or_ad(pr.team_id, auth.uid())
        and pr.run_status <> 'completed'
    )
  );

create policy "practice_blocks_update"
  on public.practice_blocks for update
  using (
    exists (
      select 1 from public.practices pr
      where pr.id = public.practice_blocks.practice_id
        and (
          public.is_head_coach_or_ad(pr.team_id, auth.uid())
          or (
            public.is_coach(pr.team_id, auth.uid())
            and public.practice_blocks.assigned_coach_id = auth.uid()
          )
        )
    )
  )
  with check (
    exists (
      select 1 from public.practices pr
      where pr.id = public.practice_blocks.practice_id
        and (
          public.is_head_coach_or_ad(pr.team_id, auth.uid())
          or (
            public.is_coach(pr.team_id, auth.uid())
            and public.practice_blocks.assigned_coach_id = auth.uid()
          )
        )
    )
  );

-- ─── BEFORE UPDATE trigger: enforce structural-field restriction ─────────────

create or replace function public.practice_blocks_enforce_owner_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_team_id uuid;
  v_run_status text;
  v_role text;
begin
  -- Web server actions use the service-role key (RLS bypassed). They enforce
  -- role at the action layer; short-circuit the trigger so plain UPDATEs
  -- from trusted server code pass unchanged.
  v_role := coalesce(auth.role(), '');
  if v_role = 'service_role' then
    return new;
  end if;

  select pr.team_id, pr.run_status
    into v_team_id, v_run_status
    from public.practices pr
   where pr.id = new.practice_id;

  -- Head coach / AD bypass: they can correct any field, including on completed
  -- practices (e.g. fixing actual_duration_minutes post-hoc).
  if public.is_head_coach_or_ad(v_team_id, auth.uid()) then
    return new;
  end if;

  -- Below this point the actor must be an assistant coach updating their own
  -- assigned block (RLS already verified that).

  -- Completed practices are locked to non-HC/AD.
  if v_run_status = 'completed' then
    raise exception 'Practice is completed; only head coaches can modify blocks.';
  end if;

  -- Structural columns are reserved for HC/AD.
  if new.position is distinct from old.position then
    raise exception 'Only head coaches can change block position.';
  end if;
  if new.assigned_coach_id is distinct from old.assigned_coach_id then
    raise exception 'Only head coaches can reassign blocks.';
  end if;
  if new.block_type is distinct from old.block_type then
    raise exception 'Only head coaches can change block type.';
  end if;
  if new.planned_duration_minutes is distinct from old.planned_duration_minutes then
    raise exception 'Only head coaches can change planned duration.';
  end if;
  if new.drill_id is distinct from old.drill_id then
    raise exception 'Only head coaches can change the block drill.';
  end if;
  if new.practice_id is distinct from old.practice_id then
    raise exception 'Blocks cannot move between practices.';
  end if;

  return new;
end;
$$;

-- Trigger name sorts before touch_updated_at so enforcement runs first.
create trigger trg_practice_blocks_enforce_owner_update
  before update on public.practice_blocks
  for each row execute function public.practice_blocks_enforce_owner_update();

-- ─── practice_block_players: mirror split policies ───────────────────────────
--
-- Players are (de)composed via delete-then-insert in assignPlayersToBlock;
-- there is no meaningful UPDATE flow. HC/AD compose rosters.

drop policy if exists "practice_block_players_coach_manage" on public.practice_block_players;

create policy "practice_block_players_insert"
  on public.practice_block_players for insert
  with check (
    exists (
      select 1 from public.practice_blocks b
      join public.practices pr on pr.id = b.practice_id
      where b.id = public.practice_block_players.block_id
        and public.is_head_coach_or_ad(pr.team_id, auth.uid())
    )
  );

create policy "practice_block_players_delete"
  on public.practice_block_players for delete
  using (
    exists (
      select 1 from public.practice_blocks b
      join public.practices pr on pr.id = b.practice_id
      where b.id = public.practice_block_players.block_id
        and public.is_head_coach_or_ad(pr.team_id, auth.uid())
    )
  );

-- ─── Tighten practice_reorder_blocks RPC ─────────────────────────────────────
--
-- Reorder is structural and only head coach / AD can perform it.

create or replace function public.practice_reorder_blocks(
  p_practice_id uuid,
  p_order uuid[]
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  can_reorder boolean;
begin
  if p_order is null or array_length(p_order, 1) is null then
    return;
  end if;

  select public.is_head_coach_or_ad(pr.team_id, auth.uid())
    into can_reorder
    from public.practices pr
   where pr.id = p_practice_id;

  if not coalesce(can_reorder, false) then
    raise exception 'Only head coaches or athletic directors may reorder blocks';
  end if;

  update public.practice_blocks b
     set position = idx - 1
    from unnest(p_order) with ordinality as ord(block_id, idx)
   where b.id = ord.block_id
     and b.practice_id = p_practice_id;
end;
$$;

grant execute on function public.practice_reorder_blocks(uuid, uuid[]) to authenticated;
