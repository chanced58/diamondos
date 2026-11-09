import type { SupabaseClient } from '@supabase/supabase-js';
import { translateBookForSide } from '@baseball/shared';
import { fetchAllEventsForGames } from '@/lib/stats/fetch-events';
import { loadSideIdMaps } from './side-maps';

/** The columns of a `games` row that decide whose scorebook it reads. */
export interface BookGameRef {
  id: string;
  league_game_id: string | null;
  result_source: string | null;
}

interface LeagueGameRow {
  id: string;
  home_game_id: string | null;
  away_game_id: string | null;
}

/**
 * The events behind a team's games, in the team's point of view. A normal
 * game reads its own log. A `result_source = 'paired'` game holds a result
 * written from the other team's book, so it reads that scoring row's events
 * translated for this team (`translateBookForSide`) and re-keyed to its own
 * game id. Hand-entered (`manual`) results have no book and contribute none.
 * `eventTypes` null reads every type. Throws on a query error.
 */
export async function loadEventsForTeamGames(
  db: SupabaseClient,
  teamId: string,
  games: readonly BookGameRef[],
  eventTypes: readonly string[] | null,
): Promise<Record<string, unknown>[]> {
  const paired = games.filter((game) => game.result_source === 'paired' && game.league_game_id);
  const ownIds = games
    .filter((game) => game.result_source !== 'paired' && game.result_source !== 'manual')
    .map((game) => game.id);
  const own = await fetchAllEventsForGames(db, ownIds, eventTypes);
  if (paired.length === 0) return own;

  const leagueGameIds = [...new Set(paired.map((game) => game.league_game_id as string))];
  const { data, error } = await db
    .from('league_games')
    .select('id, home_game_id, away_game_id')
    .in('id', leagueGameIds);
  if (error) throw new Error(`[paired-book] league_games load failed team=${teamId}: ${error.message}`);
  const leagueGames = new Map(((data ?? []) as LeagueGameRow[]).map((row) => [row.id, row]));

  const translated: Record<string, unknown>[] = [];
  for (const game of paired) {
    const leagueGame = leagueGames.get(game.league_game_id as string);
    if (!leagueGame) continue;
    const scoringGameId = leagueGame.home_game_id === game.id ? leagueGame.away_game_id : leagueGame.home_game_id;
    if (!scoringGameId) continue;

    const [events, maps] = await Promise.all([
      fetchAllEventsForGames(db, [scoringGameId], eventTypes),
      loadSideIdMaps(db, leagueGame.id),
    ]);
    const book = leagueGame.home_game_id === scoringGameId ? maps.homeBook : maps.awayBook;
    for (const event of translateBookForSide(events, book.otherSide)) {
      translated.push({ ...event, game_id: game.id });
    }
  }
  return [...own, ...translated];
}
