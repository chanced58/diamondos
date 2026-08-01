-- Scorekeepers may append immutable game events without receiving coach
-- administration privileges.

alter type public.team_role add value if not exists 'scorekeeper';

create or replace function public.is_scorekeeper(p_team_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_members
    where team_id = p_team_id
      and user_id = p_user_id
      and role in ('scorekeeper', 'head_coach', 'assistant_coach')
      and is_active = true
  );
$$;

grant execute on function public.is_scorekeeper(uuid, uuid) to authenticated;

drop policy if exists "coaches_insert_game_events" on public.game_events;
create policy "scorekeepers_insert_game_events"
  on public.game_events for insert
  with check (
    exists (
      select 1
      from public.games g
      where g.id = public.game_events.game_id
        and public.is_scorekeeper(g.team_id, auth.uid())
    )
  );
