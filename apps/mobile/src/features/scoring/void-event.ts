import { EventType, type GameEvent, type EventVoidedPayload } from '@baseball/shared';

export interface VoidEventDeps {
  /** Appends a single EVENT_VOIDED event. Never mutates or removes a row —
   * game_events is append-only. */
  recordVoid: (payload: EventVoidedPayload) => Promise<string>;
}

/**
 * Voids `eventId` by appending EVENT_VOIDED event(s) that target it — never
 * updates or deletes the original row, per the append-only `game_events`
 * invariant. Cascades to any linked BASERUNNER_OUT / BASERUNNER_ADVANCE
 * events (`relatedEventId === eventId`) so voiding a parent play (e.g. a
 * hit) also retires the runner outcomes it carried, exactly as `handleUndo`
 * has always done for the most-recent event. This is the same cascade,
 * extracted to take an explicit id so any past play — not just the most
 * recent one — can be voided.
 *
 * No-op when `eventId` is already voided, doesn't exist in `events`, or is
 * itself a correction event (EVENT_VOIDED / PITCH_REVERTED) — those aren't
 * "plays" and have nothing sensible to cascade to.
 *
 * `events` should be the full raw (unfiltered) event stream for the game,
 * not a trailing window: a coach can void a play from many innings back, so
 * the target and its linked children may be far from the tail of the log.
 */
export async function voidEvent(
  eventId: string,
  events: GameEvent[],
  deps: VoidEventDeps,
): Promise<void> {
  const voidedIds = new Set<string>();
  for (const e of events) {
    if (e.eventType !== EventType.EVENT_VOIDED) continue;
    const p = e.payload as Partial<EventVoidedPayload>;
    if (p.voidedEventId) voidedIds.add(p.voidedEventId);
  }
  if (voidedIds.has(eventId)) return;

  const target = events.find((e) => e.id === eventId);
  if (!target) return;
  if (target.eventType === EventType.EVENT_VOIDED || target.eventType === EventType.PITCH_REVERTED) {
    return;
  }

  // Cascade: any linked outcome events (BASERUNNER_OUT / BASERUNNER_ADVANCE
  // with relatedEventId === target.id) get voided alongside the parent so a
  // single void retires the whole multi-event play.
  const linked = events.filter((other) => {
    if (other.id === target.id) return false;
    if (voidedIds.has(other.id)) return false;
    if (
      other.eventType !== EventType.BASERUNNER_OUT &&
      other.eventType !== EventType.BASERUNNER_ADVANCE
    ) {
      return false;
    }
    const p = other.payload as { relatedEventId?: string };
    return p.relatedEventId === target.id;
  });

  for (const child of linked) {
    await deps.recordVoid({
      voidedEventId: child.id,
      voidedSequenceNumber: child.sequenceNumber,
    });
  }

  await deps.recordVoid({
    voidedEventId: target.id,
    voidedSequenceNumber: target.sequenceNumber,
  });
}
