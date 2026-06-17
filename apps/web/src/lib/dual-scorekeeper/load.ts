import type { SupabaseClient } from '@supabase/supabase-js';
import type { ScoreConflict } from '@baseball/shared';
import type { ReconciliationOverride } from '@/app/(app)/games/[gameId]/ReconciliationPanel';

export interface ReconciliationView {
  reconciliationId: string;
  homeGameId: string;
  awayGameId: string;
  conflicts: ScoreConflict[];
  overrides: ReconciliationOverride[];
  homeTeamLabel: string;
  awayTeamLabel: string;
  /** True when the supplied gameId is the home (canonical) game. */
  viewerOnHomeSide: boolean;
}

/**
 * Load the dual-scorekeeper reconciliation that involves `gameId` (as either
 * the home or away side), if one exists. Returns null when the game is not
 * paired or has not been reconciled yet.
 */
export async function loadReconciliationForGame(
  db: SupabaseClient,
  gameId: string,
): Promise<ReconciliationView | null> {
  const { data: recon, error: reconErr } = await db
    .from('game_reconciliations')
    .select('id, home_game_id, away_game_id, conflicts, resolved_overrides')
    .or(`home_game_id.eq.${gameId},away_game_id.eq.${gameId}`)
    .maybeSingle();

  // Distinguish a real query failure from "no reconciliation yet" — only the
  // latter should fall through to the no-panel state.
  if (reconErr) {
    console.error(`[dual-scorekeeper] reconciliation lookup failed game=${gameId}: ${reconErr.message}`);
    return null;
  }
  if (!recon) return null;

  const { data: teams, error: teamsErr } = await db
    .from('games')
    .select('id, teams(name)')
    .in('id', [recon.home_game_id, recon.away_game_id]);
  if (teamsErr) {
    console.error(
      `[dual-scorekeeper] team-label lookup failed recon=${recon.id} game=${gameId}: ${teamsErr.message}`,
    );
  }

  const nameByGame = new Map<string, string>();
  for (const row of teams ?? []) {
    const t = Array.isArray(row.teams) ? row.teams[0] : row.teams;
    nameByGame.set(row.id as string, (t as { name?: string } | null)?.name ?? 'Team');
  }

  return {
    reconciliationId: recon.id as string,
    homeGameId: recon.home_game_id as string,
    awayGameId: recon.away_game_id as string,
    conflicts: (recon.conflicts ?? []) as ScoreConflict[],
    overrides: (recon.resolved_overrides ?? []) as ReconciliationOverride[],
    homeTeamLabel: nameByGame.get(recon.home_game_id as string) ?? 'Home',
    awayTeamLabel: nameByGame.get(recon.away_game_id as string) ?? 'Away',
    viewerOnHomeSide: recon.home_game_id === gameId,
  };
}
