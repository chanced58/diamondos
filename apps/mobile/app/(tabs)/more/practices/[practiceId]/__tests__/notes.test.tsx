import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { PracticeDetailResponse } from '@baseball/shared';
import { renderWithQuery } from '../../../../../../src/__tests__/render-with-query';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  router: { back: () => mockBack() },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ practiceId: 'p1' }),
}));
const mockUsePractice = jest.fn();
const mockSaveNotes = jest.fn();
jest.mock('../../../../../../src/features/practices/practices-api', () => ({
  practiceQueryKey: (id: string) => ['practices', id],
  usePractice: (id: string) => mockUsePractice(id),
  savePracticeNotes: (...args: unknown[]) => mockSaveNotes(...args),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const PracticeNotesScreen = require('../notes').default;

const detail = {
  data: {
    overallNotes: null,
    coach: {
      coachNotes: 'Private',
      players: [
        { id: 'sam', firstName: 'Sam', lastName: 'Lee', jerseyNumber: 7 },
        { id: 'ann', firstName: 'Ann', lastName: 'Coit', jerseyNumber: null },
      ],
      playerNotes: {},
      hitters: { totalReps: 0, hot: [], cold: [] },
    },
  } as unknown as PracticeDetailResponse,
};

beforeEach(() => jest.clearAllMocks());

describe('PracticeNotesScreen', () => {
  it("should save the notes and only the players whose notes changed", async () => {
    mockUsePractice.mockReturnValue(detail);
    mockSaveNotes.mockResolvedValue({ practiceId: 'p1' });
    renderWithQuery(<PracticeNotesScreen />);

    expect(screen.getByLabelText('Coach notes').props.value).toBe('Private');
    fireEvent.changeText(screen.getByLabelText('Overall notes'), 'Sharp day');
    fireEvent.press(screen.getByText(/Coit, Ann/));
    fireEvent.changeText(screen.getByLabelText('Hitting notes for Ann Coit'), 'Shorter stride');
    await act(async () => {
      fireEvent.press(screen.getByText('Save notes'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockSaveNotes).toHaveBeenCalledWith('p1', {
      overallNotes: 'Sharp day',
      coachNotes: 'Private',
      players: [{ playerId: 'ann', pitching: '', hitting: 'Shorter stride', fielding_catching: '', baserunning: '', athleticism: '', attitude: '' }],
    });
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it('should refuse anyone but a coach', () => {
    mockUsePractice.mockReturnValue({ data: { ...detail.data, coach: null } });
    renderWithQuery(<PracticeNotesScreen />);
    expect(screen.getByText('Only coaches write practice notes.')).toBeTruthy();
  });
});
