-- ════════════════════════════════════════════════════════════════════════════
-- Mobile game lifecycle: coach-driven scheduled → in_progress transition.
--
-- The mobile app is offline-first and cannot call Next.js server actions, so
-- starting a game at the field goes through this SECURITY DEFINER RPC when
-- the sync engine reconciles a locally recorded game_start event against a
-- server row still marked 'scheduled'. Game COMPLETION intentionally does NOT
-- get an RPC — finalization (reconciliation + league snapshot recompute) is
-- TypeScript living in apps/web, so the sync engine calls
-- POST /api/games/:id/finalize instead.
--
-- RLS context: coaches_manage_games covers only head/assistant coach via
-- is_coach(); web actions additionally allow athletic_director through the
-- service role. This RPC mirrors the web's COACH_ROLES set so an AD scoring
-- from mobile can start a game too.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.fn_start_game(p_game_id uuid)
returns void
language plpgsql security definer
as $$
begin
  if not exists (
    select 1
    from public.games g
    join public.team_members tm on tm.team_id = g.team_id
    where g.id = p_game_id
      and tm.user_id = auth.uid()
      and tm.is_active
      and tm.role in ('head_coach', 'assistant_coach', 'athletic_director')
  ) then
    raise exception 'not authorized to start this game';
  end if;

  -- Idempotent: only scheduled games transition; a game already in progress
  -- (or completed/cancelled) is left untouched so sync retries are safe.
  update public.games
     set status = 'in_progress',
         started_at = coalesce(started_at, now()),
         updated_at = now()
   where id = p_game_id
     and status = 'scheduled';
end;
$$;

alter function public.fn_start_game(uuid)
  set search_path = public, pg_temp;

-- Least privilege: the internal role check already rejects anon/non-coaches,
-- but narrow the exposed RPC surface so only authenticated clients can call it.
-- Supabase pre-grants EXECUTE to anon directly (not only via PUBLIC), so revoke
-- from both.
revoke all on function public.fn_start_game(uuid) from public, anon;
grant execute on function public.fn_start_game(uuid) to authenticated;

comment on function public.fn_start_game(uuid) is
  'Coach-authorized scheduled → in_progress transition, called by the mobile sync engine when a locally recorded game_start event reaches the server.';
