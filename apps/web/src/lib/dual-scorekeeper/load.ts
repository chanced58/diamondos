import type { SupabaseClient } from '@supabase/supabase-js';
import { conflictPlayerId, type ReconciliationOverride, type ScoreConflict } from '@baseball/shared';
import { countUnsettledConflicts } from './unsettled';
import { authorizeReconciliationSettler } from '@/lib/services/games/resolve-reconciliation-conflict';

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
  /** True when the viewer may settle the differences (`authorizeReconciliationSettler`). */
  canSettle: boolean;
  /** Differences still to settle (none once resolved); see `countUnsettledConflicts`. */
  unsettledCount: number;
  /** Names of the players the conflicts are about, by player id (missing when unreadable). */
  playerNames: Record<string, string>;
}

/** Names for the conflicts' players; empty (labels fall back to short ids) when the read fails. */
async function loadConflictPlayerNames(
  db: SupabaseClient,
  conflicts: readonly ScoreConflict[],
  reconciliationId: string,
): Promise<Record<string, string>> {
  const ids = [...new Set(conflicts.map(conflictPlayerId).filter((id): id is string => id !== null))];
  if (ids.length === 0) return {};
  const { data, error } = await db.from('players').select('id, first_name, last_name').in('id', ids);
  if (error) {
    console.error(`[dual-scorekeeper] player-name lookup failed recon=${reconciliationId}: ${error.message}`);
    return {};
  }
  const names: Record<string, string> = {};
  for (const row of (data ?? []) as { id: string; first_name: string | null; last_name: string | null }[]) {
    const name = `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim();
    if (name) names[row.id] = name;
  }
  return names;
}

/**
 * Load the dual-scorekeeper reconciliation that involves `gameId` (as either
 * the home or away side), if one exists. Returns null when the game is not
 * paired or has not been reconciled yet. `viewerUserId` is who is looking,
 * for `canSettle`.
 */
export async function loadReconciliationForGame(
  db: SupabaseClient,
  gameId: string,
  viewerUserId: string,
): Promise<ReconciliationView | null> {
  const { data: recon, error: reconErr } = await db
    .from('game_reconciliations')
    .select('id, home_game_id, away_game_id, conflicts, resolved_overrides, resolved_at')
    .or(`home_game_id.eq.${gameId},away_game_id.eq.${gameId}`)
    .maybeSingle();

  // Distinguish a real query failure from "no reconciliation yet" — only the
  // latter should fall through to the no-panel state.
  if (reconErr) {
    console.error(`[dual-scorekeeper] reconciliation lookup failed game=${gameId}: ${reconErr.message}`);
    return null;
  }
  if (!recon) return null;

  const conflicts = (recon.conflicts ?? []) as ScoreConflict[];
  const [{ data: teams, error: teamsErr }, settler, playerNames] = await Promise.all([
    db.from('games').select('id, teams(name)').in('id', [recon.home_game_id, recon.away_game_id]),
    authorizeReconciliationSettler(db, viewerUserId, recon.home_game_id as string),
    loadConflictPlayerNames(db, conflicts, recon.id as string),
  ]);
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
    conflicts,
    overrides: (recon.resolved_overrides ?? []) as ReconciliationOverride[],
    homeTeamLabel: nameByGame.get(recon.home_game_id as string) ?? 'Home',
    awayTeamLabel: nameByGame.get(recon.away_game_id as string) ?? 'Away',
    viewerOnHomeSide: recon.home_game_id === gameId,
    canSettle: settler.ok,
    unsettledCount: countUnsettledConflicts(
      recon.conflicts as ScoreConflict[] | null,
      recon.resolved_overrides as ReconciliationOverride[] | null,
      recon.resolved_at as string | null,
    ),
    playerNames,
  };
}
