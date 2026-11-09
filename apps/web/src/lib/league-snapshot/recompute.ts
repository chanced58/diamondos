import type { Database } from '@baseball/database';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  deriveBattingStats,
  derivePitchingStats,
  filterResetAndReverted,
  EventType,
  type GameEvent,
} from '@baseball/shared';
import { fetchAllEventsForGames } from '@/lib/stats/fetch-events';
import { buildLineupsByGameId } from '@/lib/stats/lineups';
import { resolveLeagueSeasonGameIds } from './season';
import { computeStandings, computeOpponentStandings } from './standings';
import {
  combinePlayerStats,
  spotlightRows,
  standingRow,
  teamStatRow,
  type PlayerTeamInfo,
} from './aggregate';
import { clearLeagueSeasonSnapshots, replaceLeagueSeasonSnapshot } from './write';
import { recomputeScheduledLeagueSnapshot } from './scheduled/recompute-scheduled';

const NIL = '00000000-0000-0000-0000-000000000000';

// All derivable event types (mirrors compliance's RELEVANT_EVENT_TYPES) so the
// paginated fetch pulls everything the reducers need.
const SNAPSHOT_EVENT_TYPES = [...Object.values(EventType), 'game_reset'] as const;

/** Throw with context if a Supabase query returned an error. */
function assertOk(error: { message: string } | null, what: string, leagueId: string, season: string): void {
  if (error) throw new Error(`recompute ${what} failed (league=${leagueId} season=${season}): ${error.message}`);
}

/**
 * Recompute and replace all four league snapshot tables for one league-season.
 * A league that schedules its own games (`leagues.schedules_games`) is built
 * from its league games (`recomputeScheduledLeagueSnapshot`); every other
 * league from its teams' games, as below.
 */
export async function recomputeLeagueSnapshot(
  db: SupabaseClient<Database>,
  leagueId: string,
  season: string,
): Promise<void> {
  const { data: league, error: leagueErr } = await db
    .from('leagues')
    .select('schedules_games')
    .eq('id', leagueId)
    .maybeSingle();
  assertOk(leagueErr, 'leagues', leagueId, season);
  if (league?.schedules_games) {
    await recomputeScheduledLeagueSnapshot(db, leagueId, season);
    return;
  }
  await recomputeTeamGameSnapshot(db, leagueId, season);
}

/**
 * The snapshot of a league whose teams create their own games.
 *
 * Reuses the @baseball/shared TS stat reducers. Player→team attribution comes
 * from players.team_id (game_lineups has no team_id), and home/away is derived
 * from the game row (game_lineups has no is_home). Fielding stats are not
 * surfaced on the home page in v1, so fielding aggregation is skipped. Each
 * player's line is written under both scopes (`season` and `team`), identical
 * here, so the leaderboards and team pages read the same way for every league.
 */
async function recomputeTeamGameSnapshot(
  db: SupabaseClient<Database>,
  leagueId: string,
  season: string,
): Promise<void> {
  // 1) league member ids — platform teams (team_id) and opponent teams
  //    (opponent_team_id). A row has exactly one of the two set.
  const { data: members, error: membersErr } = await db
    .from('league_members')
    .select('team_id, opponent_team_id, division_id')
    .eq('league_id', leagueId)
    .eq('is_active', true);
  assertOk(membersErr, 'league_members', leagueId, season);
  const teamIds = (members ?? [])
    .map((m: { team_id: string | null }) => m.team_id)
    .filter((t: string | null): t is string => Boolean(t));
  const opponentTeamIds = (members ?? [])
    .map((m: { opponent_team_id: string | null }) => m.opponent_team_id)
    .filter((t: string | null): t is string => Boolean(t));
  // Map each member (platform or opponent) to its division so standings rows can
  // be grouped by division on the public league page. Unassigned members → null.
  const divisionOf = new Map<string, string | null>();
  for (const m of (members ?? []) as Array<{
    team_id: string | null;
    opponent_team_id: string | null;
    division_id: string | null;
  }>) {
    const id = m.team_id ?? m.opponent_team_id;
    if (id) divisionOf.set(id, m.division_id);
  }
  if (teamIds.length === 0) {
    // No platform teams ⇒ no recorded games ⇒ no inverse opponent records to
    // derive. Clear stale snapshots so the public page doesn't keep serving old
    // standings/leaders (covers opponent-only rosters too).
    await clearLeagueSeasonSnapshots(db, leagueId, season);
    return;
  }
  // 2) games in this league-season
  const gameIds = await resolveLeagueSeasonGameIds(db, teamIds, season);
  const gameIdList = gameIds.length ? gameIds : [NIL];

  // 3) load games, teams, opponent teams, opt-outs, and the league roster
  const [
    { data: games, error: gamesErr },
    { data: teams, error: teamsErr },
    { data: opponentTeams, error: opponentTeamsErr },
    { data: optOuts, error: optOutsErr },
    { data: playerRows, error: playerRowsErr },
  ] = await Promise.all([
    db
      .from('games')
      .select('id, team_id, opponent_team_id, home_score, away_score, location_type, neutral_home_team, status')
      .in('id', gameIdList),
    db.from('teams').select('id, name').in('id', teamIds),
    db.from('opponent_teams').select('id, name').in('id', opponentTeamIds.length ? opponentTeamIds : [NIL]),
    db.from('league_players').select('player_id, public_opt_out').eq('league_id', leagueId),
    db.from('players').select('id, first_name, last_name, team_id').in('team_id', teamIds),
  ]);
  assertOk(gamesErr, 'games', leagueId, season);
  assertOk(teamsErr, 'teams', leagueId, season);
  assertOk(opponentTeamsErr, 'opponent_teams', leagueId, season);
  assertOk(optOutsErr, 'league_players', leagueId, season);
  assertOk(playerRowsErr, 'players', leagueId, season);

  const teamName = new Map<string, string>((teams ?? []).map((t) => [t.id, t.name]));
  const opponentName = new Map<string, string>((opponentTeams ?? []).map((t) => [t.id, t.name]));
  const optOut = new Map<string, boolean>((optOuts ?? []).map((o) => [o.player_id, o.public_opt_out]));

  // 4) events: paginated fetch (past Supabase's 1000-row cap) + drop
  //    reverted/voided/reset events — same pipeline the compliance stats use.
  //    Without pagination a multi-game season silently truncates to ~1000
  //    events and per-player PA/AB are massively undercounted.
  const events = filterResetAndReverted(await fetchAllEventsForGames(db, gameIds, SNAPSHOT_EVENT_TYPES));

  // 5) name list + team attribution from the league roster
  const players = (playerRows ?? []).map((p) => ({
    id: p.id,
    firstName: p.first_name,
    lastName: p.last_name,
  }));
  const teamOf = new Map<string, PlayerTeamInfo>();
  for (const p of playerRows ?? []) {
    // The roster query filters team_id with IN, which excludes NULL/free agents.
    const teamId = p.team_id!;
    teamOf.set(p.id, {
      teamId,
      teamName: teamName.get(teamId) ?? '',
      firstName: p.first_name,
      lastName: p.last_name,
      optOut: optOut.get(p.id) ?? false,
    });
  }

  // 6) per-game batting lineup context (home/away + guest exclusion), via the
  //    shared helper used across the stats pages.
  const battingCtx = await buildLineupsByGameId(
    db,
    (games ?? []).map((g) => ({
      id: g.id,
      location_type: g.location_type,
      neutral_home_team: g.neutral_home_team,
    })),
  );

  // 7) run reducers
  // Reducers accept persisted snake_case event rows as well as domain events.
  const evts = events as unknown as GameEvent[];
  const batting = deriveBattingStats(evts, players, battingCtx);
  const pitching = derivePitchingStats(evts, players);

  const seasonPlayerRows = combinePlayerStats({
    batting,
    pitching,
    fielding: new Map(),
    teamOf,
    leagueId,
    season,
    scope: 'season',
  });
  const playerSnapshotRows = [
    ...seasonPlayerRows,
    ...seasonPlayerRows.map((row) => ({ ...row, scope: 'team' as const })),
  ];

  // 8) standings — platform teams from their own perspective, opponent teams
  //    from the inverse of games recorded against them.
  const standings = computeStandings(games ?? [], teamIds);
  const opponentStandings = computeOpponentStandings(games ?? [], opponentTeamIds);

  // 9) team stats — team AVG and ERA over the lines of the team's roster
  const teamStatRows = Array.from(standings.entries()).map(([teamId, record]) => {
    const rosterIds = Array.from(teamOf).filter(([, info]) => info.teamId === teamId).map(([pid]) => pid);
    return teamStatRow({
      leagueId,
      season,
      teamId,
      teamName: teamName.get(teamId) ?? '',
      record,
      batting: rosterIds.map((pid) => batting.get(pid)).filter((line) => line !== undefined),
      pitching: rosterIds.map((pid) => pitching.get(pid)).filter((line) => line !== undefined),
    });
  });

  const standingRows = [
    ...Array.from(standings.entries()).map(([teamId, record]) =>
      standingRow({
        leagueId,
        season,
        teamId,
        opponentTeamId: null,
        divisionId: divisionOf.get(teamId) ?? null,
        teamName: teamName.get(teamId) ?? '',
        record,
      }),
    ),
    ...Array.from(opponentStandings.entries()).map(([opponentTeamId, record]) =>
      standingRow({
        leagueId,
        season,
        teamId: null,
        opponentTeamId,
        divisionId: divisionOf.get(opponentTeamId) ?? null,
        teamName: opponentName.get(opponentTeamId) ?? '',
        record,
      }),
    ),
  ];

  // 10) spotlights
  const spotlights = spotlightRows(seasonPlayerRows, teamStatRows, leagueId, season);

  // 11) replace snapshot rows for this league-season.
  await replaceLeagueSeasonSnapshot(db, leagueId, season, {
    players: playerSnapshotRows,
    standings: standingRows,
    teamStats: teamStatRows,
    spotlights,
  });
}
