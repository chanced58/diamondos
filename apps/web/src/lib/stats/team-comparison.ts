import type { SupabaseClient } from '@supabase/supabase-js';
import { getLeagueTeams, leagueMemberName } from '@baseball/database';
import {
  computeOpponentBatting,
  derivePitchingStats,
  deriveBattingStats,
  filterResetAndReverted,
  weAreHome,
  type GameEvent,
} from '@baseball/shared';
import { RELEVANT_EVENT_TYPES } from '@/app/(app)/compliance/constants';
import { buildLineupsByGameId } from './lineups';
import { fetchAllEventsForGames } from './fetch-events';
import { rowsOf } from './rows-of';

export interface TeamComparisonRow {
  teamId: string;
  teamName: string;
  /** A league opponent team (no DiamondOS account): seen from the games against it. */
  isOpponentTeam: boolean;
  gamesPlayed: number;
  wins: number;
  losses: number;
  ties: number;
  runsScored: number;
  runsAllowed: number;
  /** H / AB; 0 with no at-bats (the web table's convention). */
  teamAvg: number;
  /** Earned runs per 7 innings, like each pitcher's ERA; 0 with no outs. */
  teamEra: number;
  totalHits: number;
  totalStrikeouts: number;
}

type GameRow = {
  id: string;
  team_id: string;
  opponent_team_id: string | null;
  home_score: number | null;
  away_score: number | null;
  location_type: string;
  neutral_home_team: string | null;
};

type TeamRecord = { wins: number; losses: number; ties: number; runsScored: number; runsAllowed: number };

/**
 * Every league team side by side (the web Team Comparison page), from the
 * platform teams' completed games: record, runs, team AVG and ERA, hits and
 * strikeouts. Opponent teams are seen from the games platform teams played
 * against them. Sorted by winning percentage. Throws when any read fails.
 */
export async function loadTeamComparison(db: SupabaseClient, leagueId: string): Promise<TeamComparisonRow[]> {
  const leagueTeams = await getLeagueTeams(db as never, leagueId);
  if (leagueTeams.length === 0) return [];
  const platformMembers = leagueTeams.filter((t) => t.team_id);
  const opponentMembers = leagueTeams.filter((t) => t.opponent_team_id);
  const platformIds = platformMembers.map((t) => t.team_id as string);
  const opponentIds = opponentMembers.map((t) => t.opponent_team_id as string);

  let games: GameRow[] = [];
  if (platformIds.length > 0) {
    const result = await db
      .from('games')
      .select('id, team_id, opponent_team_id, home_score, away_score, location_type, neutral_home_team')
      .in('team_id', platformIds)
      .eq('status', 'completed');
    games = (rowsOf(result, 'games') ?? []) as GameRow[];
  }

  const [rawEvents, lineupsByGameId, players, oppPlayers] = await Promise.all([
    fetchAllEventsForGames(db, games.map((g) => g.id), RELEVANT_EVENT_TYPES as unknown as readonly string[]),
    buildLineupsByGameId(db, games, { strict: true }),
    platformIds.length > 0
      ? db.from('players').select('id, team_id, first_name, last_name').in('team_id', platformIds)
      : Promise.resolve({ data: [], error: null }),
    opponentIds.length > 0
      ? db.from('opponent_players').select('id, opponent_team_id, first_name, last_name').in('opponent_team_id', opponentIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const events = filterResetAndReverted(rawEvents);
  const allPlayers = rowsOf(players, 'players') ?? [];
  const allOppPlayers = rowsOf(oppPlayers, 'opponent_players') ?? [];

  const rows: TeamComparisonRow[] = [];

  for (const member of platformMembers) {
    const teamId = member.team_id as string;
    const teamGames = games.filter((g) => g.team_id === teamId);
    const gameIds = new Set(teamGames.map((g) => g.id));
    const teamEvents = events.filter((e) => gameIds.has(e.game_id as string)) as unknown as GameEvent[];
    const roster = allPlayers
      .filter((p) => p.team_id === teamId)
      .map((p) => ({ id: p.id as string, firstName: p.first_name as string, lastName: p.last_name as string }));
    const rosterIds = new Set(roster.map((p) => p.id));

    let hits = 0;
    let atBats = 0;
    for (const s of deriveBattingStats(teamEvents, roster, lineupsByGameId).values()) {
      if (!rosterIds.has(s.playerId)) continue;
      hits += s.hits;
      atBats += s.atBats;
    }
    const pitching = sumPitching(derivePitchingStats(teamEvents, roster).values(), rosterIds);

    rows.push({
      teamId,
      teamName: leagueMemberName(member),
      isOpponentTeam: false,
      gamesPlayed: teamGames.length,
      ...record(teamGames, true),
      ...rates(hits, atBats, pitching),
    });
  }

  for (const member of opponentMembers) {
    const opponentTeamId = member.opponent_team_id as string;
    const oppGames = games.filter((g) => g.opponent_team_id === opponentTeamId);
    const gameIds = new Set(oppGames.map((g) => g.id));
    const oppEvents = events.filter((e) => gameIds.has(e.game_id as string));
    const roster = allOppPlayers.filter((p) => p.opponent_team_id === opponentTeamId);
    const rosterIds = new Set(roster.map((p) => p.id as string));

    let hits = 0;
    let atBats = 0;
    for (const s of computeOpponentBatting(oppEvents, new Map(roster.map((p) => [p.id as string, `${p.first_name} ${p.last_name}`])))) {
      hits += s.h;
      atBats += s.ab;
    }
    const pitching = sumPitching(
      derivePitchingStats(
        oppEvents as unknown as GameEvent[],
        roster.map((p) => ({ id: p.id as string, firstName: p.first_name as string, lastName: p.last_name as string })),
      ).values(),
      rosterIds,
    );

    rows.push({
      teamId: opponentTeamId,
      teamName: leagueMemberName(member),
      isOpponentTeam: true,
      gamesPlayed: oppGames.length,
      ...record(oppGames, false),
      ...rates(hits, atBats, pitching),
    });
  }

  return rows.sort((a, b) => winPct(b) - winPct(a));
}

/** W-L-T and runs from the games' scores, for the platform team (`ours`) or its opponent. */
function record(games: GameRow[], ours: boolean): TeamRecord {
  const totals: TeamRecord = { wins: 0, losses: 0, ties: 0, runsScored: 0, runsAllowed: 0 };
  for (const game of games) {
    const platformIsHome = weAreHome(game.location_type, game.neutral_home_team);
    const platformRuns = (platformIsHome ? game.home_score : game.away_score) ?? 0;
    const otherRuns = (platformIsHome ? game.away_score : game.home_score) ?? 0;
    const scored = ours ? platformRuns : otherRuns;
    const allowed = ours ? otherRuns : platformRuns;
    totals.runsScored += scored;
    totals.runsAllowed += allowed;
    if (scored > allowed) totals.wins++;
    else if (allowed > scored) totals.losses++;
    else totals.ties++;
  }
  return totals;
}

function sumPitching(
  stats: Iterable<{ playerId: string; inningsPitchedOuts: number; earnedRunsAllowed: number; strikeouts: number }>,
  rosterIds: Set<string>,
) {
  const totals = { outs: 0, earnedRuns: 0, strikeouts: 0 };
  for (const s of stats) {
    if (!rosterIds.has(s.playerId)) continue;
    totals.outs += s.inningsPitchedOuts;
    totals.earnedRuns += s.earnedRunsAllowed;
    totals.strikeouts += s.strikeouts;
  }
  return totals;
}

function rates(hits: number, atBats: number, pitching: { outs: number; earnedRuns: number; strikeouts: number }) {
  const innings = pitching.outs / 3;
  return {
    teamAvg: atBats > 0 ? hits / atBats : 0,
    teamEra: innings > 0 ? (pitching.earnedRuns * 7) / innings : 0,
    totalHits: hits,
    totalStrikeouts: pitching.strikeouts,
  };
}

/** Winning percentage; 0 with no games. */
export function winPct(row: Pick<TeamComparisonRow, 'wins' | 'losses' | 'ties'>): number {
  const total = row.wins + row.losses + row.ties;
  return total > 0 ? row.wins / total : 0;
}
