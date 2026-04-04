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
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const etype = event.event_type as string;
    if (etype === 'pitch_reverted') {
      const payload = (event.payload ?? {}) as Record<string, unknown>;
      const keepUntilSeq = payload.revertToSequenceNumber as number;
      // Rebuild from original events up to keepUntilSeq, then re-process
      // remaining events so voided markers after the revert point are re-applied
      const kept = events.slice(0, i).filter(
        (e) => (e.event_type as string) !== 'pitch_reverted'
          && (e.event_type as string) !== 'event_voided'
          && (e.sequence_number as number) <= keepUntilSeq,
      );
      result.splice(0, result.length, ...kept);
    } else if (etype === 'event_voided') {
      const payload = (event.payload ?? {}) as Record<string, unknown>;
      const voidedId = payload.voidedEventId as string;
      const idx = result.findIndex((e) => (e.id as string) === voidedId);
      if (idx !== -1) result.splice(idx, 1);
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
