import type { SupabaseClient } from '@supabase/supabase-js';
import {
  deriveBattingStats,
  derivePitchingStats,
  filterResetAndReverted,
} from '@baseball/shared';
import type { BattingStats, GameEvent, PitchingStats } from '@baseball/shared';
import { RELEVANT_EVENT_TYPES } from '@/app/(app)/compliance/constants';
import { buildLineupsByGameId } from '@/lib/stats/lineups';
import { fetchAllEventsForGames } from '@/lib/stats/fetch-events';

export interface TournamentPlayerStats {
  /** Completed or in-progress tournament games the stats were derived from. */
  scoredGameCount: number;
  batting: BattingStats[];
  pitching: PitchingStats[];
}

/**
 * Player batting and pitching lines for one team's games in one tournament.
 *
 * Games are scoped by `tournament_id` and the tournament's own season, so a
 * team that plays the tournament on its existing roster never mixes in its
 * regular-season games. Only the team's own players are returned: opponent
 * IDs that leak through the derivers' pitcher fallback are dropped, matching
 * the compliance stats page.
 */
export async function loadTournamentPlayerStats(
  db: SupabaseClient,
  scope: { tournamentId: string; teamId: string; seasonId: string },
): Promise<TournamentPlayerStats> {
  const { data: games, error: gamesError } = await db
    .from('games')
    .select('id, location_type, neutral_home_team')
    .eq('tournament_id', scope.tournamentId)
    .eq('team_id', scope.teamId)
    .eq('season_id', scope.seasonId)
    .in('status', ['completed', 'in_progress']);
  if (gamesError) {
    throw new Error(
      `[tournament-player-stats] games query failed for tournament ${scope.tournamentId}: ${gamesError.message}`,
    );
  }

  const scoredGames = (games ?? []) as { id: string; location_type: string; neutral_home_team: string | null }[];
  const empty: TournamentPlayerStats = { scoredGameCount: scoredGames.length, batting: [], pitching: [] };
  if (scoredGames.length === 0) return empty;

  // Fetch ALL players (not just active) so deactivated players who appeared
  // in a tournament game still resolve their names.
  const { data: players, error: playersError } = await db
    .from('players')
    .select('id, first_name, last_name')
    .eq('team_id', scope.teamId);
  if (playersError) {
    throw new Error(
      `[tournament-player-stats] players query failed for team ${scope.teamId}: ${playersError.message}`,
    );
  }
  const playerList = ((players ?? []) as { id: string; first_name: string; last_name: string }[]).map((p) => ({
    id: p.id,
    firstName: p.first_name,
    lastName: p.last_name,
  }));
  if (playerList.length === 0) return empty;

  const events = await fetchAllEventsForGames(
    db,
    scoredGames.map((g) => g.id),
    RELEVANT_EVENT_TYPES as unknown as readonly string[],
  );
  if (events.length === 0) return empty;

  // Strip reverted/reset events so undone pitches don't leak into totals.
  const derivableEvents = filterResetAndReverted(events) as unknown as GameEvent[];
  const lineupsByGameId = await buildLineupsByGameId(db, scoredGames);
  const teamPlayerIds = new Set(playerList.map((p) => p.id));

  const batting = Array.from(deriveBattingStats(derivableEvents, playerList, lineupsByGameId).values())
    .filter((s) => teamPlayerIds.has(s.playerId) && s.plateAppearances > 0)
    .sort((a, b) => b.plateAppearances - a.plateAppearances || a.playerName.localeCompare(b.playerName));

  const pitching = Array.from(derivePitchingStats(derivableEvents, playerList).values())
    .filter((s) => teamPlayerIds.has(s.playerId) && s.totalPitches > 0)
    .sort((a, b) => b.inningsPitchedOuts - a.inningsPitchedOuts || a.playerName.localeCompare(b.playerName));

  return { scoredGameCount: scoredGames.length, batting, pitching };
}
