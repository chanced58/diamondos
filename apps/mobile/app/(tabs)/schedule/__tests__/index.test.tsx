import { fireEvent, render, screen } from '@testing-library/react-native';

/**
 * The Schedule tab hosts what used to be the Games tab (still the default
 * view) and the old Schedule screen behind a segmented control.
 */

// setParams writes the route param, which the screen reads back on render.
const mockParams: { view?: string } = {};
const mockSetParams = jest.fn((next: { view?: string }) => Object.assign(mockParams, next));
jest.mock('expo-router', () => ({
  __esModule: true,
  useLocalSearchParams: () => mockParams,
  router: { setParams: (next: { view?: string }) => mockSetParams(next) },
}));
jest.mock('../../../../src/features/games/GamesList', () => {
  const { Text } = jest.requireActual('react-native');
  return { GamesScreen: () => <Text>games list</Text> };
});
jest.mock('../../../../src/features/schedule/ScheduleList', () => {
  const { Text } = jest.requireActual('react-native');
  return { ScheduleList: () => <Text>full schedule</Text> };
});
jest.mock('../../../../src/features/teams/TeamSwitcher', () => {
  const { Text } = jest.requireActual('react-native');
  return { TeamSwitcher: () => <Text>team switcher</Text> };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ScheduleTabScreen = require('../index').default;

describe('schedule tab', () => {
  beforeEach(() => {
    delete mockParams.view;
    mockSetParams.mockClear();
  });

  it('opens on the games list with the team switcher', () => {
    render(<ScheduleTabScreen />);

    expect(screen.getByText('games list')).toBeTruthy();
    expect(screen.getByText('team switcher')).toBeTruthy();
    expect(screen.queryByText('full schedule')).toBeNull();
  });

  it('switches segments through the route param', () => {
    const { rerender } = render(<ScheduleTabScreen />);

    fireEvent.press(screen.getByRole('tab', { name: 'Full schedule' }));
    expect(mockSetParams).toHaveBeenLastCalledWith({ view: 'all' });
    rerender(<ScheduleTabScreen />);
    expect(screen.getByText('full schedule')).toBeTruthy();

    fireEvent.press(screen.getByRole('tab', { name: 'Games' }));
    expect(mockSetParams).toHaveBeenLastCalledWith({ view: 'games' });
    rerender(<ScheduleTabScreen />);
    expect(screen.getByText('games list')).toBeTruthy();
  });

  it('follows a later link even after a manual segment change', () => {
    // Linked to games, user switches to the full schedule by hand…
    mockParams.view = 'games';
    const { rerender } = render(<ScheduleTabScreen />);
    fireEvent.press(screen.getByRole('tab', { name: 'Full schedule' }));
    rerender(<ScheduleTabScreen />);
    expect(screen.getByText('full schedule')).toBeTruthy();

    // …then Home's "Today's Games" links view=games again.
    mockParams.view = 'games';
    rerender(<ScheduleTabScreen />);
    expect(screen.getByText('games list')).toBeTruthy();
  });

  it('opens on the full schedule when linked with ?view=all', () => {
    mockParams.view = 'all';

    render(<ScheduleTabScreen />);

    expect(screen.getByText('full schedule')).toBeTruthy();
  });
});
