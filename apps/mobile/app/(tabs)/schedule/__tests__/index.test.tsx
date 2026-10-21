import { Alert } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

/**
 * The Schedule tab hosts the Games list (still the default view) and the
 * month calendar behind a segmented control, plus the coaches' "+" for adding
 * games and team events.
 */

// setParams writes the route param, which the screen reads back on render.
const mockParams: { view?: string } = {};
const mockSetParams = jest.fn((next: { view?: string }) => Object.assign(mockParams, next));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  useLocalSearchParams: () => mockParams,
  router: {
    setParams: (next: { view?: string }) => mockSetParams(next),
    push: (...args: unknown[]) => mockPush(...args),
  },
  // Render the header's right button so the test can press it.
  Stack: { Screen: ({ options }: { options?: { headerRight?: () => JSX.Element } }) => options?.headerRight?.() ?? null },
}));
jest.mock('../../../../src/features/games/GamesList', () => {
  const { Text } = jest.requireActual('react-native');
  return { GamesScreen: () => <Text>games list</Text> };
});
jest.mock('../../../../src/features/schedule/ScheduleCalendar', () => {
  const { Text } = jest.requireActual('react-native');
  return { ScheduleCalendar: () => <Text>calendar</Text> };
});
jest.mock('../../../../src/features/teams/TeamSwitcher', () => {
  const { Text } = jest.requireActual('react-native');
  return { TeamSwitcher: () => <Text>team switcher</Text> };
});
const mockUseRole = jest.fn();
jest.mock('../../../../src/providers/RoleProvider', () => ({ useRole: () => mockUseRole() }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ScheduleTabScreen = require('../index').default;

describe('schedule tab', () => {
  beforeEach(() => {
    delete mockParams.view;
    jest.clearAllMocks();
    mockUseRole.mockReturnValue({ activeTeam: { teamId: 't1', teamName: 'Huskies', isCoach: false } });
  });

  it('opens on the games list with the team switcher', () => {
    render(<ScheduleTabScreen />);

    expect(screen.getByText('games list')).toBeTruthy();
    expect(screen.getByText('team switcher')).toBeTruthy();
    expect(screen.queryByText('calendar')).toBeNull();
  });

  it('switches segments through the route param', () => {
    const { rerender } = render(<ScheduleTabScreen />);

    fireEvent.press(screen.getByRole('tab', { name: 'Calendar' }));
    expect(mockSetParams).toHaveBeenLastCalledWith({ view: 'all' });
    rerender(<ScheduleTabScreen />);
    expect(screen.getByText('calendar')).toBeTruthy();

    fireEvent.press(screen.getByRole('tab', { name: 'Games' }));
    expect(mockSetParams).toHaveBeenLastCalledWith({ view: 'games' });
    rerender(<ScheduleTabScreen />);
    expect(screen.getByText('games list')).toBeTruthy();
  });

  it('follows a later link even after a manual segment change', () => {
    // Linked to games, user switches to the calendar by hand…
    mockParams.view = 'games';
    const { rerender } = render(<ScheduleTabScreen />);
    fireEvent.press(screen.getByRole('tab', { name: 'Calendar' }));
    rerender(<ScheduleTabScreen />);
    expect(screen.getByText('calendar')).toBeTruthy();

    // …then Home's "Today's Games" links view=games again.
    mockParams.view = 'games';
    rerender(<ScheduleTabScreen />);
    expect(screen.getByText('games list')).toBeTruthy();
  });

  it('opens on the calendar when linked with ?view=all', () => {
    mockParams.view = 'all';

    render(<ScheduleTabScreen />);

    expect(screen.getByText('calendar')).toBeTruthy();
  });

  it('should only give coaches the add button', () => {
    render(<ScheduleTabScreen />);
    expect(screen.queryByLabelText('Add to schedule')).toBeNull();
  });

  it('should let a coach add a game or a team event', () => {
    mockUseRole.mockReturnValue({ activeTeam: { teamId: 't1', teamName: 'Huskies', isCoach: true } });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    render(<ScheduleTabScreen />);
    fireEvent.press(screen.getByLabelText('Add to schedule'));

    expect(alert.mock.calls[0][0]).toBe('Add to Huskies');
    const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    buttons.find((b) => b.text === 'Game')?.onPress?.();
    buttons.find((b) => b.text === 'Team event')?.onPress?.();
    expect(mockPush.mock.calls).toEqual([['/(tabs)/schedule/games/new'], ['/(tabs)/schedule/events/new']]);
    alert.mockRestore();
  });
});
