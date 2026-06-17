import type { SupabaseClient } from '@supabase/supabase-js';
import { reconcileScoreLogs } from '@baseball/shared';

interface PairedGameRow {
  id: string;
  status: string;
  scorer_side: string | null;
  paired_game_id: string | null;
}

async function loadEvents(db: SupabaseClient, gameId: string): Promise<Record<string, unknown>[]> {
  const { data, error } = await db
    .from('game_events')
    .select('*')
    .eq('game_id', gameId)
    .order('sequence_number');
  // Throw rather than silently reconciling from incomplete data — an empty
  // array on a real DB error would surface as phantom conflicts. The caller
  // wraps this in try/catch and aborts (no reconciliation row written).
  if (error) throw new Error(`game_events load failed for game ${gameId}: ${error.message}`);
  return (data ?? []) as Record<string, unknown>[];
}

/**
 * Compute (or refresh) the dual-scorekeeper reconciliation for a paired game.
 *
 * Called after a game is marked done. The reconciliation is only computed once
 * BOTH paired games are completed — that honors the rule that conflicts are
 * shown only when the game is done (for both logs). The home team's log is
 * canonical; conflicts record both values for the home coach to review.
 *
 * Comparison is at the line-score level (final score, per-half-inning runs,
 * team hits/errors), which is derived purely from each side's event stream and
 * needs no cross-roster identity matching. Per-player diffs are supported by
 * reconcileScoreLogs but require a player-identity bridge between the two
 * rosters that does not yet exist; they are intentionally omitted here.
 *
 * Best-effort: failures are logged and swallowed so they never block End Game.
 * Must run with a service-role client to read both teams' rows.
 *
 * @returns the reconciliation row id when computed, otherwise null.
 */
export async function runReconciliationForGame(
  db: SupabaseClient,
  gameId: string,
  computedBy?: string,
): Promise<string | null> {
  try {
    const { data: game, error: gameErr } = await db
      .from('games')
      .select('id, status, scorer_side, paired_game_id')
      .eq('id', gameId)
      .maybeSingle<PairedGameRow>();
    if (gameErr) throw new Error(`game load failed ${gameId}: ${gameErr.message}`);

    if (!game?.paired_game_id || !game.scorer_side) return null;

    const { data: mirror, error: mirrorErr } = await db
      .from('games')
      .select('id, status, scorer_side, paired_game_id')
      .eq('id', game.paired_game_id)
      .maybeSingle<PairedGameRow>();
    if (mirrorErr) throw new Error(`mirror load failed ${game.paired_game_id}: ${mirrorErr.message}`);

    if (!mirror) return null;

    // Both logs must be done before we surface conflicts.
    if (game.status !== 'completed' || mirror.status !== 'completed') return null;

    const homeGameId = game.scorer_side === 'home' ? game.id : mirror.id;
    const awayGameId = game.scorer_side === 'home' ? mirror.id : game.id;

    const [homeEvents, awayEvents] = await Promise.all([
      loadEvents(db, homeGameId),
      loadEvents(db, awayGameId),
    ]);

    const result = reconcileScoreLogs({ events: homeEvents }, { events: awayEvents });

    const { data: row, error } = await db
      .from('game_reconciliations')
      .upsert(
        {
          home_game_id: homeGameId,
          away_game_id: awayGameId,
          conflicts: result.conflicts,
          computed_at: new Date().toISOString(),
          computed_by: computedBy ?? null,
        },
        { onConflict: 'home_game_id' },
      )
      .select('id')
      .single();

    if (error) {
      console.error(`[dual-scorekeeper] reconciliation upsert failed home=${homeGameId}: ${error.message}`);
      return null;
    }
    return row?.id ?? null;
  } catch (err) {
    console.error(
      `[dual-scorekeeper] runReconciliationForGame threw game=${gameId}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}
