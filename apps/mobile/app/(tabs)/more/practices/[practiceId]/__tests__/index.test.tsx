import { Alert } from 'react-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { PracticeDetailResponse } from '@baseball/shared';
import { renderWithQuery } from '../../../../../../src/__tests__/render-with-query';

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  router: { push: (...args: unknown[]) => mockPush(...args), back: () => mockBack() },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ practiceId: 'p1' }),
}));
jest.mock('../../../../../../src/lib/web-links', () => ({ webUrl: () => 'https://example.com/', openOnWeb: jest.fn() }));

const mockUsePractice = jest.fn();
const mockCancel = jest.fn();
const mockSavePlan = jest.fn();
const mockLogRep = jest.fn();
const mockSaveSelf = jest.fn();
jest.mock('../../../../../../src/features/practices/practices-api', () => ({
  practiceQueryKey: (id: string) => ['practices', id],
  practicesQueryKey: (id: string) => ['teams', id, 'practices'],
  usePractice: (id: string) => mockUsePractice(id),
  cancelPractice: (...args: unknown[]) => mockCancel(...args),
  savePracticePlan: (...args: unknown[]) => mockSavePlan(...args),
  logPracticeRep: (...args: unknown[]) => mockLogRep(...args),
  savePracticeSelfNotes: (...args: unknown[]) => mockSaveSelf(...args),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const PracticeScreen = require('../index').default;

const notes = (extra = {}) => ({ pitching: null, hitting: null, fielding_catching: null, baserunning: null, athleticism: null, attitude: null, playerNotes: null, ...extra });
const base = (extra: Partial<PracticeDetailResponse>): { data: PracticeDetailResponse } => ({
  data: {
    practice: {
      id: 'p1', teamId: 't1', scheduledAt: '2026-10-25T23:00:00Z', durationMinutes: 90, location: 'Field 2', address: null,
      latitude: null, longitude: null, status: 'scheduled', runStatus: 'not_started', plan: 'BP then situations', prep: null,
    },
    viewer: 'member',
    overallNotes: 'Great energy',
    coach: null,
    myPlayers: [],
    ...extra,
  },
});
const coachView = base({
  viewer: 'coach',
  coach: {
    coachNotes: null,
    players: [{ id: 'sam', firstName: 'Sam', lastName: 'Lee', jerseyNumber: 7 }],
    playerNotes: {},
    hitters: { totalReps: 6, hot: [{ playerId: 'sam', rank: 1, qualityReps: 5, totalReps: 6 }], cold: [] },
  },
});

beforeEach(() => jest.clearAllMocks());

describe('PracticeScreen', () => {
  it('should give a coach the runner, attendance, notes, rep logging and hot hitters', async () => {
    mockUsePractice.mockReturnValue(coachView);
    mockLogRep.mockResolvedValue({ practiceId: 'p1' });
    renderWithQuery(<PracticeScreen />);

    fireEvent.press(screen.getByText('Run practice'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/more/practices/[practiceId]/run', params: { practiceId: 'p1' } });
    fireEvent.press(screen.getByText('Practice notes'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/more/practices/[practiceId]/notes', params: { practiceId: 'p1' } });
    expect(screen.getByText(/Lee, Sam #7/)).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Log Line drive'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(mockLogRep).toHaveBeenCalledWith('p1', { playerId: 'sam', outcome: 'line_drive', coachTag: null });
    await waitFor(() => expect(screen.getByText('Logged: Line drive for Sam Lee')).toBeTruthy());
  });

  it('should save an edited plan', async () => {
    mockUsePractice.mockReturnValue(coachView);
    mockSavePlan.mockResolvedValue({ practiceId: 'p1' });
    renderWithQuery(<PracticeScreen />);

    expect(screen.queryByText('Save plan')).toBeNull();
    fireEvent.changeText(screen.getByLabelText('Practice plan'), 'Bunting');
    await act(async () => {
      fireEvent.press(screen.getByText('Save plan'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(mockSavePlan).toHaveBeenCalledWith('p1', 'Bunting');
  });

  it('should cancel with the team notified, then go back', async () => {
    mockUsePractice.mockReturnValue(coachView);
    mockCancel.mockResolvedValue({ practiceId: 'p1' });
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find((b) => b.text === 'Cancel and notify team')?.onPress?.();
    });
    renderWithQuery(<PracticeScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText('Cancel practice'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(mockCancel).toHaveBeenCalledWith('p1', expect.objectContaining({ notifyTeam: true }));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it('should show a player the plan, overall notes, coach notes and their own editable notes', async () => {
    mockUsePractice.mockReturnValue(
      base({ viewer: 'player', myPlayers: [{ playerId: 'sam', name: 'Sam Lee', canEditSelfNotes: true, notes: notes({ hitting: 'Stay back' }) }] }),
    );
    mockSaveSelf.mockResolvedValue({ practiceId: 'p1' });
    renderWithQuery(<PracticeScreen />);

    expect(screen.getByText('BP then situations')).toBeTruthy();
    expect(screen.getByText('Great energy')).toBeTruthy();
    expect(screen.getByText('Stay back')).toBeTruthy();
    expect(screen.queryByText('Run practice')).toBeNull();
    fireEvent.press(screen.getByText('My rotation'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/more/practices/[practiceId]/card', params: { practiceId: 'p1' } });

    fireEvent.changeText(screen.getByLabelText('My notes'), 'Felt good');
    await act(async () => {
      fireEvent.press(screen.getByText('Save my notes'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(mockSaveSelf).toHaveBeenCalledWith('p1', 'sam', 'Felt good');
  });

  it("should show a parent each child's notes read-only", () => {
    mockUsePractice.mockReturnValue(
      base({ viewer: 'parent', myPlayers: [{ playerId: 'sam', name: 'Sam Lee', canEditSelfNotes: false, notes: notes({ playerNotes: 'Felt good' }) }] }),
    );
    renderWithQuery(<PracticeScreen />);
    expect(screen.getByText('Sam Lee')).toBeTruthy();
    expect(screen.getByText('Felt good')).toBeTruthy();
    expect(screen.queryByLabelText('My notes')).toBeNull();
  });
});
