import type { SupabaseClient } from '@supabase/supabase-js';
import { buildSideIdMaps, type SideIdMap } from '@baseball/shared';

/** Both teams' views of one team's book: the scoring team's own, and the other team's. */
export interface BookSideMaps {
  scoringSide: SideIdMap;
  otherSide: SideIdMap;
}

/**
 * Id maps for both books of a league game. `homeBook` translates the home
 * team's book (`homeBook.otherSide` is the away team's view of it), and
 * `awayBook` the away team's.
 */
export interface LeagueGameSideMaps {
  homeBook: BookSideMaps;
  awayBook: BookSideMaps;
}

/** An entry on a team's league roster record (`opponent_players`). */
export interface RosterRecordRow {
  id: string;
  opponent_team_id: string;
  linked_player_id: string | null;
  placeholder_game_id: string | null;
  is_fill_in: boolean;
}

/** What `buildLeagueGameSideMaps` needs to know about one league game. */
export interface LeagueGameSideMapInput {
  leagueGameId: string;
  homeTeamId: string;
  awayTeamId: string;
  homeGameId: string | null;
  awayGameId: string | null;
  /** The game's team rows: which team each belongs to and the roster record it records the other team through. */
  games: readonly { id: string; team_id: string; opponent_team_id: string | null }[];
  /** Each team's players: its roster and past memberships. */
  rosterPlayerIds: ReadonlyMap<string, ReadonlySet<string>>;
  /** This game's lineup rows on both team rows, guests included. */
  lineupRows: readonly { game_id: string; player_id: string }[];
  /** Entries of the two teams' roster records (other games' placeholders are ignored). */
  recordRows: readonly RosterRecordRow[];
}

function check<T>(result: { data: unknown; error: unknown }, what: string, leagueGameId: string): T | null {
  if (result.error) {
    const message = (result.error as { message?: string }).message ?? String(result.error);
    throw new Error(`${what} load failed league_game=${leagueGameId}: ${message}`);
  }
  return (result.data ?? null) as T | null;
}

function rows<T>(result: { data: unknown; error: unknown }, what: string, leagueGameId: string): T[] {
  return check<T[]>(result, what, leagueGameId) ?? [];
}

function addTo(map: Map<string, Set<string>>, key: string, value: string): void {
  const set = map.get(key) ?? new Set<string>();
  set.add(value);
  map.set(key, set);
}

/**
 * Read both teams' players (roster, past memberships and this game's lineup,
 * guests included) and both league roster records, and build the id maps for
 * each book. Each book records the other team through the roster record its
 * row points at (`games.opponent_team_id`); placeholders from other games are
 * left out. Throws on a query error.
 */
export async function loadSideIdMaps(db: SupabaseClient, leagueGameId: string): Promise<LeagueGameSideMaps> {
  const leagueGame = check<{
    home_team_id: string;
    away_team_id: string;
    home_game_id: string | null;
    away_game_id: string | null;
  }>(
    await db
      .from('league_games')
      .select('home_team_id, away_team_id, home_game_id, away_game_id')
      .eq('id', leagueGameId)
      .maybeSingle(),
    'league_games',
    leagueGameId,
  );
  if (!leagueGame) throw new Error(`league game not found league_game=${leagueGameId}`);

  const teamIds = [leagueGame.home_team_id, leagueGame.away_team_id];
  const gameIds = [leagueGame.home_game_id, leagueGame.away_game_id].filter((id): id is string => id !== null);

  const games = rows<{ id: string; team_id: string; opponent_team_id: string | null }>(
    await db.from('games').select('id, team_id, opponent_team_id').in('id', gameIds),
    'games',
    leagueGameId,
  );
  const recordIds = games.map((game) => game.opponent_team_id).filter((id): id is string => id !== null);

  const [players, memberships, lineups, records] = await Promise.all([
    db.from('players').select('id, team_id').in('team_id', teamIds),
    db.from('player_team_memberships').select('player_id, team_id').in('team_id', teamIds),
    db.from('game_lineups').select('game_id, player_id').in('game_id', gameIds),
    db
      .from('opponent_players')
      .select('id, opponent_team_id, linked_player_id, placeholder_game_id, is_fill_in')
      .in('opponent_team_id', recordIds),
  ]);

  const rosterPlayerIds = new Map<string, Set<string>>();
  for (const row of rows<{ id: string; team_id: string }>(players, 'players', leagueGameId)) {
    addTo(rosterPlayerIds, row.team_id, row.id);
  }
  for (const row of rows<{ player_id: string; team_id: string }>(memberships, 'player_team_memberships', leagueGameId)) {
    addTo(rosterPlayerIds, row.team_id, row.player_id);
  }

  return buildLeagueGameSideMaps({
    leagueGameId,
    homeTeamId: leagueGame.home_team_id,
    awayTeamId: leagueGame.away_team_id,
    homeGameId: leagueGame.home_game_id,
    awayGameId: leagueGame.away_game_id,
    games,
    rosterPlayerIds,
    lineupRows: rows<{ game_id: string; player_id: string }>(lineups, 'game_lineups', leagueGameId),
    recordRows: rows<RosterRecordRow>(records, 'opponent_players', leagueGameId),
  });
}

/**
 * Build the id maps for both books of one league game from rows already
 * read. A team's players are its roster, its past memberships and its row's
 * lineup for this game. Each book records the other team through the roster
 * record its row points at (`games.opponent_team_id`); placeholders from
 * other games are left out.
 */
export function buildLeagueGameSideMaps(input: LeagueGameSideMapInput): LeagueGameSideMaps {
  const { leagueGameId, homeGameId, awayGameId } = input;
  const recordByGame = new Map(input.games.map((game) => [game.id, game.opponent_team_id]));
  const teamByGame = new Map(input.games.map((game) => [game.id, game.team_id]));
  // The home book records the away team's players through the home row's record, and vice versa.
  const awayPlayersRecord = homeGameId ? recordByGame.get(homeGameId) ?? null : null;
  const homePlayersRecord = awayGameId ? recordByGame.get(awayGameId) ?? null : null;

  const teamPlayers = new Map<string, Set<string>>();
  for (const [teamId, ids] of input.rosterPlayerIds) teamPlayers.set(teamId, new Set(ids));
  for (const row of input.lineupRows) {
    if (row.game_id !== homeGameId && row.game_id !== awayGameId) continue;
    const teamId = teamByGame.get(row.game_id);
    if (teamId) addTo(teamPlayers, teamId, row.player_id);
  }

  const recordRows = input.recordRows.filter(
    (row) => row.placeholder_game_id === null || row.placeholder_game_id === leagueGameId,
  );

  const bookMaps = (scoringTeamId: string, otherPlayersRecord: string | null, scoringPlayersRecord: string | null) => {
    const reverseLinks = new Map<string, string>();
    for (const row of recordRows) {
      if (row.opponent_team_id !== scoringPlayersRecord) continue;
      if (row.linked_player_id && row.placeholder_game_id === null) reverseLinks.set(row.linked_player_id, row.id);
    }
    return buildSideIdMaps({
      scoringTeamPlayerIds: [...(teamPlayers.get(scoringTeamId) ?? [])],
      rosterRecordPlayers: recordRows
        .filter((row) => otherPlayersRecord !== null && row.opponent_team_id === otherPlayersRecord)
        .map((row) => ({
          id: row.id,
          linkedPlayerId: row.linked_player_id,
          isPlaceholder: row.placeholder_game_id !== null,
          isFillIn: row.is_fill_in,
        })),
      reverseLinks,
    });
  };

  return {
    homeBook: bookMaps(input.homeTeamId, awayPlayersRecord, homePlayersRecord),
    awayBook: bookMaps(input.awayTeamId, homePlayersRecord, awayPlayersRecord),
  };
}

