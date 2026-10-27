import {
  addLeagueDivisionInputSchema,
  filterLeaguePlayers,
  groupLeagueTeamsByDivision,
  transferLeaguePlayerResponseSchema,
  type LeagueAdminPlayer,
  type LeagueTeamMembership,
} from '../league-admin';

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

describe('addLeagueDivisionInputSchema', () => {
  const LEAGUE = '11111111-1111-4111-8111-111111111111';
  it('should trim the name and ask for one', () => {
    expect(addLeagueDivisionInputSchema.parse({ leagueId: LEAGUE, name: '  North ' })).toEqual({ leagueId: LEAGUE, name: 'North' });
    const blank = addLeagueDivisionInputSchema.safeParse({ leagueId: LEAGUE, name: '   ' });
    expect(blank.success ? null : blank.error.issues[0].message).toBe('Name the division.');
  });
});

describe('groupLeagueTeamsByDivision', () => {
  const team = (membershipId: string, divisionId: string | null): LeagueTeamMembership => ({
    membershipId,
    name: membershipId,
    organization: null,
    divisionId,
    isOpponentTeam: false,
    isActive: true,
  });

  it('should group teams under their divisions in order, then those in none', () => {
    const groups = groupLeagueTeamsByDivision(
      [team('a', 'south'), team('b', null), team('c', 'north'), team('d', 'gone')],
      [{ id: 'north', name: 'North' }, { id: 'south', name: 'South' }],
    );
    expect(groups.map((g) => [g.name, g.teams.map((t) => t.membershipId)])).toEqual([
      ['North', ['c']],
      ['South', ['a']],
      ['No division', ['b', 'd']],
    ]);
  });

  it('should keep an empty division and leave out an empty "No division"', () => {
    expect(groupLeagueTeamsByDivision([], [{ id: 'north', name: 'North' }])).toEqual([{ divisionId: 'north', name: 'North', teams: [] }]);
  });
});
