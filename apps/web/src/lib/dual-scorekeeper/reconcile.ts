import type { SupabaseClient } from '@supabase/supabase-js';
import {
  deriveBattingStats,
  derivePitchingStats,
  filterResetAndReverted,
  PLACEHOLDER_PREFIX,
  reconcileScoreLogs,
  translateBookForSide,
  type BattingStats,
  type GameEvent,
  type PitchingStats,
  type ReconciliationOverride,
  type ScoreConflict,
} from '@baseball/shared';
import { loadSideIdMaps, type BookSideMaps } from '@/lib/league-games/side-maps';
import { countUnsettledConflicts } from './unsettled';

interface PairedGameRow {
  id: string;
  status: string;
  scorer_side: string | null;
  paired_game_id: string | null;
  league_game_id: string | null;
}

interface BookPlayerStats {
  batting: Map<string, BattingStats>;
  pitching: Map<string, PitchingStats>;
}

/** Load a game's full event log in sequence order; throws on a real query error. */
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
 * Both teams' player lines from one league book, keyed by real player id:
 * the book is read once from each team's side and each read keeps only that
 * side's own players. Unmatched placeholders are left out — each book has its
 * own placeholder rows, so they can never line up across books; their plays
 * still show in the line-score diffs.
 */
function bookPlayerStats(events: Record<string, unknown>[], maps: BookSideMaps): BookPlayerStats {
  const active = filterResetAndReverted(events);
  const batting = new Map<string, BattingStats>();
  const pitching = new Map<string, PitchingStats>();
  for (const sideMap of [maps.scoringSide, maps.otherSide]) {
    const translated = translateBookForSide(active, sideMap) as unknown as GameEvent[];
    const sidePlayers = new Set(sideMap.toOurPlayer.values());
    const isSidePlayer = (id: string) => sidePlayers.has(id) && !id.startsWith(PLACEHOLDER_PREFIX);
    for (const [id, line] of deriveBattingStats(translated, [])) if (isSidePlayer(id)) batting.set(id, line);
    for (const [id, line] of derivePitchingStats(translated, [])) if (isSidePlayer(id)) pitching.set(id, line);
  }
  return { batting, pitching };
}

/**
 * For a league game, whether a recompute must reopen a reconciliation already
 * marked settled: a difference it found (a book changed, or a placeholder was
 * matched so a player's lines now line up) has had no decision yet — a
 * line-score conflict without an override, or a player none of whose
 * conflicts has one. Settled means every choice was made, so a new difference
 * on a player already decided keeps it settled. Other paired games keep their
 * settled mark as before.
 */
async function reopensSettled(
  db: SupabaseClient,
  homeGameId: string,
  conflicts: readonly ScoreConflict[],
): Promise<boolean> {
  const { data, error } = await db
    .from('game_reconciliations')
    .select('resolved_overrides, resolved_at')
    .eq('home_game_id', homeGameId)
    .maybeSingle();
  if (error) throw new Error(`reconciliation load failed home=${homeGameId}: ${error.message}`);
  if (!data?.resolved_at) return false;
  const overrides = Array.isArray(data.resolved_overrides) ? (data.resolved_overrides as ReconciliationOverride[]) : [];
  return countUnsettledConflicts(conflicts, overrides, null) > 0;
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
 * team hits/errors), derived purely from each side's event stream. For a
 * league game (`games.league_game_id`) it also diffs every player's batting
 * and pitching line: both books are translated into real player ids through
 * the league roster records (`loadSideIdMaps`). Other paired games have no
 * cross-roster identity bridge, so they stay at the line-score level.
 *
 * For a league game, a recompute that finds a difference with no decision yet
 * reopens a reconciliation already marked settled (`reopensSettled`), so it is
 * shown as still to settle; the overrides already made stay.
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
      .select('id, status, scorer_side, paired_game_id, league_game_id')
      .eq('id', gameId)
      .maybeSingle<PairedGameRow>();
    if (gameErr) throw new Error(`game load failed ${gameId}: ${gameErr.message}`);

    if (!game?.paired_game_id || !game.scorer_side) return null;

    const { data: mirror, error: mirrorErr } = await db
      .from('games')
      .select('id, status, scorer_side, paired_game_id, league_game_id')
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

    let homeStats: BookPlayerStats | undefined;
    let awayStats: BookPlayerStats | undefined;
    if (game.league_game_id) {
      const maps = await loadSideIdMaps(db, game.league_game_id);
      homeStats = bookPlayerStats(homeEvents, maps.homeBook);
      awayStats = bookPlayerStats(awayEvents, maps.awayBook);
    }

    const result = reconcileScoreLogs({ events: homeEvents, ...homeStats }, { events: awayEvents, ...awayStats });
    const reopen = game.league_game_id ? await reopensSettled(db, homeGameId, result.conflicts) : false;

    const { data: row, error } = await db
      .from('game_reconciliations')
      .upsert(
        {
          home_game_id: homeGameId,
          away_game_id: awayGameId,
          conflicts: result.conflicts,
          computed_at: new Date().toISOString(),
          computed_by: computedBy ?? null,
          ...(reopen ? { resolved_at: null, resolved_by: null } : {}),
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
