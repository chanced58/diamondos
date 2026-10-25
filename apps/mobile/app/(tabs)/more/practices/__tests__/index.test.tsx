import { fireEvent, screen } from '@testing-library/react-native';
import { ApiError } from '../../../../../src/lib/api-client';
import { renderWithQuery } from '../../../../../src/__tests__/render-with-query';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  router: { push: (...args: unknown[]) => mockPush(...args) },
  // Render the header's right button so tests can press it.
  Stack: { Screen: ({ options }: { options?: { headerRight?: () => JSX.Element } }) => options?.headerRight?.() ?? null },
}));
jest.mock('../../../../../src/providers/RoleProvider', () => ({ useRole: () => ({ activeTeam: { teamId: 't1' }, loading: false }) }));
jest.mock('../../../../../src/features/teams/TeamSwitcher', () => ({ TeamSwitcher: () => null }));
const mockUsePractices = jest.fn();
jest.mock('../../../../../src/features/practices/practices-api', () => ({ usePractices: (id: string) => mockUsePractices(id) }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const PracticesIndex = require('../index').default;

const practice = (id: string, scheduledAt: string, extra = {}) => ({
  id, scheduledAt, durationMinutes: 90, location: 'Field 2', runStatus: 'not_started', isPrep: false, ...extra,
});

beforeEach(() => jest.clearAllMocks());

describe('PracticesIndex', () => {
  it('should list upcoming and past practices and open one', () => {
    mockUsePractices.mockReturnValue({
      data: {
        teamId: 't1',
        isCoach: false,
        practices: [practice('next', '2099-01-01T16:00:00Z', { isPrep: true }), practice('old', '2020-01-01T16:00:00Z', { runStatus: 'completed' })],
      },
    });
    renderWithQuery(<PracticesIndex />);

    expect(screen.getByText('Upcoming')).toBeTruthy();
    expect(screen.getByText('Past')).toBeTruthy();
    expect(screen.getByText('Game prep')).toBeTruthy();
    expect(screen.getByText('Done')).toBeTruthy();
    expect(screen.queryByLabelText('New practice')).toBeNull();

    fireEvent.press(screen.getAllByText('Field 2')[0]);
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/more/practices/[practiceId]', params: { practiceId: 'next' } });
  });

  it('should give coaches a new-practice button', () => {
    mockUsePractices.mockReturnValue({ data: { teamId: 't1', isCoach: true, practices: [] } });
    renderWithQuery(<PracticesIndex />);
    fireEvent.press(screen.getByLabelText('New practice'));
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/more/practices/new');
    expect(screen.getByText('Tap + to log a practice.')).toBeTruthy();
  });

  it('should explain a plan without practice planning', () => {
    mockUsePractices.mockReturnValue({ data: undefined, isPending: false, error: new ApiError('forbidden', 'no') });
    renderWithQuery(<PracticesIndex />);
    expect(screen.getByText('Practice planning is available on the Starter plan and above.')).toBeTruthy();
  });
});
