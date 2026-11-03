import { act, fireEvent, render } from '@testing-library/react-native';
import { ScrollView, TextInput } from 'react-native';
import { ThemeScope } from '../../../theme/ThemeScope';
import { GuestPlayerModal } from '../GuestPlayerModal';

jest.mock('../../../db', () => ({
  database: { get: jest.fn(() => ({ query: () => ({ fetch: () => Promise.resolve([]) }) })) },
  GameLineup: 'game_lineups',
  LeaguePlayer: 'league_players',
  Player: 'players',
}));
jest.mock('../../../providers/SyncProvider', () => ({
  useSyncContext: () => ({ triggerSync: jest.fn() }),
}));
jest.mock('../../lineup/local-guest', () => ({
  addExistingGuestToLineup: jest.fn(),
  createLocalGuest: jest.fn(),
}));

/**
 * The modal is shared: the scorer shows it under a Light scope, the lineup
 * screen under the themed root. Its keyboard follows the nearest scope.
 */
describe('GuestPlayerModal keyboard appearance', () => {
  const modal = (
    <GuestPlayerModal
      visible
      gameId="g1"
      teamId="t1"
      leagueId={null}
      defaultCountTowardStats
      maxBatters={9}
      onClose={() => {}}
    />
  );

  it.each([
    ['light', 'light'],
    ['dark', 'dark'],
    ['dugout', 'dark'],
  ] as const)('should give the new-guest inputs a %s scope the %s keyboard', (theme, expected) => {
    const { UNSAFE_getAllByType } = render(<ThemeScope theme={theme}>{modal}</ThemeScope>);

    const inputs = UNSAFE_getAllByType(TextInput);
    expect(inputs).toHaveLength(3);
    for (const input of inputs) {
      expect(input.props.keyboardAppearance).toBe(expected);
    }
  });

  it('should give the league pool search input the scope keyboard', async () => {
    const { UNSAFE_getAllByType, getByText } = render(
      <ThemeScope theme="dark">
        <GuestPlayerModal
          visible
          gameId="g1"
          teamId="t1"
          leagueId="l1"
          defaultCountTowardStats
          maxBatters={9}
          onClose={() => {}}
        />
      </ThemeScope>,
    );
    await act(async () => {
      fireEvent.press(getByText(/league pool/i));
    });

    const inputs = UNSAFE_getAllByType(TextInput);
    expect(inputs).toHaveLength(1);
    expect(inputs[0].props.keyboardAppearance).toBe('dark');
  });

  it.each([
    ['light', 'black'],
    ['dark', 'default'],
    ['dugout', 'default'],
  ] as const)('should give a %s scope the %s scroll indicator', (theme, expected) => {
    const { UNSAFE_getAllByType } = render(<ThemeScope theme={theme}>{modal}</ThemeScope>);

    const scrollViews = UNSAFE_getAllByType(ScrollView);
    expect(scrollViews.length).toBeGreaterThan(0);
    for (const scrollView of scrollViews) {
      expect(scrollView.props.indicatorStyle).toBe(expected);
    }
  });
});
