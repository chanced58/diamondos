import {
  PracticeBlock,
  PracticeBlockStatus,
} from '../types/practice';

export interface BlockTimerState {
  elapsedSeconds: number;
  remainingSeconds: number;
  /** Positive when running over the planned duration. */
  overrunSeconds: number;
  plannedSeconds: number;
}

export interface TimerInputBlock {
  startedAt?: string | Date | null;
  plannedDurationMinutes: number;
}

/**
 * Computes timer values for the *active* block.
 *
 * Elapsed is always derived from (now - startedAt). No ticking counter —
 * this makes the timer resilient to app backgrounding on mobile.
 */
export function computeBlockRemaining(
  block: TimerInputBlock,
  now: Date = new Date(),
): BlockTimerState {
  const plannedSeconds = block.plannedDurationMinutes * 60;
  if (!block.startedAt) {
    return {
      elapsedSeconds: 0,
      remainingSeconds: plannedSeconds,
      overrunSeconds: 0,
      plannedSeconds,
    };
  }
  const start =
    block.startedAt instanceof Date ? block.startedAt : new Date(block.startedAt);
  const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - start.getTime()) / 1000));
  const remainingSeconds = Math.max(0, plannedSeconds - elapsedSeconds);
  const overrunSeconds = Math.max(0, elapsedSeconds - plannedSeconds);
  return { elapsedSeconds, remainingSeconds, overrunSeconds, plannedSeconds };
}

/**
 * Next pending block in position order strictly after the current one. Used
 * by the runner to auto-advance when the countdown hits zero.
 */
export function nextBlockToAutoAdvance(
  blocks: PracticeBlock[],
  currentBlockId: string | null,
): PracticeBlock | null {
  const sorted = [...blocks].sort((a, b) => a.position - b.position);
  if (!currentBlockId) {
    return sorted.find((b) => b.status === PracticeBlockStatus.PENDING) ?? null;
  }
  const currentIdx = sorted.findIndex((b) => b.id === currentBlockId);
  if (currentIdx === -1) return null;
  for (let i = currentIdx + 1; i < sorted.length; i++) {
    if (sorted[i].status === PracticeBlockStatus.PENDING) return sorted[i];
  }
  return null;
}

/** Zero-padded mm:ss format for countdown display. */
export function formatCountdown(totalSeconds: number): string {
  const t = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
