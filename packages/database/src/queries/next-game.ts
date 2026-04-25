import { GameStatus, type Game, findNextGame } from '@baseball/shared';
import type { TypedSupabaseClient } from '../client';

/**
 * Loads a team's candidate future games and returns the next one to prepare
 * for. Centralizes the filter — status, from-date, sort — so RSCs and the
 * prep generator share the same logic.
 *
 * Returns null when the team has no upcoming scheduled or postponed game.
 */
export async function getNextGameForTeam(
  supabase: TypedSupabaseClient,
  teamId: string,
  fromDate: Date = new Date(),
): Promise<Game | null> {
  const fromIso = fromDate.toISOString();
  const { data, error } = await supabase
    .from('games')
    .select('*')
    .eq('team_id', teamId)
    .in('status', [GameStatus.SCHEDULED, GameStatus.POSTPONED])
    // TBD-opponent games (opponent_name IS NULL) are excluded from prep — there
    // is nothing to prepare for until the bracket fills in.
    .not('opponent_name', 'is', null)
    .gt('scheduled_at', fromIso)
    .order('scheduled_at', { ascending: true })
    .limit(10);
  if (error) throw error;
  const rows = (data ?? []) as unknown as RawGameRow[];
  const games = rows.map(mapGame);
  return findNextGame(games, fromDate);
}

interface RawGameRow {
  id: string;
  season_id: string;
  team_id: string;
  opponent_name: string | null;
  opponent_team_id: string | null;
  scheduled_at: string;
  location_type: string;
  neutral_home_team: string | null;
  venue_name: string | null;
  status: string;
  home_score: number;
  away_score: number;
  current_inning: number;
  is_top_of_inning: boolean;
  outs: number;
  notes: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

function mapGame(row: RawGameRow): Game {
  return {
    id: row.id,
    seasonId: row.season_id,
    teamId: row.team_id,
    opponentName: row.opponent_name,
    opponentTeamId: row.opponent_team_id ?? undefined,
    scheduledAt: row.scheduled_at,
    locationType: row.location_type as Game['locationType'],
    neutralHomeTeam: row.neutral_home_team,
    venueName: row.venue_name ?? undefined,
    status: row.status as Game['status'],
    homeScore: row.home_score,
    awayScore: row.away_score,
    currentInning: row.current_inning,
    isTopOfInning: row.is_top_of_inning,
    outs: row.outs,
    notes: row.notes ?? undefined,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
