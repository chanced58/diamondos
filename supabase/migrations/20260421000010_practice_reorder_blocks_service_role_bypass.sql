-- ============================================================================
-- Practice Engine — Tier 2 Coaching Collaboration (Phase A follow-up)
-- Fix: practice_reorder_blocks() failed for service-role callers.
--
-- The RPC is SECURITY DEFINER and gates on is_head_coach_or_ad(..., auth.uid()).
-- When called via the service-role key (web server actions), auth.uid() is
-- NULL → the role check returns false → the RPC raises.
--
-- Web server actions already authorize HC/AD at the action boundary before
-- calling into the service-role client, so a NULL auth.uid() invocation is
-- trusted server code. Treat it as authorized. Non-service-role callers still
-- hit the is_head_coach_or_ad check.
-- ============================================================================

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

  -- Service role (auth.uid() IS NULL) bypasses the role check; the web server
  -- action enforced HC/AD at the action boundary before this call.
  if auth.uid() is null then
    can_reorder := true;
  else
    select public.is_head_coach_or_ad(pr.team_id, auth.uid())
      into can_reorder
      from public.practices pr
     where pr.id = p_practice_id;
  end if;

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
