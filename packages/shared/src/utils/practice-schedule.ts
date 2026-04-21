import {
  PracticeBlock,
  PracticeBlockStatus,
  ScheduledBlock,
} from '../types/practice';

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

/**
 * Subset of PracticeBlock needed to compute a schedule. Keeps this util usable
 * against partially-hydrated rows from the DB as well as fully-typed models.
 */
export type ScheduleInputBlock = Pick<
  PracticeBlock,
  | 'id'
  | 'position'
  | 'plannedDurationMinutes'
  | 'actualDurationMinutes'
  | 'status'
  | 'startedAt'
  | 'completedAt'
>;

/**
 * Walks blocks in `position` order and emits a concrete start/end for each.
 * - completed blocks use their actualDurationMinutes (fallback: planned).
 * - active block uses elapsed-so-far when possible (fallback: planned).
 * - pending / skipped blocks use plannedDurationMinutes.
 *
 * Both `now` and `startedAt` default to the current clock. Returns timestamps
 * as ISO strings for JSON safety.
 */
export function computeBlockSchedule(
  blocks: ScheduleInputBlock[],
  startedAt: Date | string,
  now: Date | string = new Date(),
): ScheduledBlock[] {
  const start = toDate(startedAt);
  const clock = toDate(now);
  const sorted = [...blocks].sort((a, b) => a.position - b.position);

  const out: ScheduledBlock[] = [];
  let cursor = new Date(start.getTime());

  for (const block of sorted) {
    const blockStart = new Date(cursor.getTime());
    let durationMinutes: number;

    switch (block.status) {
      case PracticeBlockStatus.COMPLETED:
        durationMinutes =
          block.actualDurationMinutes ?? block.plannedDurationMinutes;
        break;
      case PracticeBlockStatus.ACTIVE: {
        if (block.startedAt) {
          const elapsed =
            (clock.getTime() - toDate(block.startedAt).getTime()) / 60_000;
          durationMinutes = Math.max(0, elapsed);
        } else {
          durationMinutes = block.plannedDurationMinutes;
        }
        break;
      }
      case PracticeBlockStatus.SKIPPED:
        durationMinutes = 0;
        break;
      case PracticeBlockStatus.PENDING:
      default:
        durationMinutes = block.plannedDurationMinutes;
    }

    const blockEnd = addMinutes(blockStart, durationMinutes);
    cursor = blockEnd;
    out.push({
      blockId: block.id,
      startsAt: blockStart.toISOString(),
      endsAt: blockEnd.toISOString(),
    });
  }

  return out;
}

/**
 * Rescales `plannedDurationMinutes` for every block AFTER `currentIndex`
 * so that their sum equals (targetEndTime - now) in minutes, preserving
 * the relative weighting of the remaining blocks.
 *
 * Rounded to nearest minute; each block floor of 1. If the remaining
 * window is <= 0 the remaining blocks are each set to 1 minute.
 *
 * Returns a new array of the same length. Blocks at index <= currentIndex
 * are passed through unchanged.
 */
export function compressRemaining<T extends Pick<PracticeBlock, 'id' | 'plannedDurationMinutes'>>(
  blocks: T[],
  currentIndex: number,
  targetEndTime: Date | string,
  now: Date | string = new Date(),
): T[] {
  if (blocks.length === 0) return [];
  const nextIdx = Math.max(currentIndex + 1, 0);
  if (nextIdx >= blocks.length) return [...blocks];

  const target = toDate(targetEndTime).getTime();
  const clock = toDate(now).getTime();
  const remainingMinutes = Math.max(0, (target - clock) / 60_000);

  const remainingBlocks = blocks.slice(nextIdx);
  const originalSum = remainingBlocks.reduce(
    (s, b) => s + b.plannedDurationMinutes,
    0,
  );

  const out = [...blocks];

  if (remainingMinutes <= 0) {
    for (let i = nextIdx; i < out.length; i++) {
      out[i] = { ...out[i], plannedDurationMinutes: 1 };
    }
    return out;
  }

  if (originalSum <= 0) {
    // Evenly distribute the window across remaining blocks.
    const per = Math.max(1, Math.round(remainingMinutes / remainingBlocks.length));
    for (let i = nextIdx; i < out.length; i++) {
      out[i] = { ...out[i], plannedDurationMinutes: per };
    }
    return out;
  }

  const scale = remainingMinutes / originalSum;
  // Largest-remainder rounding so the sum hits the target exactly.
  type Rescaled = { idx: number; floorV: number; frac: number };
  const rescaled: Rescaled[] = remainingBlocks.map((b, i) => {
    const raw = Math.max(1, b.plannedDurationMinutes * scale);
    const floorV = Math.max(1, Math.floor(raw));
    return { idx: nextIdx + i, floorV, frac: raw - Math.floor(raw) };
  });

  const assignedSum = rescaled.reduce((s, r) => s + r.floorV, 0);
  let leftover = Math.max(0, Math.round(remainingMinutes) - assignedSum);
  const byFrac = [...rescaled].sort((a, b) => b.frac - a.frac);
  for (const r of byFrac) {
    if (leftover <= 0) break;
    r.floorV += 1;
    leftover -= 1;
  }

  for (const r of rescaled) {
    out[r.idx] = { ...out[r.idx], plannedDurationMinutes: r.floorV };
  }

  return out;
}

/**
 * Minutes the current schedule is running over (positive) or under (negative)
 * its planned end time. Useful for the "We're behind" chip in the runner UI.
 */
export function projectedOverrun(
  blocks: ScheduleInputBlock[],
  startedAt: Date | string,
  plannedEnd: Date | string,
  now: Date | string = new Date(),
): number {
  const schedule = computeBlockSchedule(blocks, startedAt, now);
  if (schedule.length === 0) return 0;
  const end = toDate(schedule[schedule.length - 1].endsAt).getTime();
  const planned = toDate(plannedEnd).getTime();
  return Math.round((end - planned) / 60_000);
}
