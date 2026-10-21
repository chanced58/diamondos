import { fireEvent, render, screen } from '@testing-library/react-native';

/**
 * The Schedule tab hosts what used to be the Games tab (still the default
 * view) and the old Schedule screen behind a segmented control.
 */

const mockParams: { view?: string } = {};
jest.mock('expo-router', () => ({ __esModule: true, useLocalSearchParams: () => mockParams }));
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
  });

  it('opens on the games list with the team switcher', () => {
    render(<ScheduleTabScreen />);

    expect(screen.getByText('games list')).toBeTruthy();
    expect(screen.getByText('team switcher')).toBeTruthy();
    expect(screen.queryByText('full schedule')).toBeNull();
  });

  it('switches to the full schedule and back', () => {
    render(<ScheduleTabScreen />);

    fireEvent.press(screen.getByRole('tab', { name: 'Full schedule' }));
    expect(screen.getByText('full schedule')).toBeTruthy();

    fireEvent.press(screen.getByRole('tab', { name: 'Games' }));
    expect(screen.getByText('games list')).toBeTruthy();
  });

  it('follows a later link to the already-mounted tab', () => {
    const { rerender } = render(<ScheduleTabScreen />);
    expect(screen.getByText('games list')).toBeTruthy();

    mockParams.view = 'all';
    rerender(<ScheduleTabScreen />);
    expect(screen.getByText('full schedule')).toBeTruthy();

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
