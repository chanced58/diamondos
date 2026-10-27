import { filterLeaguePlayers, transferLeaguePlayerResponseSchema, type LeagueAdminPlayer } from '../league-admin';

const player = (extra: Partial<LeagueAdminPlayer>): LeagueAdminPlayer => ({
  playerId: 'p',
  firstName: 'Sam',
  lastName: 'Lee',
  jerseyNumber: null,
  primaryPosition: null,
  teamId: null,
  teamName: null,
  ...extra,
});
const players = [
  player({ playerId: 'a', firstName: 'Ava', lastName: 'Diaz', jerseyNumber: 7, teamId: 't1', teamName: 'Hawks' }),
  player({ playerId: 'b', firstName: 'Ben', lastName: 'Cole', jerseyNumber: 12, teamId: 't2', teamName: 'Owls' }),
  player({ playerId: 'c', firstName: 'Cy', lastName: 'Park' }),
];
const teams = [
  { teamId: 't1', name: 'Hawks', divisionId: 'north' },
  { teamId: 't2', name: 'Owls', divisionId: 'south' },
];
const ids = (filter: Partial<Parameters<typeof filterLeaguePlayers>[2]>) =>
  filterLeaguePlayers(players, teams, { search: '', teamId: '', divisionId: '', ...filter }).map((p) => p.playerId);

describe('filterLeaguePlayers', () => {
  it('should list everyone with no filters', () => {
    expect(ids({})).toEqual(['a', 'b', 'c']);
  });

  it('should filter by team, free agents and division', () => {
    expect(ids({ teamId: 't2' })).toEqual(['b']);
    expect(ids({ teamId: 'free' })).toEqual(['c']);
    expect(ids({ divisionId: 'north' })).toEqual(['a']);
    // Free agents have no division, so it is ignored while viewing them.
    expect(ids({ teamId: 'free', divisionId: 'north' })).toEqual(['c']);
  });

  it('should search names and jersey numbers', () => {
    expect(ids({ search: ' cole ' })).toEqual(['b']);
    expect(ids({ search: '#7' })).toEqual(['a']);
  });
});

describe('transferLeaguePlayerResponseSchema', () => {
  it('should read a move or a jersey conflict', () => {
    expect(transferLeaguePlayerResponseSchema.parse({ status: 'moved', transferId: 'x' })).toEqual({ status: 'moved', transferId: 'x' });
    expect(
      transferLeaguePlayerResponseSchema.parse({ status: 'jersey_conflict', jerseyNumber: 7, conflictingPlayerName: 'Ava Diaz' }),
    ).toMatchObject({ status: 'jersey_conflict' });
  });
});
