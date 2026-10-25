import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderWithQuery } from '../../../../../src/__tests__/render-with-query';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  router: { replace: (...args: unknown[]) => mockReplace(...args) },
  Stack: { Screen: () => null },
}));
const mockRole = jest.fn();
jest.mock('../../../../../src/providers/RoleProvider', () => ({ useRole: () => mockRole() }));
jest.mock('../../../../../src/features/places/VenueSearchField', () => ({ VenueSearchField: () => null }));
const mockCreate = jest.fn();
jest.mock('../../../../../src/features/practices/practices-api', () => ({
  practicesQueryKey: (id: string) => ['teams', id, 'practices'],
  createPractice: (...args: unknown[]) => mockCreate(...args),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const NewPracticeScreen = require('../new').default;
const TEAM = '11111111-1111-4111-8111-111111111111';

beforeEach(() => jest.clearAllMocks());

describe('NewPracticeScreen', () => {
  it('should create the practice and open it', async () => {
    mockRole.mockReturnValue({ activeTeam: { teamId: TEAM, isCoach: true } });
    mockCreate.mockResolvedValue({ practiceId: 'p1' });
    renderWithQuery(<NewPracticeScreen />);

    fireEvent.changeText(screen.getByLabelText('Duration in minutes'), '75');
    fireEvent(screen.getByLabelText('Notify team'), 'valueChange', true);
    await act(async () => {
      fireEvent.press(screen.getByText('Create practice'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ teamId: TEAM, durationMinutes: 75, notifyTeam: true }));
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith({ pathname: '/(tabs)/more/practices/[practiceId]', params: { practiceId: 'p1' } }),
    );
  });

  it('should stop a bad duration before sending, and turn away non-coaches', async () => {
    mockRole.mockReturnValue({ activeTeam: { teamId: TEAM, isCoach: true } });
    const { unmount } = renderWithQuery(<NewPracticeScreen />);
    fireEvent.changeText(screen.getByLabelText('Duration in minutes'), '90.5');
    await act(async () => {
      fireEvent.press(screen.getByText('Create practice'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(mockCreate).not.toHaveBeenCalled();
    unmount();

    mockRole.mockReturnValue({ activeTeam: { teamId: TEAM, isCoach: false } });
    renderWithQuery(<NewPracticeScreen />);
    expect(screen.getByText('Only coaches can log practices.')).toBeTruthy();
  });
});
