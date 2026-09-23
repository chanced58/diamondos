import { render, screen, fireEvent } from '@testing-library/react-native';
import PlayerCardScreen from '../card';
import type { TeamMembership } from '../../../../../src/providers/RoleProvider';

/**
 * Covers M3: a coach with no `playerId` used to see the player-roster
 * "nothing to show here" copy and a raw `practices/[practiceId]/card` title —
 * the only way a coach actually lands here, since `pre_practice` push
 * notifications route unconditionally to this screen regardless of role
 * (see w6-brief.md part 3; `notifications.ts` is intentionally left
 * unchanged, so this screen is the fix point).
 */

const mockUseRole = jest.fn();
const mockUseLocalSearchParams = jest.fn();
const mockRouterReplace = jest.fn();

jest.mock('../../../../../src/providers/RoleProvider', () => ({
  useRole: () => mockUseRole(),
}));

jest.mock('../../../../../src/lib/supabase', () => ({
  getSupabaseClient: jest.fn(),
}));

jest.mock('@baseball/database', () => ({
  getPracticeWithBlocks: jest.fn(),
}));

jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  const { Text } = jest.requireActual('react-native');
  return {
    __esModule: true,
    useLocalSearchParams: () => mockUseLocalSearchParams(),
    useRouter: () => ({ replace: mockRouterReplace }),
    Stack: {
      Screen: ({ options }: { options?: { title?: string } }) =>
        React.createElement(Text, { testID: 'stack-screen-title' }, options?.title ?? ''),
    },
  };
});

function mkTeam(overrides: Partial<TeamMembership> = {}): TeamMembership {
  return {
    teamId: 'team-1',
    teamName: 'Wildcats',
    role: 'head_coach',
    isCoach: true,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseLocalSearchParams.mockReturnValue({ practiceId: 'practice-42' });
});

describe('PlayerCardScreen — no playerId gate', () => {
  it('a coach sees the coach copy, not the roster-membership copy, plus an Open attendance control', () => {
    mockUseRole.mockReturnValue({
      activeTeam: mkTeam({ isCoach: true, playerId: undefined }),
      loading: false,
    });

    render(<PlayerCardScreen />);

    expect(
      screen.getByText("This is the player's practice card. As a coach, open attendance instead."),
    ).toBeTruthy();
    expect(
      screen.queryByText("You are not on this team's roster, so there's nothing to show here."),
    ).toBeNull();
    expect(screen.getByText('Open attendance')).toBeTruthy();

    // The route title must still resolve — never the raw Expo Router segment —
    // even on this gated branch, not just the eventual success branch.
    expect(screen.getByTestId('stack-screen-title').props.children).toBe('My Practice');
  });

  it('a non-coach (e.g. a parent) sees the original copy and no Open attendance control', () => {
    mockUseRole.mockReturnValue({
      activeTeam: mkTeam({ isCoach: false, playerId: undefined }),
      loading: false,
    });

    render(<PlayerCardScreen />);

    expect(
      screen.getByText("You are not on this team's roster, so there's nothing to show here."),
    ).toBeTruthy();
    expect(
      screen.queryByText("This is the player's practice card. As a coach, open attendance instead."),
    ).toBeNull();
    expect(screen.queryByText('Open attendance')).toBeNull();

    expect(screen.getByTestId('stack-screen-title').props.children).toBe('My Practice');
  });

  it('Open attendance replaces to the attendance route for the same practiceId', () => {
    mockUseRole.mockReturnValue({
      activeTeam: mkTeam({ isCoach: true, playerId: undefined }),
      loading: false,
    });

    render(<PlayerCardScreen />);
    fireEvent.press(screen.getByText('Open attendance'));

    expect(mockRouterReplace).toHaveBeenCalledWith({
      pathname: '/(tabs)/practices/[practiceId]/attendance',
      params: { practiceId: 'practice-42' },
    });
  });
});
