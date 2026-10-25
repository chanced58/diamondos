import { PracticeBlockStatus, practiceRunResponseSchema } from '@baseball/shared';
import { loadPracticeRun, runPractice } from '../practice-run';
import { fakeDb } from '../../__tests__/fake-db';

const mockGetPractice = jest.fn();
const mockStartBlock = jest.fn();
const mockCompleteBlock = jest.fn();
const mockSkipBlock = jest.fn();
const mockStarted = jest.fn();
const mockCompleted = jest.fn();
const mockSetActive = jest.fn();
jest.mock('@baseball/database', () => ({
  getPracticeWithBlocks: (...args: unknown[]) => mockGetPractice(...args),
  startBlock: (...args: unknown[]) => mockStartBlock(...args),
  completeBlock: (...args: unknown[]) => mockCompleteBlock(...args),
  skipBlock: (...args: unknown[]) => mockSkipBlock(...args),
  markPracticeStarted: (...args: unknown[]) => mockStarted(...args),
  markPracticeCompleted: (...args: unknown[]) => mockCompleted(...args),
  setActiveBlock: (...args: unknown[]) => mockSetActive(...args),
}));

const PRACTICE = '22222222-2222-4222-8222-222222222222';
const MINE = '33333333-3333-4333-8333-333333333333';
const THEIRS = '44444444-4444-4444-8444-444444444444';

const block = (id: string, position: number, assignedCoachId?: string) => ({
  id, position, blockType: 'individual_skill', title: `Block ${position}`, plannedDurationMinutes: 15, status: PracticeBlockStatus.PENDING,
  assignedCoachId, fieldSpaces: [], createdAt: '', updatedAt: '', practiceId: PRACTICE, players: [], stations: [],
});
const practice = {
  id: PRACTICE, teamId: 'team-1', scheduledAt: '2026-10-25T23:00:00Z', status: 'scheduled', runStatus: 'not_started',
  blocks: [block(THEIRS, 2, 'head-coach'), block(MINE, 1, 'asst')],
};
const coach = (role: string) => fakeDb({ 'team_members.select': { data: { role, is_active: true } } }).db;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetPractice.mockResolvedValue(practice);
  mockStartBlock.mockResolvedValue(true);
});

describe('loadPracticeRun', () => {
  it('should order the blocks and say which ones an assistant controls', async () => {
    const result = await loadPracticeRun(coach('assistant_coach'), 'asst', { practiceId: PRACTICE });
    if (!result.ok) throw new Error(result.error);
    expect(practiceRunResponseSchema.parse(result.data)).toEqual(result.data);
    expect(result.data.canRunPractice).toBe(false);
    expect(result.data.blocks.map((b) => [b.id, b.canControl])).toEqual([[MINE, true], [THEIRS, false]]);
  });

  it('should refuse a parent', async () => {
    expect(await loadPracticeRun(coach('parent'), 'p', { practiceId: PRACTICE })).toMatchObject({ ok: false, code: 'forbidden' });
  });
});

describe('runPractice', () => {
  it('should let a head coach start the practice, and refuse an assistant', async () => {
    expect(await runPractice(coach('head_coach'), 'hc', { practiceId: PRACTICE, action: 'start' })).toMatchObject({ ok: true });
    expect(mockStarted).toHaveBeenCalledWith(expect.anything(), PRACTICE, expect.any(String));

    expect(await runPractice(coach('assistant_coach'), 'asst', { practiceId: PRACTICE, action: 'complete' })).toMatchObject({
      ok: false,
      code: 'forbidden',
    });
    expect(mockCompleted).not.toHaveBeenCalled();
  });

  it('should let an assistant start their own block and point the practice at it, but not another', async () => {
    expect(await runPractice(coach('assistant_coach'), 'asst', { practiceId: PRACTICE, action: 'startBlock', blockId: MINE })).toMatchObject({ ok: true });
    expect(mockSetActive).toHaveBeenCalledWith(expect.anything(), PRACTICE, MINE);

    expect(await runPractice(coach('assistant_coach'), 'asst', { practiceId: PRACTICE, action: 'skipBlock', blockId: THEIRS })).toMatchObject({
      ok: false,
      code: 'forbidden',
    });
    expect(mockSkipBlock).not.toHaveBeenCalled();
  });

  it('should not move the active block when another device started it first', async () => {
    mockStartBlock.mockResolvedValue(false);
    expect(await runPractice(coach('head_coach'), 'hc', { practiceId: PRACTICE, action: 'startBlock', blockId: THEIRS })).toMatchObject({ ok: true });
    expect(mockSetActive).not.toHaveBeenCalled();
  });

  it("should refuse a block from another practice, and round the block's actual minutes", async () => {
    const elsewhere = '55555555-5555-4555-8555-555555555555';
    expect(await runPractice(coach('head_coach'), 'hc', { practiceId: PRACTICE, action: 'startBlock', blockId: elsewhere })).toMatchObject({
      ok: false,
      code: 'invalid',
    });

    await runPractice(coach('head_coach'), 'hc', { practiceId: PRACTICE, action: 'completeBlock', blockId: MINE, actualDurationMinutes: 14.6 });
    expect(mockCompleteBlock).toHaveBeenCalledWith(expect.anything(), MINE, expect.any(String), 15);
  });
});
