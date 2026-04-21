import { PracticeBlockStatus } from '../../types/practice';
import {
  ScheduleInputBlock,
  compressRemaining,
  computeBlockSchedule,
  projectedOverrun,
} from '../practice-schedule';

function mkBlock(overrides: Partial<ScheduleInputBlock> & { id: string; position: number; plannedDurationMinutes: number }): ScheduleInputBlock {
  return {
    status: PracticeBlockStatus.PENDING,
    ...overrides,
  };
}

describe('computeBlockSchedule', () => {
  const start = '2026-04-21T18:00:00.000Z';

  it('emits monotonic schedule for all-pending blocks using planned durations', () => {
    const blocks: ScheduleInputBlock[] = [
      mkBlock({ id: 'a', position: 0, plannedDurationMinutes: 10 }),
      mkBlock({ id: 'b', position: 1, plannedDurationMinutes: 20 }),
      mkBlock({ id: 'c', position: 2, plannedDurationMinutes: 5 }),
    ];
    const sched = computeBlockSchedule(blocks, start);
    expect(sched).toHaveLength(3);
    expect(sched[0]).toEqual({
      blockId: 'a',
      startsAt: '2026-04-21T18:00:00.000Z',
      endsAt: '2026-04-21T18:10:00.000Z',
    });
    expect(sched[1]).toEqual({
      blockId: 'b',
      startsAt: '2026-04-21T18:10:00.000Z',
      endsAt: '2026-04-21T18:30:00.000Z',
    });
    expect(sched[2]).toEqual({
      blockId: 'c',
      startsAt: '2026-04-21T18:30:00.000Z',
      endsAt: '2026-04-21T18:35:00.000Z',
    });
  });

  it('uses actualDurationMinutes for completed blocks (with fallback)', () => {
    const blocks: ScheduleInputBlock[] = [
      mkBlock({
        id: 'a',
        position: 0,
        plannedDurationMinutes: 10,
        status: PracticeBlockStatus.COMPLETED,
        actualDurationMinutes: 12,
      }),
      mkBlock({ id: 'b', position: 1, plannedDurationMinutes: 5 }),
    ];
    const sched = computeBlockSchedule(blocks, start);
    expect(sched[0].endsAt).toBe('2026-04-21T18:12:00.000Z');
    expect(sched[1].startsAt).toBe('2026-04-21T18:12:00.000Z');
    expect(sched[1].endsAt).toBe('2026-04-21T18:17:00.000Z');
  });

  it('uses elapsed-so-far for active block', () => {
    const blocks: ScheduleInputBlock[] = [
      mkBlock({
        id: 'a',
        position: 0,
        plannedDurationMinutes: 30,
        status: PracticeBlockStatus.ACTIVE,
        startedAt: '2026-04-21T18:00:00.000Z',
      }),
      mkBlock({ id: 'b', position: 1, plannedDurationMinutes: 10 }),
    ];
    const sched = computeBlockSchedule(
      blocks,
      start,
      '2026-04-21T18:04:00.000Z',
    );
    // active block has been running 4 min of its 30 min plan.
    expect(sched[0].endsAt).toBe('2026-04-21T18:04:00.000Z');
    expect(sched[1].startsAt).toBe('2026-04-21T18:04:00.000Z');
  });

  it('treats skipped blocks as zero duration', () => {
    const blocks: ScheduleInputBlock[] = [
      mkBlock({
        id: 'a',
        position: 0,
        plannedDurationMinutes: 10,
        status: PracticeBlockStatus.SKIPPED,
      }),
      mkBlock({ id: 'b', position: 1, plannedDurationMinutes: 10 }),
    ];
    const sched = computeBlockSchedule(blocks, start);
    expect(sched[0].startsAt).toBe(sched[0].endsAt);
    expect(sched[1].startsAt).toBe('2026-04-21T18:00:00.000Z');
  });
});

describe('compressRemaining', () => {
  const blocks = [
    { id: 'a', plannedDurationMinutes: 10 },
    { id: 'b', plannedDurationMinutes: 20 },
    { id: 'c', plannedDurationMinutes: 30 },
    { id: 'd', plannedDurationMinutes: 40 },
  ];

  it('rescales blocks after currentIndex to hit the target window', () => {
    // now = 18:10; target = 18:40 → 30 remaining minutes to split across c+d.
    const out = compressRemaining(
      blocks,
      1, // current is 'b'
      '2026-04-21T18:40:00.000Z',
      '2026-04-21T18:10:00.000Z',
    );
    expect(out.slice(0, 2).map((b) => b.plannedDurationMinutes)).toEqual([10, 20]);
    const remainingSum = out
      .slice(2)
      .reduce((s, b) => s + b.plannedDurationMinutes, 0);
    expect(remainingSum).toBe(30);
  });

  it('falls back to 1 minute each when window is non-positive', () => {
    const out = compressRemaining(
      blocks,
      1,
      '2026-04-21T18:00:00.000Z',
      '2026-04-21T18:30:00.000Z',
    );
    expect(out.slice(2).map((b) => b.plannedDurationMinutes)).toEqual([1, 1]);
  });

  it('noop when currentIndex is at last block', () => {
    const out = compressRemaining(
      blocks,
      3,
      '2026-04-21T20:00:00.000Z',
      '2026-04-21T19:00:00.000Z',
    );
    expect(out.map((b) => b.plannedDurationMinutes)).toEqual([10, 20, 30, 40]);
  });

  it('noop when currentIndex is past the end', () => {
    const out = compressRemaining(
      blocks,
      blocks.length,
      '2026-04-21T20:00:00.000Z',
      '2026-04-21T19:00:00.000Z',
    );
    expect(out.map((b) => b.plannedDurationMinutes)).toEqual([10, 20, 30, 40]);
  });

  it('with currentIndex = -1 compresses all blocks to fit the window', () => {
    // nextIdx = 0, so every block is rescaled.
    const out = compressRemaining(
      blocks,
      -1,
      '2026-04-21T19:00:00.000Z',
      '2026-04-21T18:00:00.000Z',
    );
    const sum = out.reduce((s, b) => s + b.plannedDurationMinutes, 0);
    expect(sum).toBe(60);
  });
});

describe('projectedOverrun', () => {
  it('returns positive minutes when schedule ends after planned', () => {
    const blocks: ScheduleInputBlock[] = [
      { id: 'a', position: 0, plannedDurationMinutes: 60, status: PracticeBlockStatus.PENDING },
    ];
    const over = projectedOverrun(
      blocks,
      '2026-04-21T18:00:00.000Z',
      '2026-04-21T18:45:00.000Z',
      '2026-04-21T18:00:00.000Z',
    );
    expect(over).toBe(15);
  });

  it('returns negative minutes when ahead of schedule', () => {
    const blocks: ScheduleInputBlock[] = [
      { id: 'a', position: 0, plannedDurationMinutes: 30, status: PracticeBlockStatus.PENDING },
    ];
    const over = projectedOverrun(
      blocks,
      '2026-04-21T18:00:00.000Z',
      '2026-04-21T18:45:00.000Z',
      '2026-04-21T18:00:00.000Z',
    );
    expect(over).toBe(-15);
  });

  it('accounts for pending work after now > plannedEnd', () => {
    // now (19:00) is already past the planned end (18:45), and there's still
    // one 30-min pending block left — overrun should include both the
    // elapsed excess AND the remaining planned work.
    const blocks: ScheduleInputBlock[] = [
      {
        id: 'a',
        position: 0,
        plannedDurationMinutes: 60,
        status: PracticeBlockStatus.ACTIVE,
        startedAt: '2026-04-21T18:00:00.000Z',
      },
      { id: 'b', position: 1, plannedDurationMinutes: 30, status: PracticeBlockStatus.PENDING },
    ];
    const over = projectedOverrun(
      blocks,
      '2026-04-21T18:00:00.000Z',
      '2026-04-21T18:45:00.000Z',
      '2026-04-21T19:00:00.000Z',
    );
    // end = 19:00 (active finishes at elapsed) + 30 pending = 19:30; planned
    // end is 18:45; overrun = 45 min.
    expect(over).toBe(45);
  });
});

describe('computeBlockSchedule ACTIVE edge cases', () => {
  it('uses elapsed time when active block has run past its planned duration', () => {
    const blocks: ScheduleInputBlock[] = [
      {
        id: 'a',
        position: 0,
        plannedDurationMinutes: 10,
        status: PracticeBlockStatus.ACTIVE,
        startedAt: '2026-04-21T18:00:00.000Z',
      },
      { id: 'b', position: 1, plannedDurationMinutes: 5, status: PracticeBlockStatus.PENDING },
    ];
    const sched = computeBlockSchedule(
      blocks,
      '2026-04-21T18:00:00.000Z',
      '2026-04-21T18:15:00.000Z', // 15 min elapsed into a 10 min block
    );
    // active block should end at now (15 min in), not at the original +10.
    expect(sched[0].endsAt).toBe('2026-04-21T18:15:00.000Z');
    expect(sched[1].startsAt).toBe('2026-04-21T18:15:00.000Z');
  });
});
