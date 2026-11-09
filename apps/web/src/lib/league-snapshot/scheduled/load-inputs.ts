import type { SupabaseClient } from '@supabase/supabase-js';
import {
  EventType,
  filterResetAndReverted,
  isFinishedBook,
  type BattingLineupContext,
  type ManualBattingLine,
  type ReconciliationOverride,
  type ScoreConflict,
} from '@baseball/shared';
import { fetchAllEventsForGames } from '@/lib/stats/fetch-events';
import { buildLineupsByGameId } from '@/lib/stats/lineups';
import {
  buildLeagueGameSideMaps,
  type LeagueGameSideMaps,
  type RosterRecordRow,
} from '@/lib/league-games/side-maps';

/** Every event type, so the paginated fetch pulls everything the reducers need. */
const SNAPSHOT_EVENT_TYPES = [...Object.values(EventType), 'game_reset'] as const;

/** One team's `games` row of a league game. */
export interface LeagueGameTeamRow {
  id: string;
  team_id: string;
  status: string;
  result_source: string | null;
  home_score: number | null;
  away_score: number | null;
  location_type: string;
  neutral_home_team: string | null;
  opponent_team_id: string | null;
}

/** One team's book of a league game. */
export interface LeagueGameBook {
  row: LeagueGameTeamRow;
  /** Completed by its own team (no written league result on it). */
  finished: boolean;
  /** Events on the row before reverted and reset ones are dropped; read only for a finished book. */
  eventCount: number;
  /** Active events, in sequence order; read only for a finished book. */
  events: Record<string, unknown>[];
  /** The team's own lineup for the book (home/away and guests left out of stats). */
  lineup: BattingLineupContext | undefined;
}

export interface LeagueGameManualResult {
  kind: 'final' | 'box' | 'batting' | 'forfeit';
  homeRuns: number | null;
  awayRuns: number | null;
  forfeitWinnerTeamId: string | null;
}

/** A hand-entered batting line and the team the player batted for. */
export interface TeamManualBattingLine extends ManualBattingLine {
  teamId: string;
}

export interface ScheduledLeagueGame {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  scheduledAt: string;
  home: LeagueGameBook | null;
  away: LeagueGameBook | null;
  reconciliation: { conflicts: ScoreConflict[]; overrides: ReconciliationOverride[] } | null;
  manual: LeagueGameManualResult | null;
  manualLines: TeamManualBattingLine[];
  sideMaps: LeagueGameSideMaps;
}

export interface ScheduledLeagueInputs {
  /** Active league member teams (seeded into the standings). */
  memberTeamIds: string[];
  divisionOf: Map<string, string | null>;
  teamNames: Map<string, string>;
  /** Every player who can be credited in these games, for names. */
  players: { id: string; firstName: string; lastName: string }[];
  optOut: Map<string, boolean>;
  /** The season's league games that aren't cancelled, oldest first. */
  games: ScheduledLeagueGame[];
}

interface LeagueGameRow {
  id: string;
  home_team_id: string;
  away_team_id: string;
  home_game_id: string | null;
  away_game_id: string | null;
  scheduled_at: string;
}

interface ManualLineRow {
  league_game_id: string;
  team_id: string;
  player_id: string;
  ab: number;
  r: number;
  h: number;
  doubles: number;
  triples: number;
  hr: number;
  rbi: number;
  bb: number;
  so: number;
  hbp: number;
  sf: number;
  sb: number;
}

interface PlayerRow {
  id: string;
  team_id: string | null;
  first_name: string;
  last_name: string;
}

type QueryResult = { data: unknown; error: { message: string } | null };

function rowsOf<T>(result: QueryResult, what: string, leagueId: string, season: string): T[] {
  if (result.error) {
    throw new Error(`snapshot ${what} load failed (league=${leagueId} season=${season}): ${result.error.message}`);
  }
  return (result.data ?? []) as T[];
}

function addTo(map: Map<string, Set<string>>, key: string, value: string): void {
  const set = map.get(key) ?? new Set<string>();
  set.add(value);
  map.set(key, set);
}

function groupBy<T>(items: readonly T[], keyOf: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return groups;
}

function toManualLine(row: ManualLineRow): TeamManualBattingLine {
  return {
    teamId: row.team_id,
    playerId: row.player_id,
    ab: row.ab,
    r: row.r,
    h: row.h,
    doubles: row.doubles,
    triples: row.triples,
    hr: row.hr,
    rbi: row.rbi,
    bb: row.bb,
    so: row.so,
    hbp: row.hbp,
    sf: row.sf,
    sb: row.sb,
  };
}

/**
 * Everything the league snapshot needs for a league that schedules its own
 * games: the season's league games that aren't cancelled, both teams' rows,
 * the events of every finished book, reconciliations, hand-entered results
 * and lines, the id maps for both books (built from bulk reads rather than one
 * `loadSideIdMaps` per game), team names, player names and opt-outs. Throws
 * with the league and season on any query error.
 */
export async function loadScheduledLeagueInputs(
  db: SupabaseClient,
  leagueId: string,
  season: string,
): Promise<ScheduledLeagueInputs> {
  const check = <T>(result: QueryResult, what: string) => rowsOf<T>(result, what, leagueId, season);

  const [membersResult, leagueGamesResult, optOutResult] = await Promise.all([
    db.from('league_members').select('team_id, division_id').eq('league_id', leagueId).eq('is_active', true),
    db
      .from('league_games')
      .select('id, home_team_id, away_team_id, home_game_id, away_game_id, scheduled_at')
      .eq('league_id', leagueId)
      .eq('season', season)
      .neq('status', 'cancelled'),
    db.from('league_players').select('player_id, public_opt_out').eq('league_id', leagueId),
  ]);
  const members = check<{ team_id: string | null; division_id: string | null }>(membersResult, 'league_members')
    .filter((member): member is { team_id: string; division_id: string | null } => member.team_id !== null);
  const leagueGames = check<LeagueGameRow>(leagueGamesResult, 'league_games').sort(
    (a, b) => a.scheduled_at.localeCompare(b.scheduled_at) || a.id.localeCompare(b.id),
  );
  const optOut = new Map(
    check<{ player_id: string; public_opt_out: boolean }>(optOutResult, 'league_players').map((row) => [
      row.player_id,
      row.public_opt_out,
    ]),
  );

  const memberTeamIds = members.map((member) => member.team_id);
  const divisionOf = new Map(members.map((member) => [member.team_id, member.division_id]));
  const gameTeamIds = [...new Set(leagueGames.flatMap((game) => [game.home_team_id, game.away_team_id]))];
  const allTeamIds = [...new Set([...memberTeamIds, ...gameTeamIds])];
  const teamNames = new Map(
    allTeamIds.length
      ? check<{ id: string; name: string }>(await db.from('teams').select('id, name').in('id', allTeamIds), 'teams').map(
          (team) => [team.id, team.name],
        )
      : [],
  );

  if (leagueGames.length === 0) {
    return { memberTeamIds, divisionOf, teamNames, players: [], optOut, games: [] };
  }

  const leagueGameIds = leagueGames.map((game) => game.id);
  const rowIds = leagueGames.flatMap((game) => [game.home_game_id, game.away_game_id]).filter((id): id is string => !!id);
  const homeRowIds = leagueGames.map((game) => game.home_game_id).filter((id): id is string => !!id);

  const [rowsResult, reconciliationResult, manualResult, manualLinesResult, rosterResult, membershipResult, lineupResult] =
    await Promise.all([
      db
        .from('games')
        .select('id, team_id, status, result_source, home_score, away_score, location_type, neutral_home_team, opponent_team_id')
        .in('id', rowIds),
      db.from('game_reconciliations').select('home_game_id, conflicts, resolved_overrides').in('home_game_id', homeRowIds),
      db
        .from('league_game_manual_results')
        .select('league_game_id, kind, home_runs, away_runs, forfeit_winner_team_id')
        .in('league_game_id', leagueGameIds),
      db
        .from('league_game_manual_batting_lines')
        .select('league_game_id, team_id, player_id, ab, r, h, doubles, triples, hr, rbi, bb, so, hbp, sf, sb')
        .in('league_game_id', leagueGameIds),
      db.from('players').select('id, team_id, first_name, last_name').in('team_id', gameTeamIds),
      db.from('player_team_memberships').select('player_id, team_id').in('team_id', gameTeamIds),
      db.from('game_lineups').select('game_id, player_id').in('game_id', rowIds),
    ]);

  const teamRows = check<LeagueGameTeamRow>(rowsResult, 'games');
  const rowById = new Map(teamRows.map((row) => [row.id, row]));
  const reconciliationByHomeRow = new Map(
    check<{ home_game_id: string; conflicts: unknown; resolved_overrides: unknown }>(
      reconciliationResult,
      'game_reconciliations',
    ).map((row) => [
      row.home_game_id,
      {
        conflicts: Array.isArray(row.conflicts) ? (row.conflicts as ScoreConflict[]) : [],
        overrides: Array.isArray(row.resolved_overrides) ? (row.resolved_overrides as ReconciliationOverride[]) : [],
      },
    ]),
  );
  const manualByGame = new Map(
    check<{
      league_game_id: string;
      kind: LeagueGameManualResult['kind'];
      home_runs: number | null;
      away_runs: number | null;
      forfeit_winner_team_id: string | null;
    }>(manualResult, 'league_game_manual_results').map((row) => [
      row.league_game_id,
      {
        kind: row.kind,
        homeRuns: row.home_runs,
        awayRuns: row.away_runs,
        forfeitWinnerTeamId: row.forfeit_winner_team_id,
      },
    ]),
  );
  const manualLineRows = check<ManualLineRow>(manualLinesResult, 'league_game_manual_batting_lines');
  const manualLinesByGame = groupBy(manualLineRows, (row) => row.league_game_id);
  const rosterRows = check<PlayerRow>(rosterResult, 'players');
  const membershipRows = check<{ player_id: string; team_id: string }>(membershipResult, 'player_team_memberships');
  const lineupRows = check<{ game_id: string; player_id: string }>(lineupResult, 'game_lineups');

  const rosterPlayerIds = new Map<string, Set<string>>();
  for (const row of rosterRows) if (row.team_id) addTo(rosterPlayerIds, row.team_id, row.id);
  for (const row of membershipRows) addTo(rosterPlayerIds, row.team_id, row.player_id);

  const recordIds = [...new Set(teamRows.map((row) => row.opponent_team_id).filter((id): id is string => !!id))];
  const recordRows = recordIds.length
    ? check<RosterRecordRow>(
        await db
          .from('opponent_players')
          .select('id, opponent_team_id, linked_player_id, placeholder_game_id, is_fill_in')
          .in('opponent_team_id', recordIds),
        'opponent_players',
      )
    : [];

  // Events and lineups only matter for a finished book: an unfinished one never counts.
  const finishedRows = teamRows.filter((row) => isFinishedBook(row));
  const finishedRowIds = finishedRows.map((row) => row.id);
  const rawEvents = await fetchAllEventsForGames(db, finishedRowIds, SNAPSHOT_EVENT_TYPES);
  const rawEventsByRow = groupBy(rawEvents, (event) => String(event.game_id));
  const lineupByRow = await buildLineupsByGameId(db, finishedRows, { strict: true });

  const bookFor = (rowId: string | null): LeagueGameBook | null => {
    const row = rowId ? rowById.get(rowId) : undefined;
    if (!row) return null;
    const raw = rawEventsByRow.get(row.id) ?? [];
    return {
      row,
      finished: isFinishedBook(row),
      eventCount: raw.length,
      events: filterResetAndReverted(raw),
      lineup: lineupByRow.get(row.id),
    };
  };

  const games = leagueGames.map((game): ScheduledLeagueGame => ({
    id: game.id,
    homeTeamId: game.home_team_id,
    awayTeamId: game.away_team_id,
    scheduledAt: game.scheduled_at,
    home: bookFor(game.home_game_id),
    away: bookFor(game.away_game_id),
    reconciliation: game.home_game_id ? reconciliationByHomeRow.get(game.home_game_id) ?? null : null,
    manual: manualByGame.get(game.id) ?? null,
    manualLines: (manualLinesByGame.get(game.id) ?? []).map(toManualLine),
    sideMaps: buildLeagueGameSideMaps({
      leagueGameId: game.id,
      homeTeamId: game.home_team_id,
      awayTeamId: game.away_team_id,
      homeGameId: game.home_game_id,
      awayGameId: game.away_game_id,
      games: teamRows.filter((row) => row.id === game.home_game_id || row.id === game.away_game_id),
      rosterPlayerIds,
      lineupRows: lineupRows.filter((row) => row.game_id === game.home_game_id || row.game_id === game.away_game_id),
      recordRows,
    }),
  }));

  const players = await loadPlayerNames(db, rosterRows, [
    ...membershipRows.map((row) => row.player_id),
    ...lineupRows.map((row) => row.player_id),
    ...recordRows.map((row) => row.linked_player_id).filter((id): id is string => !!id),
    ...manualLineRows.map((row) => row.player_id),
  ], check);

  return { memberTeamIds, divisionOf, teamNames, players, optOut, games };
}

/** Names for the teams' current players plus anyone else who can be credited (past members, guests, linked players). */
async function loadPlayerNames(
  db: SupabaseClient,
  rosterRows: PlayerRow[],
  otherPlayerIds: string[],
  check: <T>(result: QueryResult, what: string) => T[],
): Promise<{ id: string; firstName: string; lastName: string }[]> {
  const named = new Map(rosterRows.map((row) => [row.id, row]));
  const missing = [...new Set(otherPlayerIds)].filter((id) => !named.has(id));
  if (missing.length) {
    const rows = check<PlayerRow>(
      await db.from('players').select('id, team_id, first_name, last_name').in('id', missing),
      'players by id',
    );
    for (const row of rows) named.set(row.id, row);
  }
  return [...named.values()].map((row) => ({ id: row.id, firstName: row.first_name, lastName: row.last_name }));
}
