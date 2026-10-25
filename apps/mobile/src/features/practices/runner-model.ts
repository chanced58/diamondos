import { computeBlockRemaining, type BlockTimerState, type PracticeRunBlock } from '@baseball/shared';

/**
 * The practice runner's decisions, mirroring the web runner: the block on
 * screen is the active one, else the first pending; finishing a block starts
 * the next pending one after it.
 */

/** The block on screen: the active one, else the first pending. */
export function currentBlock(blocks: PracticeRunBlock[]): PracticeRunBlock | null {
  return blocks.find((b) => b.status === 'active') ?? blocks.find((b) => b.status === 'pending') ?? null;
}

/** The first pending block after the given position: the one completing a block starts next. */
export function nextPendingAfter(blocks: PracticeRunBlock[], position: number): PracticeRunBlock | null {
  return blocks.find((b) => b.position > position && b.status === 'pending') ?? null;
}

/** Every block completed or skipped. */
export function allBlocksDone(blocks: PracticeRunBlock[]): boolean {
  return blocks.every((b) => b.status === 'completed' || b.status === 'skipped');
}

/** Whole minutes the block ran, at least 1 (the web runner's rule). */
export function actualMinutes(block: PracticeRunBlock, now: Date): number {
  if (!block.startedAt) return block.plannedDurationMinutes;
  return Math.max(1, Math.round((now.getTime() - Date.parse(block.startedAt)) / 60_000));
}

/** The countdown for a block, from its start time and planned minutes. */
export function blockTimer(block: PracticeRunBlock, now: Date): BlockTimerState {
  return computeBlockRemaining({ startedAt: block.startedAt, plannedDurationMinutes: block.plannedDurationMinutes }, now);
}

/** Green with more than half left, amber past half, red in the last tenth and over time. */
export function timerTone(timer: BlockTimerState): 'good' | 'warn' | 'over' {
  if (timer.overrunSeconds > 0) return 'over';
  if (timer.remainingSeconds > timer.plannedSeconds * 0.5) return 'good';
  if (timer.remainingSeconds > timer.plannedSeconds * 0.1) return 'warn';
  return 'over';
}
