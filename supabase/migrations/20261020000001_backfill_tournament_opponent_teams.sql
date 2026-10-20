-- Tournament games scheduled with a typed-in opponent had no opponent_teams
-- record, so the opponent roster and lineup had nothing to sync to the phone
-- scoring the game. createGameAction / updateGameAction now create one
-- (ensureTournamentOpponentTeam in apps/web/src/lib/games); this backfills
-- tournament games scheduled before that. Like the app, it reuses the team's
-- existing record with the same name (case-insensitive).

insert into public.opponent_teams (team_id, name, created_by)
select distinct on (g.team_id, lower(btrim(g.opponent_name)))
       g.team_id, btrim(g.opponent_name), g.created_by
from public.games g
where g.tournament_id is not null
  and g.opponent_team_id is null
  and nullif(btrim(g.opponent_name), '') is not null
  and not exists (
    select 1
    from public.opponent_teams ot
    where ot.team_id = g.team_id
      and lower(btrim(ot.name)) = lower(btrim(g.opponent_name))
  )
order by g.team_id, lower(btrim(g.opponent_name)), g.created_at;

-- updated_at moves forward so the mobile incremental pull delivers the link.
update public.games g
set opponent_team_id = (
      select ot.id
      from public.opponent_teams ot
      where ot.team_id = g.team_id
        and lower(btrim(ot.name)) = lower(btrim(g.opponent_name))
      order by ot.created_at
      limit 1
    ),
    updated_at = now()
where g.tournament_id is not null
  and g.opponent_team_id is null
  and nullif(btrim(g.opponent_name), '') is not null;
