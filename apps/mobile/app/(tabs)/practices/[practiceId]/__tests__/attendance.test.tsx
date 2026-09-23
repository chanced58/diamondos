import { render, screen } from '@testing-library/react-native';
import AttendanceScreen from '../attendance';
import type { TeamMembership } from '../../../../../src/providers/RoleProvider';

/**
 * Covers the sibling half of M3: attendance.tsx has the identical
 * `<Stack.Screen>`-inside-the-success-return bug as card.tsx, so its
 * not-a-coach branch also used to fall back to the raw route segment as
 * the nav title. See w6-brief.md part 1.
 */

const mockUseRole = jest.fn();
const mockUseAuth = jest.fn();
const mockUseLocalSearchParams = jest.fn();

jest.mock('../../../../../src/providers/RoleProvider', () => ({
  useRole: () => mockUseRole(),
}));

jest.mock('../../../../../src/providers/AuthProvider', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('../../../../../src/lib/supabase', () => ({
  getSupabaseClient: jest.fn(),
}));

jest.mock('@baseball/database', () => ({
  listPracticeAttendance: jest.fn(),
  upsertPracticeAttendance: jest.fn(),
}));

jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  const { Text } = jest.requireActual('react-native');
  return {
    __esModule: true,
    useLocalSearchParams: () => mockUseLocalSearchParams(),
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
    role: 'parent',
    isCoach: false,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseLocalSearchParams.mockReturnValue({ practiceId: 'practice-42' });
  mockUseAuth.mockReturnValue({ user: { id: 'user-1' } });
  // The roster-fetch effect runs regardless of role (it isn't gated the way
  // card.tsx's fetch is) and hits the stubbed, unimplemented supabase client
  // above, which it correctly catches and logs — expected noise, not a
  // real failure, so it's silenced rather than left to clutter test output.
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('AttendanceScreen — not-a-coach gate', () => {
  it('shows the resolved title, not the raw route segment, alongside the coach-only copy', () => {
    mockUseRole.mockReturnValue({
      activeTeam: mkTeam({ isCoach: false }),
      loading: false,
    });

    render(<AttendanceScreen />);

    expect(screen.getByText('Only coaches can take attendance.')).toBeTruthy();
    expect(screen.getByTestId('stack-screen-title').props.children).toBe('Attendance');
  });

  it('shows the resolved title on the loading branch too', () => {
    mockUseRole.mockReturnValue({ activeTeam: null, loading: true });

    render(<AttendanceScreen />);

    expect(screen.getByTestId('stack-screen-title').props.children).toBe('Attendance');
  });
});
