import {
  addNewOpponentBatter,
  opponentDisplayName,
  rosterNotYetBatting,
  visibleOpponentRoster,
} from '../opponent-lineup';

const mockCreated: Array<Record<string, unknown>> = [];
jest.mock('../../../db', () => ({ database: {
  write: async (callback: () => Promise<void>) => callback(),
  batch: async (...rows: Array<Record<string, unknown>>) => { mockCreated.push(...rows); },
  get: (table: string) => ({
    query: () => ({ fetch: async () => [] }),
    prepareCreate: (callback: (row: Record<string, unknown>) => void) => {
      const row = { _raw: { id: '' }, table }; callback(row); return row;
    },
  }),
} }));

beforeEach(() => { mockCreated.length = 0; });

function rosterRow(
  remoteId: string,
  extra: { placeholderGameId?: string; isFillIn?: boolean } = {},
) {
  return { remoteId, placeholderGameId: extra.placeholderGameId, isFillIn: extra.isFillIn ?? false };
}

describe('visibleOpponentRoster', () => {
  it("should hide another game's placeholders from the roster picker", () => {
    const roster = [
      rosterRow('regular'),
      rosterRow('this-game', { placeholderGameId: 'lg-1' }),
      rosterRow('other-game', { placeholderGameId: 'lg-2' }),
    ];
    expect(visibleOpponentRoster(roster, 'lg-1').map((p) => p.remoteId)).toEqual(['regular', 'this-game']);
  });

  it('should hide fill-ins from the roster picker', () => {
    const roster = [rosterRow('regular'), rosterRow('fill-in', { placeholderGameId: 'lg-1', isFillIn: true })];
    expect(visibleOpponentRoster(roster, 'lg-1').map((p) => p.remoteId)).toEqual(['regular']);
  });

  it('should hide every placeholder on a game that is not a league game', () => {
    const roster = [rosterRow('regular'), rosterRow('placeholder', { placeholderGameId: 'lg-1' })];
    expect(visibleOpponentRoster(roster, undefined).map((p) => p.remoteId)).toEqual(['regular']);
  });
});

describe('rosterNotYetBatting', () => {
  it('should list roster players who are not yet batting under On their roster', () => {
    const roster = [rosterRow('a'), rosterRow('b'), rosterRow('c')];
    expect(rosterNotYetBatting(roster, ['b']).map((p) => p.remoteId)).toEqual(['a', 'c']);
  });
});

describe('addNewOpponentBatter', () => {
  it('should add an unknown player with no name as a placeholder for the league game', async () => {
    const result = await addNewOpponentBatter({
      gameRemoteId: 'game', opponentTeamId: 'roster-record',
      firstName: '', lastName: '', maxBatters: 12, placeholderGameId: 'lg-1',
    });

    expect(result.ok).toBe(true);
    const player = mockCreated.find((row) => row.table === 'opponent_players');
    expect(player).toMatchObject({
      firstName: '', lastName: '', jerseyNumber: undefined,
      placeholderGameId: 'lg-1', isFillIn: false,
    });
  });

  it('should still require a name or a jersey number outside a league game', async () => {
    const result = await addNewOpponentBatter({
      gameRemoteId: 'game', opponentTeamId: 'opponent', firstName: ' ', lastName: '', maxBatters: 12,
    });

    expect(result).toEqual({ ok: false, message: 'Enter a name or a jersey number.' });
    expect(mockCreated).toEqual([]);
  });
});

describe('opponentDisplayName', () => {
  it('should show an unknown player by jersey number', () => {
    expect(opponentDisplayName({ firstName: '', lastName: '', jerseyNumber: '12' }, 4)).toBe('#12');
  });

  it('should show an unknown player with no jersey by their place in the order', () => {
    expect(opponentDisplayName({ firstName: '', lastName: '' }, 4)).toBe('Batter 4');
  });
});
