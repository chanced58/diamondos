/**
 * Shared event filtering utilities for game_reset and pitch_reverted handling.
 * Used by both per-game stats and season-level stats aggregation.
 */

/**
 * Reorder events so that any event with `insertAfterSequence` in its payload
 * is positioned immediately after the event with that sequence number.
 */
export function applyInsertionOrder(events: Record<string, unknown>[]): Record<string, unknown>[] {
  const normal: Record<string, unknown>[] = [];
  const insertions: Record<string, unknown>[] = [];
  for (const e of events) {
    const p = (e.payload ?? {}) as Record<string, unknown>;
    if (typeof p.insertAfterSequence === 'number') {
      insertions.push(e);
    } else {
      normal.push(e);
    }
  }
  if (insertions.length === 0) return events;

  const result = [...normal];
  insertions.sort((a, b) => (a.sequence_number as number) - (b.sequence_number as number));
  for (const ins of insertions) {
    const targetSeq = ((ins.payload ?? {}) as Record<string, unknown>).insertAfterSequence as number;
    if (targetSeq <= 0) {
      result.splice(0, 0, ins);
      continue;
    }
    let insertIdx = result.length;
    for (let i = result.length - 1; i >= 0; i--) {
      const r = result[i];
      const rPayload = (r.payload ?? {}) as Record<string, unknown>;
      const rTarget = typeof rPayload.insertAfterSequence === 'number' ? rPayload.insertAfterSequence : (r.sequence_number as number);
      if (rTarget <= targetSeq) {
        insertIdx = i + 1;
        break;
      }
    }
    result.splice(insertIdx, 0, ins);
  }
  return result;
}

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
  return applyInsertionOrder(result);
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
