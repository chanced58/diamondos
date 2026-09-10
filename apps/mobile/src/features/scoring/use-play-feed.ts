import { useMemo } from 'react';
import {
  EventType,
  formatEventDescription,
  type GameEvent,
  type BaserunnerMovePayload,
} from '@baseball/shared';

export interface PlayFeedRow {
  eventId: string;
  inning: number;
  isTopOfInning: boolean;
  description: string;
  isVoided: boolean;
}

/**
 * Event types that close a plate appearance (mirrors every `incrementPA`
 * call site in packages/shared/src/utils/game-state.ts). BASERUNNER_OUT /
 * BASERUNNER_ADVANCE deliberately excluded — a linked one is folded into
 * its parent's parenthetical below, and an unlinked one (e.g. a standalone
 * pickoff-adjacent out) doesn't end the batter's plate appearance either.
 */
const PA_ENDING_EVENT_TYPES = new Set<EventType>([
  EventType.WALK,
  EventType.HIT_BY_PITCH,
  EventType.CATCHER_INTERFERENCE,
  EventType.HIT,
  EventType.FIELD_ERROR,
  EventType.OUT,
  EventType.STRIKEOUT,
  EventType.DROPPED_THIRD_STRIKE,
  EventType.SACRIFICE_BUNT,
  EventType.SACRIFICE_FLY,
  EventType.DOUBLE_PLAY,
  EventType.TRIPLE_PLAY,
]);

function isLinkedRunnerOutcome(event: GameEvent): boolean {
  if (event.eventType !== EventType.BASERUNNER_OUT && event.eventType !== EventType.BASERUNNER_ADVANCE) {
    return false;
  }
  const p = event.payload as Partial<BaserunnerMovePayload>;
  return !!p.relatedEventId;
}

const BASE_LABELS: Record<number, string> = { 1: '1B', 2: '2B', 3: '3B', 4: 'home' };

/** "Alice thrown out advancing" / "Bob held at 3B" — the parenthetical clause
 * for a linked BASERUNNER_OUT / BASERUNNER_ADVANCE on its parent play. */
function describeLinkedOutcome(
  event: GameEvent,
  resolveName: (id: string | null | undefined) => string,
): string {
  const p = event.payload as Partial<BaserunnerMovePayload>;
  const who = resolveName(p.runnerId ?? null);
  const name = who === '—' ? 'Runner' : who;
  if (event.eventType === EventType.BASERUNNER_OUT) {
    return `${name} thrown out advancing`;
  }
  const base = p.toBase != null ? (BASE_LABELS[p.toBase] ?? `base ${p.toBase}`) : 'base';
  return `${name} held at ${base}`;
}

/**
 * Replays PITCH_REVERTED / EVENT_VOIDED out of the raw stream the way the
 * play feed needs — unlike filterVoidedAndRevertedEvents (game-state.ts),
 * which both applies and, for EVENT_VOIDED, deletes the voided event
 * entirely:
 *
 *  - PITCH_REVERTED truncates the accumulated stream back to
 *    revertToSequenceNumber, same as the state machine. Reverted-away
 *    events are DROPPED from the feed rather than shown struck through —
 *    a revert means "that portion of the at-bat never happened," which
 *    reads differently from a voided PLAY that a coach wants the book to
 *    show did happen and was then struck. There is also no single event
 *    to point a strikethrough at: a revert erases a run of pitches, not
 *    one identifiable play.
 *  - EVENT_VOIDED keeps its target in place and only marks it voided, so
 *    the caller can render it struck through per the brief.
 */
function partitionRawEvents(events: GameEvent[]): { live: GameEvent[]; voidedIds: Set<string> } {
  const live: GameEvent[] = [];
  const voidedIds = new Set<string>();

  for (const event of events) {
    if (event.eventType === EventType.PITCH_REVERTED) {
      const p = event.payload as { revertToSequenceNumber?: number };
      if (typeof p.revertToSequenceNumber === 'number') {
        const keepUntilSeq = p.revertToSequenceNumber;
        for (let i = live.length - 1; i >= 0; i--) {
          if (live[i].sequenceNumber > keepUntilSeq) live.splice(i, 1);
        }
      }
      continue;
    }
    if (event.eventType === EventType.EVENT_VOIDED) {
      const p = event.payload as { voidedEventId?: string; voidedSequenceNumber?: number };
      let idx = p.voidedEventId ? live.findIndex((e) => e.id === p.voidedEventId) : -1;
      if (idx === -1 && typeof p.voidedSequenceNumber === 'number') {
        idx = live.findIndex((e) => e.sequenceNumber === p.voidedSequenceNumber);
      }
      if (idx !== -1) voidedIds.add(live[idx].id);
      continue;
    }
    live.push(event);
  }

  return { live, voidedIds };
}

export function buildPlayFeedRows(
  events: GameEvent[],
  playerNames: Record<string, string>,
): PlayFeedRow[] {
  const resolveName = (id: string | null | undefined): string =>
    id && playerNames[id] ? playerNames[id] : '—';

  const { live, voidedIds } = partitionRawEvents(events);

  // Fold linked runner-outcome events into their parent play's parenthetical
  // instead of giving them their own row.
  const outcomesByParent = new Map<string, GameEvent[]>();
  const linkedIds = new Set<string>();
  for (const event of live) {
    if (!isLinkedRunnerOutcome(event)) continue;
    const p = event.payload as Partial<BaserunnerMovePayload>;
    const parentId = p.relatedEventId as string;
    linkedIds.add(event.id);
    const arr = outcomesByParent.get(parentId) ?? [];
    arr.push(event);
    outcomesByParent.set(parentId, arr);
  }

  // Group into plate-appearance spans so a PITCH_THROWN row can be skipped
  // unless it is the only event recorded so far in its (still-open) plate
  // appearance — every other pitch is redundant with the terminal play
  // event (HIT/OUT/WALK/etc.) that the PA closes with.
  const paGroups: GameEvent[][] = [];
  let current: GameEvent[] = [];
  for (const event of live) {
    if (linkedIds.has(event.id)) continue;
    current.push(event);
    if (PA_ENDING_EVENT_TYPES.has(event.eventType)) {
      paGroups.push(current);
      current = [];
    }
  }
  if (current.length > 0) paGroups.push(current);

  const rows: PlayFeedRow[] = [];
  for (const group of paGroups) {
    for (const event of group) {
      if (event.eventType === EventType.PITCH_THROWN && group.length > 1) continue;
      const description = formatEventDescription(event, resolveName);
      if (description === null) continue;
      const outcomes = outcomesByParent.get(event.id);
      const full = outcomes && outcomes.length > 0
        ? `${description} (${outcomes.map((o) => describeLinkedOutcome(o, resolveName)).join(', ')})`
        : description;
      rows.push({
        eventId: event.id,
        inning: event.inning,
        isTopOfInning: event.isTopOfInning,
        description: full,
        isVoided: voidedIds.has(event.id),
      });
    }
  }

  // Newest first — the scorer reads the feed from the most recent play down.
  rows.reverse();
  return rows;
}

/**
 * Derives play-by-play feed rows from the raw (unfiltered) event stream —
 * `rawEvents` from useGameState, NOT `events` (see use-game-state.ts): the
 * filtered `events` field has already dropped both halves of every
 * correction, making "render voided plays struck through" unsatisfiable.
 */
export function usePlayFeed(
  events: GameEvent[],
  playerNames: Record<string, string>,
): PlayFeedRow[] {
  return useMemo(() => buildPlayFeedRows(events, playerNames), [events, playerNames]);
}
