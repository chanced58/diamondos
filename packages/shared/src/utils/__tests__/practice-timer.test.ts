import { PracticeBlockStatus, PracticeBlock } from '../../types/practice';
import { PracticeBlockType } from '../../types/practice-template';
import {
  computeBlockRemaining,
  formatCountdown,
  nextBlockToAutoAdvance,
} from '../practice-timer';

describe('computeBlockRemaining', () => {
  it('returns the full plan when the block has not started', () => {
    const state = computeBlockRemaining(
      { plannedDurationMinutes: 10 },
      new Date('2026-04-21T18:00:00Z'),
    );
    expect(state.elapsedSeconds).toBe(0);
    expect(state.remainingSeconds).toBe(600);
    expect(state.overrunSeconds).toBe(0);
  });

  it('computes elapsed and remaining from startedAt', () => {
    const state = computeBlockRemaining(
      { plannedDurationMinutes: 5, startedAt: '2026-04-21T18:00:00Z' },
      new Date('2026-04-21T18:02:00Z'),
    );
    expect(state.elapsedSeconds).toBe(120);
    expect(state.remainingSeconds).toBe(180);
    expect(state.overrunSeconds).toBe(0);
  });

  it('reports overrun when elapsed exceeds plan', () => {
    const state = computeBlockRemaining(
      { plannedDurationMinutes: 2, startedAt: '2026-04-21T18:00:00Z' },
      new Date('2026-04-21T18:03:30Z'),
    );
    expect(state.remainingSeconds).toBe(0);
    expect(state.overrunSeconds).toBe(90);
  });
});

function block(id: string, position: number, status: PracticeBlockStatus): PracticeBlock {
  return {
    id,
    practiceId: 'prac',
    position,
    blockType: PracticeBlockType.CUSTOM,
    title: id,
    plannedDurationMinutes: 10,
    fieldSpaces: [],
    status,
    createdAt: '2026-04-21T17:00:00Z',
    updatedAt: '2026-04-21T17:00:00Z',
  };
}

describe('nextBlockToAutoAdvance', () => {
  it('returns first pending block strictly after current', () => {
    const blocks = [
      block('a', 0, PracticeBlockStatus.COMPLETED),
      block('b', 1, PracticeBlockStatus.ACTIVE),
      block('c', 2, PracticeBlockStatus.SKIPPED),
      block('d', 3, PracticeBlockStatus.PENDING),
      block('e', 4, PracticeBlockStatus.PENDING),
    ];
    const next = nextBlockToAutoAdvance(blocks, 'b');
    expect(next?.id).toBe('d');
  });

  it('returns first pending when no current block', () => {
    const blocks = [
      block('a', 0, PracticeBlockStatus.COMPLETED),
      block('b', 1, PracticeBlockStatus.PENDING),
    ];
    expect(nextBlockToAutoAdvance(blocks, null)?.id).toBe('b');
  });

  it('returns null when no pending remains', () => {
    const blocks = [
      block('a', 0, PracticeBlockStatus.ACTIVE),
      block('b', 1, PracticeBlockStatus.COMPLETED),
    ];
    expect(nextBlockToAutoAdvance(blocks, 'a')).toBeNull();
  });
});

describe('formatCountdown', () => {
  it('zero-pads minutes and seconds', () => {
    expect(formatCountdown(0)).toBe('00:00');
    expect(formatCountdown(65)).toBe('01:05');
    expect(formatCountdown(3599)).toBe('59:59');
  });

  it('clamps negatives to zero', () => {
    expect(formatCountdown(-10)).toBe('00:00');
  });
});
