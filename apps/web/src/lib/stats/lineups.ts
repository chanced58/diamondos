import type { SupabaseClient } from '@supabase/supabase-js';
import { weAreHome } from '@baseball/shared';
import type { BattingLineupContext } from '@baseball/shared';

type GameLike = {
  id: string;
  location_type: string;
  neutral_home_team: string | null;
};

/**
 * Build the per-game lineup context used by deriveBattingStats to recover
 * stub batter IDs during our team's half-inning. Reads game_lineups for the
 * given games, validates each row's player_id and batting_order, and pairs
 * the lineup with the home/away inference from each game's location.
 *
 * On a Supabase read failure this logs the error and returns an empty Map —
 * batting stats still derive (without stub recovery) rather than 500ing the
 * page. Callers should treat this context as best-effort.
 */
export async function buildLineupsByGameId(
  db: SupabaseClient,
  games: GameLike[],
): Promise<Map<string, BattingLineupContext>> {
  const lineupsByGameId = new Map<string, BattingLineupContext>();
  if (games.length === 0) return lineupsByGameId;

  const gameIds = games.map((g) => g.id);
  const { data: lineupRows, error } = await db
    .from('game_lineups')
    .select('game_id, player_id, batting_order')
    .in('game_id', gameIds);

  if (error) {
    console.error(
      `[stats/lineups] game_lineups query failed for ${gameIds.length} game(s): ${error.message}`,
    );
    return lineupsByGameId;
  }

  const byGame = new Map<string, { playerId: string; battingOrder: number }[]>();
  for (const row of (lineupRows ?? []) as Array<{
    game_id: string;
    player_id: string | null;
    batting_order: number | null;
  }>) {
    if (!row.player_id || typeof row.batting_order !== 'number' || row.batting_order <= 0) continue;
    const list = byGame.get(row.game_id) ?? [];
    list.push({ playerId: row.player_id, battingOrder: row.batting_order });
    byGame.set(row.game_id, list);
  }

  for (const g of games) {
    const ourLineup = byGame.get(g.id) ?? [];
    if (ourLineup.length === 0) continue;
    lineupsByGameId.set(g.id, {
      ourLineup,
      isHome: weAreHome(g.location_type, g.neutral_home_team),
    });
  }

  return lineupsByGameId;
}
