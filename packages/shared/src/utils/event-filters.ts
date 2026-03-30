/**
 * Shared event filtering utilities for game_reset and pitch_reverted handling.
 * Used by both per-game stats and season-level stats aggregation.
 */

/**
 * Apply pitch_reverted events: each pitch_reverted trims the event list
 * back to sequence numbers <= revertToSequenceNumber.
 */
export function applyPitchReverted(events: Record<string, unknown>[]): Record<string, unknown>[] {
  const result: Record<string, unknown>[] = [];
  for (const event of events) {
    if ((event.event_type as string) === 'pitch_reverted') {
      const payload = (event.payload ?? {}) as Record<string, unknown>;
      const keepUntilSeq = payload.revertToSequenceNumber as number;
      result.splice(0, result.length, ...result.filter((e) => (e.sequence_number as number) <= keepUntilSeq));
    } else {
      result.push(event);
    }
  }
  return result;
}

/**
 * Filter events per game: for each game, find the last game_reset and only
 * keep events after it, then apply pitch_reverted filtering.
 * Events must already be sorted by (game_id, sequence_number).
 */
export function filterResetAndReverted(events: Record<string, unknown>[]): Record<string, unknown>[] {
  const byGame = new Map<string, Record<string, unknown>[]>();
  for (const e of events) {
    const gid = e.game_id as string;
    if (!byGame.has(gid)) byGame.set(gid, []);
    byGame.get(gid)!.push(e);
  }

  const result: Record<string, unknown>[] = [];
  for (const gameEvents of byGame.values()) {
    const lastResetIdx = gameEvents.map((e) => e.event_type).lastIndexOf('game_reset');
    const active = lastResetIdx === -1 ? gameEvents : gameEvents.slice(lastResetIdx + 1);
    result.push(...applyPitchReverted(active));
  }
  return result;
}
