import type { LeagueScoringSettings } from '../types/league-scoring-settings';
import { EventType, SubstitutionType, type GameEvent } from '../types/game-event';

export interface ActiveBattingSlot {
  playerId: string;
  /** Stable identity for this lineup slot, even when earlier slots are removed. */
  battingOrder: number;
}

export function lineupExtensionError(input: { activeCount: number; maxBatters: number; maxRecordedPosition: number }): string | null {
  if (input.activeCount >= input.maxBatters) return `The order is full at ${input.maxBatters} batters.`;
  if (input.maxRecordedPosition >= 30) return 'The order cannot exceed 30 batting slots.';
  return null;
}

/** Projected extension rows belong to their events, even after a void or undo. */
export function initialBattingOrderSlots<T extends ActiveBattingSlot>(
  slots: readonly T[],
  events: readonly (Pick<GameEvent, 'eventType' | 'payload'> & Partial<Pick<GameEvent, 'id'>>)[],
  options: { forOpponent?: boolean } = {},
): T[] {
  const cancelledBeforeSync = new Set(events.flatMap((event) => {
    const payload = (event.payload ?? {}) as Record<string, unknown>;
    return event.eventType === EventType.EVENT_VOIDED && payload.cancelledBeforeSync === true
      ? [String(payload.voidedEventId)] : [];
  }));
  const projected = new Set(events.flatMap((event) => {
    const payload = (event.payload ?? {}) as Record<string, unknown>;
    if (event.eventType !== EventType.SUBSTITUTION || payload.substitutionType !== SubstitutionType.LINEUP_EXTENSION
      || ('id' in event && cancelledBeforeSync.has(String(event.id)))
      || Boolean(payload.isOpponentSubstitution) !== Boolean(options.forOpponent)) return [];
    return [`${payload.inPlayerId}:${payload.battingOrderPosition}`];
  }));
  return slots.filter((slot) => !projected.has(`${slot.playerId}:${slot.battingOrder}`));
}

export interface ActiveBattingOrderState {
  slots: ActiveBattingSlot[];
  nextBatterId: string | null;
  nextBattingOrderPosition: number | null;
}

export interface ActiveBattingOrderOptions {
  /** True when this lineup is the batting side during the top half. */
  batsOnTop: boolean;
  /** True for the opposing lineup; untagged legacy subs target our team. */
  forOpponent?: boolean;
}

export interface ActiveBattingOrderReducer {
  apply(event: GameEvent): void;
  snapshot(): ActiveBattingOrderState;
}

const PA_COMPLETION_EVENTS = new Set<string>([
  EventType.HIT,
  EventType.OUT,
  EventType.WALK,
  EventType.HIT_BY_PITCH,
  EventType.STRIKEOUT,
  EventType.DROPPED_THIRD_STRIKE,
  EventType.SACRIFICE_BUNT,
  EventType.SACRIFICE_FLY,
  EventType.FIELD_ERROR,
  EventType.CATCHER_INTERFERENCE,
  EventType.DOUBLE_PLAY,
  EventType.TRIPLE_PLAY,
]);

function payloadOf(event: GameEvent): Record<string, unknown> {
  return (event.payload ?? {}) as Record<string, unknown>;
}

function eventTypeOf(event: GameEvent): string {
  return String(event.eventType);
}

/** Remove reset, pitch-reverted, and explicitly voided changes before replay. */
export function effectiveBattingOrderEvents(events: readonly GameEvent[]): GameEvent[] {
  const result: GameEvent[] = [];
  const ordered = [...events].sort((a, b) => a.sequenceNumber - b.sequenceNumber);

  for (const event of ordered) {
    const eventType = eventTypeOf(event);
    const payload = payloadOf(event);
    if (eventType === 'game_reset') {
      result.length = 0;
    } else if (eventType === EventType.PITCH_REVERTED) {
      const revertTo = Number(payload.revertToSequenceNumber);
      result.splice(0, result.length, ...result.filter((row) => row.sequenceNumber <= revertTo));
    } else if (eventType === EventType.EVENT_VOIDED) {
      const index = result.findIndex((row) => row.id === payload.voidedEventId);
      if (index >= 0) result.splice(index, 1);
    } else {
      result.push(event);
    }
  }

  return result;
}

/** True once the previous PA is complete and before the next pitch begins. */
export function isBetweenPlateAppearances(events: readonly GameEvent[]): boolean {
  const effectiveEvents = effectiveBattingOrderEvents(events);
  const lastPitch = [...effectiveEvents].reverse().find((event) => event.eventType === EventType.PITCH_THROWN);
  if (!lastPitch) return true;
  const lastInningChange = [...effectiveEvents].reverse().find((event) => event.eventType === EventType.INNING_CHANGE);
  if (lastInningChange && lastInningChange.sequenceNumber > lastPitch.sequenceNumber) return true;
  const lastCompletedPa = [...effectiveEvents].reverse().find((event) =>
    PA_COMPLETION_EVENTS.has(eventTypeOf(event)),
  );
  return !!lastCompletedPa && lastCompletedPa.sequenceNumber > lastPitch.sequenceNumber;
}

export function createActiveBattingOrderReducer(
  initialSlots: readonly ActiveBattingSlot[],
  options: ActiveBattingOrderOptions,
): ActiveBattingOrderReducer {
  const slots = initialSlots
    .filter((slot) => slot.playerId && Number.isInteger(slot.battingOrder) && slot.battingOrder > 0)
    .map((slot) => ({ ...slot }))
    .sort((a, b) => a.battingOrder - b.battingOrder)
    .filter((slot, index, sorted) => index === 0 || sorted[index - 1].battingOrder !== slot.battingOrder);
  let nextBattingOrderPosition: number | null = slots[0]?.battingOrder ?? null;
  let lastCompletedSlotPosition: number | null = null;

  function snapshot(): ActiveBattingOrderState {
    const currentSlot = slots.find((slot) => slot.battingOrder === nextBattingOrderPosition) ?? null;
    return {
      slots: slots.map((slot) => ({ ...slot })),
      nextBatterId: currentSlot?.playerId ?? null,
      nextBattingOrderPosition: currentSlot?.battingOrder ?? null,
    };
  }

  function apply(event: GameEvent): void {
    const eventType = eventTypeOf(event);
    const payload = payloadOf(event);

    if (eventType === EventType.GAME_START) {
      const leadoffId = options.batsOnTop
        ? payload.awayLeadoffBatterId
        : payload.homeLeadoffBatterId;
      const leadoffSlot = slots.find((slot) => slot.playerId === leadoffId);
      if (leadoffSlot) nextBattingOrderPosition = leadoffSlot.battingOrder;
      return;
    }

    if (eventType === EventType.SUBSTITUTION) {
      const isOpponentSubstitution = payload.isOpponentSubstitution === true;
      if (isOpponentSubstitution !== (options.forOpponent ?? false)) return;

      const substitutionType = payload.substitutionType as string | undefined;
      const inPlayerId = typeof payload.inPlayerId === 'string' ? payload.inPlayerId : null;
      const outPlayerId = typeof payload.outPlayerId === 'string' ? payload.outPlayerId : null;
      const position = Number.isInteger(payload.battingOrderPosition)
        ? payload.battingOrderPosition as number
        : null;
      const removedPosition = Number.isInteger(payload.removedBattingOrderPosition)
        ? payload.removedBattingOrderPosition as number
        : position;

      const isLineupExtension =
        substitutionType === SubstitutionType.LINEUP_EXTENSION ||
        (!outPlayerId && position !== null && !slots.some((slot) => slot.battingOrder === position));
      if (isLineupExtension) {
        if (inPlayerId && position && !slots.some((slot) => slot.battingOrder === position)) {
          const previousMaxPosition = slots[slots.length - 1]?.battingOrder ?? null;
          const cursorWrappedAfterLastSlot =
            previousMaxPosition !== null &&
            nextBattingOrderPosition === slots[0]?.battingOrder &&
            lastCompletedSlotPosition === previousMaxPosition;
          slots.push({ playerId: inPlayerId, battingOrder: position });
          slots.sort((a, b) => a.battingOrder - b.battingOrder);
          if (nextBattingOrderPosition === null || cursorWrappedAfterLastSlot) {
            nextBattingOrderPosition = position;
          }
        }
        return;
      }

      if (substitutionType === SubstitutionType.LINEUP_CONTRACTION) {
        if (removedPosition === null) return;
        const index = slots.findIndex((slot) =>
          slot.battingOrder === removedPosition && (!outPlayerId || slot.playerId === outPlayerId),
        );
        if (index < 0) return;
        const [removed] = slots.splice(index, 1);
        if (nextBattingOrderPosition === removed.battingOrder) {
          nextBattingOrderPosition = slots[index]?.battingOrder ?? slots[0]?.battingOrder ?? null;
        }
        return;
      }

      if (!inPlayerId) return;
      const slotIndex = outPlayerId
        ? slots.findIndex((slot) => slot.playerId === outPlayerId)
        : position === null
          ? -1
          : slots.findIndex((slot) => slot.battingOrder === position);
      if (slotIndex >= 0) slots[slotIndex] = { ...slots[slotIndex], playerId: inPlayerId };
      return;
    }

    if (
      PA_COMPLETION_EVENTS.has(eventType) &&
      event.isTopOfInning === options.batsOnTop &&
      slots.length > 0
    ) {
      const currentIndex = slots.findIndex((slot) => slot.battingOrder === nextBattingOrderPosition);
      lastCompletedSlotPosition = currentIndex < 0 ? null : slots[currentIndex].battingOrder;
      const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % slots.length;
      nextBattingOrderPosition = slots[nextIndex].battingOrder;
    }
  }

  return { apply, snapshot };
}

export function deriveActiveBattingOrder(
  initialSlots: readonly ActiveBattingSlot[],
  events: readonly GameEvent[],
  options: ActiveBattingOrderOptions,
): ActiveBattingOrderState {
  const reducer = createActiveBattingOrderReducer(initialBattingOrderSlots(initialSlots, events, options), options);
  for (const event of effectiveBattingOrderEvents(events)) reducer.apply(event);
  return reducer.snapshot();
}

export function validateLineupContraction(input: {
  slot: ActiveBattingSlot;
  settings: LeagueScoringSettings;
  currentBatterId: string | null;
  runnersOnBase: readonly string[];
  betweenPlateAppearances: boolean;
}): string | null {
  if (!input.settings.lineup.allowMidGameContraction) {
    return 'Tournament rules do not allow lineup contraction.';
  }
  if (!input.betweenPlateAppearances) {
    return 'Lineup slots can only be removed between plate appearances.';
  }
  if (input.slot.playerId === input.currentBatterId) {
    return 'The active batter cannot be removed from the lineup.';
  }
  if (input.runnersOnBase.includes(input.slot.playerId)) {
    return 'A player on base cannot be removed from the lineup.';
  }
  return null;
}
