import { Alert } from 'react-native';
import { act, fireEvent, screen } from '@testing-library/react-native';
import type { PracticeRunBlock, PracticeRunResponse } from '@baseball/shared';
import { renderWithQuery } from '../../../../../../src/__tests__/render-with-query';

jest.mock('expo-router', () => ({
  __esModule: true,
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ practiceId: 'p1' }),
}));
jest.mock('../../../../../../src/lib/web-links', () => ({ webUrl: () => null, openOnWeb: jest.fn() }));

const mockUseRun = jest.fn();
const mockRun = jest.fn();
jest.mock('../../../../../../src/features/practices/practices-api', () => ({
  practiceQueryKey: (id: string) => ['practices', id],
  practiceRunQueryKey: (id: string) => ['practices', id, 'run'],
  usePracticeRun: (id: string) => mockUseRun(id),
  runPracticeAction: (...args: unknown[]) => mockRun(...args),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const PracticeRunScreen = require('../run').default;

const block = (id: string, position: number, status: string, extra: Partial<PracticeRunBlock> = {}): PracticeRunBlock => ({
  id, position, status, blockType: 'warmup', title: `Block ${id}`, plannedDurationMinutes: 10, actualDurationMinutes: null,
  startedAt: null, completedAt: null, notes: null, canControl: true, ...extra,
});
const runState = (runStatus: string, blocks: PracticeRunBlock[], canRunPractice = true): { data: PracticeRunResponse } => ({
  data: {
    practice: { id: 'p1', scheduledAt: '2026-10-25T23:00:00Z', status: 'scheduled', runStatus, startedAt: null, completedAt: null },
    canRunPractice,
    blocks,
  },
});

beforeEach(() => {
  jest.clearAllMocks();
  mockRun.mockImplementation(() => Promise.resolve(runState('running', []).data));
});

describe('PracticeRunScreen', () => {
  it('should let a head coach start the practice', async () => {
    mockUseRun.mockReturnValue(runState('not_started', [block('a', 1, 'pending'), block('b', 2, 'pending')]));
    renderWithQuery(<PracticeRunScreen />);
    expect(screen.getByText('2 blocks · 20 min total')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('▶ Start practice'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(mockRun).toHaveBeenCalledWith('p1', { action: 'start' });
  });

  it("should tell an assistant a head coach starts it", () => {
    mockUseRun.mockReturnValue(runState('not_started', [block('a', 1, 'pending')], false));
    renderWithQuery(<PracticeRunScreen />);
    expect(screen.getByText('A head coach or athletic director starts the practice.')).toBeTruthy();
    expect(screen.queryByText('▶ Start practice')).toBeNull();
  });

  it('should complete the active block and start the next one', async () => {
    const startedAt = new Date(Date.now() - 4 * 60_000).toISOString();
    mockUseRun.mockReturnValue(runState('running', [block('a', 1, 'active', { startedAt }), block('b', 2, 'pending')]));
    renderWithQuery(<PracticeRunScreen />);

    expect(screen.getByLabelText('Time remaining')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('✓ Complete block'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(mockRun).toHaveBeenNthCalledWith(1, 'p1', { action: 'completeBlock', blockId: 'a', actualDurationMinutes: 4 });
    expect(mockRun).toHaveBeenNthCalledWith(2, 'p1', { action: 'startBlock', blockId: 'b' });
  });

  it("should not offer controls on another coach's block", () => {
    mockUseRun.mockReturnValue(runState('running', [block('a', 1, 'pending', { canControl: false })], false));
    renderWithQuery(<PracticeRunScreen />);
    expect(screen.getByText('This block is run by its assigned coach.')).toBeTruthy();
    expect(screen.queryByText('Start this block')).toBeNull();
    expect(screen.queryByText('End practice early')).toBeNull();
  });

  it('should end the practice after confirming', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find((b) => b.text === 'End practice')?.onPress?.();
    });
    mockUseRun.mockReturnValue(runState('running', [block('a', 1, 'completed'), block('b', 2, 'skipped')]));
    renderWithQuery(<PracticeRunScreen />);
    expect(screen.getByText('All blocks completed.')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('End practice'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(mockRun).toHaveBeenCalledWith('p1', { action: 'complete' });
  });
});
