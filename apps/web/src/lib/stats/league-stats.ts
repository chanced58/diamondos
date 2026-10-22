import type { SupabaseClient } from '@supabase/supabase-js';
import { getLeagueOpponentTeamIds, getLeagueTeamIds } from '@baseball/database';
import {
  computeOpponentBatting,
  derivePitchingStats,
  deriveBattingStats,
  filterResetAndReverted,
  type BattingStats,
  type GameEvent,
  type OppBattingRow,
  type PitchingStats,
} from '@baseball/shared';
import { RELEVANT_EVENT_TYPES } from '@/app/(app)/compliance/constants';
import { buildLineupsByGameId } from './lineups';
import { fetchAllEventsForGames } from './fetch-events';
import { rowsOf } from './rows-of';

export interface LeaguePlayerStats {
  /** Platform (DiamondOS) teams in the league. */
  teamCount: number;
  /** Their completed and in-progress games. */
  gameCount: number;
  /** Every league player, "Last (Team)" — opponent-team players included. */
  pitching: PitchingStats[];
  batting: BattingStats[];
}

const EVENT_TYPES = RELEVANT_EVENT_TYPES as unknown as readonly string[];

/**
 * Player stats across a league (the web League Stats page): every platform
 * team's players from their completed and in-progress games, plus the
 * league's opponent-team players from games against them. Names carry the
 * team, since leaders come from every team. Throws when any read fails rather
 * than show part of a league.
 */
export async function loadLeaguePlayerStats(db: SupabaseClient, leagueId: string): Promise<LeaguePlayerStats> {
  const teamIds = await getLeagueTeamIds(db as never, leagueId);
  if (teamIds.length === 0) return { teamCount: 0, gameCount: 0, pitching: [], batting: [] };

  // In-progress games too, so live player stats update during games.
  const games = rowsOf(
    await db
      .from('games')
      .select('id, team_id, location_type, neutral_home_team')
      .in('team_id', teamIds)
      .in('status', ['completed', 'in_progress']),
    'games',
  ) ?? [];
  const gameIds = games.map((g) => g.id as string);

  const [rawEvents, lineupsByGameId, players, teams] = await Promise.all([
    fetchAllEventsForGames(db, gameIds, EVENT_TYPES),
    buildLineupsByGameId(db, games as { id: string; location_type: string; neutral_home_team: string | null }[], { strict: true }),
    db.from('players').select('id, team_id, first_name, last_name').in('team_id', teamIds),
    db.from('teams').select('id, name').in('id', teamIds),
  ]);
  const teamNames = new Map((rowsOf(teams, 'teams') ?? []).map((t) => [t.id as string, t.name as string]));
  const playerList = (rowsOf(players, 'players') ?? []).map((p) => ({
    id: p.id as string,
    firstName: p.first_name as string,
    lastName: `${p.last_name} (${teamNames.get(p.team_id) ?? 'Unknown'})`,
  }));
  const playerIds = new Set(playerList.map((p) => p.id));

  const events = filterResetAndReverted(rawEvents) as unknown as GameEvent[];
  const pitching = Array.from(derivePitchingStats(events, playerList).values()).filter((s) => playerIds.has(s.playerId));
  const batting = Array.from(deriveBattingStats(events, playerList, lineupsByGameId).values()).filter((s) =>
    playerIds.has(s.playerId),
  );

  const opponents = await loadLeagueOpponentStats(db, leagueId, gameIds, rawEvents);
  pitching.push(...opponents.pitching);
  batting.push(...opponents.batting);

  return {
    teamCount: teamIds.length,
    gameCount: gameIds.length,
    pitching: pitching.sort((a, b) => b.inningsPitchedOuts - a.inningsPitchedOuts),
    batting: batting.sort((a, b) => b.plateAppearances - a.plateAppearances),
  };
}

/** The league's opponent-team players, from every game against them. */
async function loadLeagueOpponentStats(
  db: SupabaseClient,
  leagueId: string,
  platformGameIds: string[],
  platformEvents: Record<string, unknown>[],
): Promise<{ pitching: PitchingStats[]; batting: BattingStats[] }> {
  const opponentTeamIds = await getLeagueOpponentTeamIds(db as never, leagueId);
  if (opponentTeamIds.length === 0) return { pitching: [], batting: [] };

  const [oppGames, oppPlayersResult, oppTeamsResult] = await Promise.all([
    db
      .from('games')
      .select('id')
      .in('opponent_team_id', opponentTeamIds)
      .in('status', ['completed', 'in_progress']),
    db.from('opponent_players').select('id, opponent_team_id, first_name, last_name').in('opponent_team_id', opponentTeamIds),
    db.from('opponent_teams').select('id, name').in('id', opponentTeamIds),
  ]);

  // Games against league opponents not already read with the platform teams'.
  const known = new Set(platformGameIds);
  const missingGameIds = (rowsOf(oppGames, 'opponent games') ?? []).map((g) => g.id as string).filter((id) => !known.has(id));
  const events = [...platformEvents, ...(await fetchAllEventsForGames(db, missingGameIds, EVENT_TYPES))];
  const filtered = filterResetAndReverted(events);

  const oppPlayers = rowsOf(oppPlayersResult, 'opponent_players') ?? [];
  const teamNames = new Map((rowsOf(oppTeamsResult, 'opponent_teams') ?? []).map((t) => [t.id as string, t.name as string]));
  const teamOf = new Map(oppPlayers.map((p) => [p.id as string, p.opponent_team_id as string]));
  const teamLabel = (playerId: string) => teamNames.get(teamOf.get(playerId) ?? '') ?? 'Unknown';

  // The events include platform games against non-league opponents too; only
  // the league's opponent players count, for batting as for pitching.
  const oppPlayerIds = new Set(oppPlayers.map((p) => p.id as string));
  const batting = computeOpponentBatting(
    filtered,
    new Map(oppPlayers.map((p) => [p.id as string, `${p.first_name} ${p.last_name}`])),
  )
    .filter((row) => oppPlayerIds.has(row.playerId))
    .map((row) => opponentBattingAsStats(row, teamLabel(row.playerId)));

  const pitching = Array.from(
    derivePitchingStats(
      filtered as unknown as GameEvent[],
      oppPlayers.map((p) => ({ id: p.id, firstName: p.first_name, lastName: `${p.last_name} (${teamLabel(p.id)})` })),
    ).values(),
  ).filter((s) => oppPlayerIds.has(s.playerId) && s.totalPitches > 0);

  return { pitching, batting };
}

/** An opponent's batting line in the BattingStats shape; what isn't tracked for opponents stays blank. */
function opponentBattingAsStats(row: OppBattingRow, teamName: string): BattingStats {
  return {
    playerId: row.playerId,
    playerName: `${row.playerName} (${teamName})`,
    gamesAppeared: 0,
    plateAppearances: row.pa,
    atBats: row.ab,
    runs: row.r,
    hits: row.h,
    doubles: row.doubles,
    triples: row.triples,
    homeRuns: row.hr,
    rbi: row.rbi,
    walks: row.bb,
    strikeouts: row.k,
    hitByPitch: row.hbp,
    sacrificeFlies: row.sf,
    sacrificeHits: row.sh,
    avg: row.avg,
    obp: row.obp,
    slg: row.slg,
    ops: row.ops,
    iso: (row.slg || 0) - (row.avg || 0),
    babip: NaN,
    kPct: row.pa > 0 ? row.k / row.pa : 0,
    bbPct: row.pa > 0 ? row.bb / row.pa : 0,
    woba: NaN,
    battedBalls: 0,
    hardHitBalls: 0,
    hardHitPct: NaN,
    qab: 0,
    qabPct: NaN,
  };
}
