import {
  isEventClockAheadRejection,
  MAX_EVENT_CLOCK_AHEAD_MS,
  serverNowFromClockRejection,
} from '@baseball/shared';

/**
 * Events the server refused because they were stamped more than a day ahead
 * of its clock (the phone's clock is fast). They are held, not dropped: the
 * rows stay unsynced on the device and are offered again every cycle, and the
 * server accepts them once real time comes within a day of their timestamp.
 * Meanwhile the scorer is told, and the game is not finalized (see
 * reconcileGameLifecycle), so a finished game never goes final without them.
 */
export interface ClockHeldEvent {
  gameId: string;
  eventId: string;
}

interface PushableEvent {
  id: string;
  game_id: string;
  occurred_at: string;
}

interface UpsertError {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

export interface ClockHoldPushResult {
  /** Refused for a fast clock; keep unsynced and retry next cycle. */
  held: ClockHeldEvent[];
  /** Any other failure, left to the caller (sequence collisions, RLS, ...). */
  error: UpsertError | null;
}

// Rounds of "split off what DETAIL says is too far ahead, push the rest"
// before falling back to one event at a time. One round settles it whenever
// the trigger reports its clock; the rest only guard against odd responses.
const SPLIT_ROUNDS = 3;

const toHeld = (event: PushableEvent): ClockHeldEvent => ({ gameId: event.game_id, eventId: event.id });

/**
 * Upserts `events` the way the bulk push always has, but survives the server
 * refusing some of them for a fast device clock: those are set aside and the
 * rest still reach the server in the same cycle.
 *
 * Postgres refuses the whole statement when one row fails, so the refused
 * rows are found from the server clock the error carries (DETAIL), falling
 * back to pushing the remainder one row at a time when it carries none.
 */
export async function pushEventsHoldingClockAhead<T extends PushableEvent>(
  events: readonly T[],
  upsert: (rows: T[]) => PromiseLike<UpsertError | null>,
): Promise<ClockHoldPushResult> {
  const held: ClockHeldEvent[] = [];
  let pending = [...events];

  for (let round = 0; round < SPLIT_ROUNDS && pending.length > 0; round++) {
    const error = await upsert(pending);
    if (!error) return { held, error: null };
    if (!isEventClockAheadRejection(error)) return { held, error };

    const serverNowMs = serverNowFromClockRejection(error);
    if (serverNowMs === null) break;
    const limitMs = serverNowMs + MAX_EVENT_CLOCK_AHEAD_MS;
    const tooFarAhead = pending.filter((event) => Date.parse(event.occurred_at) > limitMs);
    if (tooFarAhead.length === 0) break;
    held.push(...tooFarAhead.map(toHeld));
    pending = pending.filter((event) => !tooFarAhead.includes(event));
  }

  for (const event of pending) {
    const error = await upsert([event]);
    if (!error) continue;
    if (!isEventClockAheadRejection(error)) return { held, error };
    held.push(toHeld(event));
  }
  return { held, error: null };
}

/** What the scorer is told about a game's held plays (null when none). */
export function describeClockHold(heldCount: number): { label: string; explanation: string } | null {
  if (heldCount <= 0) return null;
  const plays = heldCount === 1 ? '1 play' : `${heldCount} plays`;
  return {
    label: `⚠ ${plays} waiting · phone clock ahead`,
    explanation:
      `This phone's date and time are more than a day ahead, so the server refused ${plays}. ` +
      'They are saved on this phone and upload on their own once their recorded time is less than a day away; ' +
      'the game is not finalized until they do. Turn on Settings → General → Date & Time → Set Automatically ' +
      'so new plays upload normally.',
  };
}
