import { useMemo } from 'react';
import {
  EventType,
  formatEventDescription,
  hitRunnerOptions,
  type GameEvent,
  type BaserunnerMovePayload,
  type HitPayload,
} from '@baseball/shared';

export interface PlayFeedRow {
  eventId: string;
  inning: number;
  isTopOfInning: boolean;
  description: string;
  isVoided: boolean;
  /**
   * True for a synthetic row marking a PITCH_REVERTED span rather than a
   * real recorded play. Rendered distinctly from a voided row: a revert
   * means "this span never happened" (the state machine erases it, not
   * marks it), whereas a void means "this happened, then was corrected" —
   * so a correction marker never gets the strikethrough treatment.
   */
  isCorrectionMarker?: boolean;
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

// toBase is typed 2 | 3 | 4 (BaserunnerMovePayload) — there is no base-1 advance.
const BASE_LABELS: Record<number, string> = { 2: '2B', 3: '3B', 4: 'home' };

function capitalize(text: string): string {
  return text.length === 0 ? text : text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * "Alice thrown out advancing" / "Bob held at 3B" — the parenthetical clause
 * for a linked BASERUNNER_OUT / BASERUNNER_ADVANCE on its parent play.
 *
 * When `isVoided` is true the clause instead reports the correction itself
 * ("Alice's call reversed") rather than the original claim. This is the
 * natural Undo target right after recording a hit-with-runner-outcomes play
 * — the linked child, not the parent, is the most recently recorded event —
 * so without this the parent row would keep showing stale, uncorrected text
 * after the coach taps Undo.
 */
function describeLinkedOutcome(
  event: GameEvent,
  parent: GameEvent,
  resolveName: (id: string | null | undefined) => string,
  isVoided: boolean,
): string {
  const p = event.payload as Partial<BaserunnerMovePayload>;
  const who = resolveName(p.runnerId ?? null);
  const name = who === '—' ? 'Runner' : who;
  if (isVoided) {
    return `${name}'s call reversed`;
  }
  if (event.eventType === EventType.BASERUNNER_OUT) {
    return `${name} thrown out advancing`;
  }
  const base = p.toBase != null ? (BASE_LABELS[p.toBase] ?? `base ${p.toBase}`) : 'base';
  // On a hit, a linked advance is either a hold (short of the standard
  // advance) or an extra base (beyond it) — "held at home" would be nonsense
  // for a runner who scored from second on a single.
  if (parent.eventType === EventType.HIT && p.fromBase != null && p.toBase != null) {
    const hitType = (parent.payload as Partial<HitPayload>).hitType;
    const options = hitType ? hitRunnerOptions(p.fromBase as 1 | 2 | 3, hitType) : null;
    if (options && p.toBase > options.standardBase) {
      return p.toBase === 4 ? `${name} scored` : `${name} took ${base}`;
    }
    return `${name} held at ${base}`;
  }
  // Off a non-hit parent (e.g. a throwing error on a pickoff) there is no
  // standard advance to fall short of: the runner simply advanced.
  return `${name} advanced to ${base}`;
}

interface PartitionResult {
  live: GameEvent[];
  voidedIds: Set<string>;
  /** PITCH_REVERTED events that actually truncated at least one live event,
   * paired with how many they removed — the raw material for the "reverted
   * span" trace row built in buildPlayFeedRows. */
  revertMarkers: { event: GameEvent; removedCount: number }[];
}

/**
 * Replays PITCH_REVERTED / EVENT_VOIDED out of the raw stream the way the
 * play feed needs — unlike filterVoidedAndRevertedEvents (game-state.ts),
 * which both applies and, for EVENT_VOIDED, deletes the voided event
 * entirely:
 *
 *  - PITCH_REVERTED truncates the accumulated stream back to
 *    revertToSequenceNumber, same as the state machine. Reverted-away
 *    events are DROPPED from the row stream rather than shown struck
 *    through — a revert means "that portion of the game never happened,"
 *    which reads differently from a voided PLAY that a coach wants the
 *    book to show did happen and was then struck. There is no single event
 *    a strikethrough could attach to either: a revert erases a run of
 *    events, not one identifiable play. Instead, when a revert actually
 *    removes something, its sequence is recorded in `revertMarkers` so the
 *    caller can leave one collapsed trace row rather than hiding it
 *    entirely — the (pre-existing, out-of-scope) web Undo producer isn't
 *    scoped to the still-open plate appearance, so a revert can in
 *    principle truncate an already-completed play, and that must never
 *    vanish from the record with zero trace.
 *  - EVENT_VOIDED keeps its target in place and only marks it voided, so
 *    the caller can render it struck through per the brief.
 */
function partitionRawEvents(events: GameEvent[]): PartitionResult {
  const live: GameEvent[] = [];
  const voidedIds = new Set<string>();
  const revertMarkers: { event: GameEvent; removedCount: number }[] = [];

  for (const event of events) {
    if (event.eventType === EventType.PITCH_REVERTED) {
      const p = event.payload as { revertToSequenceNumber?: number };
      let removedCount = 0;
      if (typeof p.revertToSequenceNumber === 'number') {
        const keepUntilSeq = p.revertToSequenceNumber;
        for (let i = live.length - 1; i >= 0; i--) {
          if (live[i].sequenceNumber > keepUntilSeq) {
            live.splice(i, 1);
            removedCount++;
          }
        }
      }
      if (removedCount > 0) revertMarkers.push({ event, removedCount });
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

  return { live, voidedIds, revertMarkers };
}

export function buildPlayFeedRows(
  events: GameEvent[],
  playerNames: Record<string, string>,
): PlayFeedRow[] {
  const resolveName = (id: string | null | undefined): string =>
    id && playerNames[id] ? playerNames[id] : '—';

  const { live, voidedIds, revertMarkers } = partitionRawEvents(events);

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

  // Group into plate-appearance spans. A group is "closed" once it ends
  // with a PA-ending event; a still-accumulating trailing group is open.
  const paGroups: { events: GameEvent[]; closed: boolean }[] = [];
  let current: GameEvent[] = [];
  for (const event of live) {
    if (linkedIds.has(event.id)) continue;
    current.push(event);
    // A voided terminal event does not end the plate appearance: replay drops
    // it, the batter is still up, and the pitches before it stay visible.
    if (PA_ENDING_EVENT_TYPES.has(event.eventType) && !voidedIds.has(event.id)) {
      paGroups.push({ events: current, closed: true });
      current = [];
    }
  }
  if (current.length > 0) paGroups.push({ events: current, closed: false });

  // Rows are collected with their originating sequence number so the
  // correction-marker rows below (which bypass PA grouping entirely) can be
  // merged back into the right chronological position.
  const sequenced: { sequenceNumber: number; row: PlayFeedRow }[] = [];

  for (const { events: group, closed } of paGroups) {
    for (const event of group) {
      // Keep every pitch visible for as long as its plate appearance is
      // still open; only drop them once a terminal event has closed the PA
      // and replaced them with its own summary row. Gating on the group's
      // closed state (rather than its length) avoids the feed visibly
      // erasing an already-shown pitch row the instant a second pitch
      // lands in the same still-open at-bat.
      if (event.eventType === EventType.PITCH_THROWN && closed) continue;

      const baseDescription = formatEventDescription(event, resolveName);
      const outcomes = outcomesByParent.get(event.id) ?? [];
      if (baseDescription === null && outcomes.length === 0) continue;

      const clauseParts = outcomes.map((o) =>
        describeLinkedOutcome(o, event, resolveName, voidedIds.has(o.id)),
      );

      let description: string;
      if (baseDescription !== null) {
        description =
          clauseParts.length > 0 ? `${baseDescription} (${clauseParts.join(', ')})` : baseDescription;
      } else {
        // The parent play itself isn't ticker-worthy on its own (e.g. a
        // routine pickoff attempt that didn't retire the runner), but it
        // has a linked runner-outcome child that IS a real, recordable
        // play — e.g. a throwing error that let a runner advance. Render
        // the child's effect as this row's own text instead of silently
        // dropping the whole play (a real defensive-error play must leave
        // something in the record).
        description = capitalize(clauseParts.join(', '));
      }

      sequenced.push({
        sequenceNumber: event.sequenceNumber,
        row: {
          eventId: event.id,
          inning: event.inning,
          isTopOfInning: event.isTopOfInning,
          description,
          isVoided: voidedIds.has(event.id),
        },
      });
    }
  }

  // A reverted span leaves a single collapsed marker row rather than
  // disappearing from the feed with no trace at all.
  for (const { event, removedCount } of revertMarkers) {
    sequenced.push({
      sequenceNumber: event.sequenceNumber,
      row: {
        eventId: event.id,
        inning: event.inning,
        isTopOfInning: event.isTopOfInning,
        description: `— ${removedCount} ${removedCount === 1 ? 'entry' : 'entries'} reverted —`,
        isVoided: false,
        isCorrectionMarker: true,
      },
    });
  }

  // Oldest-first by underlying sequence number (so correction markers land
  // in their real chronological slot), then reversed to newest-first — the
  // scorer reads the feed from the most recent play down.
  sequenced.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  return sequenced.map((s) => s.row).reverse();
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
