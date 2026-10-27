import {
  createLeaguePlayer,
  loadLeaguePlayer,
  loadLeaguePlayers,
  releaseLeaguePlayer,
  transferLeaguePlayer,
} from '../league-players';
import { fakeDb, type FakeCall, type FakeResult } from '../../__tests__/fake-db';

const LEAGUE = '11111111-1111-4111-8111-111111111111';
const PLAYER = '22222222-2222-4222-8222-222222222222';
const TEAM = '33333333-3333-4333-8333-333333333333';
const OTHER_TEAM = '44444444-4444-4444-8444-444444444444';

const staff = (role: string | null): FakeResult => ({
  data: role ? { role, leagues: { id: LEAGUE, name: 'Valley League' } } : null,
});
const members = {
  data: [
    { team_id: TEAM, opponent_team_id: null, is_active: true, division_id: 'd1', teams: { name: 'Hawks' } },
    { team_id: OTHER_TEAM, opponent_team_id: null, is_active: true, division_id: null, teams: { name: 'Eagles' } },
    { team_id: null, opponent_team_id: 'o1', is_active: true, division_id: null, teams: null },
    { team_id: 'inactive', opponent_team_id: null, is_active: false, division_id: null, teams: { name: 'Gone' } },
  ],
};

/** fakeDb with an `rpc` stub that answers `rpcResult` and records its calls. */
function withRpc(results: Parameters<typeof fakeDb>[0], rpcResult: FakeResult = {}) {
  const fake = fakeDb(results);
  const rpc = jest.fn().mockResolvedValue({ data: null, error: null, ...rpcResult });
  Object.assign(fake.db, { rpc });
  return { ...fake, rpc };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('loadLeaguePlayers', () => {
  it('should list the players with their teams, the league’s active platform teams and divisions', async () => {
    const { db, calls } = withRpc({
      'league_staff.select': staff('league_manager'),
      'league_players.select': {
        data: [
          { player: { id: PLAYER, first_name: 'Sam', last_name: 'Lee', jersey_number: 7, primary_position: 'pitcher', team_id: TEAM, team: { name: 'Hawks' } } },
          { player: { id: 'p2', first_name: 'Ava', last_name: 'Diaz', jersey_number: null, primary_position: null, team_id: null, team: null } },
        ],
      },
      'league_members.select': members,
      'league_divisions.select': { data: [{ id: 'd1', name: 'North' }] },
    });
    const result = await loadLeaguePlayers(db, 'u1', { leagueId: LEAGUE });
    expect(result).toEqual({
      ok: true,
      data: {
        league: { id: LEAGUE, name: 'Valley League' },
        canEdit: false,
        players: [
          { playerId: PLAYER, firstName: 'Sam', lastName: 'Lee', jerseyNumber: 7, primaryPosition: 'pitcher', teamId: TEAM, teamName: 'Hawks' },
          { playerId: 'p2', firstName: 'Ava', lastName: 'Diaz', jerseyNumber: null, primaryPosition: null, teamId: null, teamName: null },
        ],
        teams: [
          { teamId: OTHER_TEAM, name: 'Eagles', divisionId: null },
          { teamId: TEAM, name: 'Hawks', divisionId: 'd1' },
        ],
        divisions: [{ id: 'd1', name: 'North' }],
      },
    });
    expect(calls.find((c) => c.table === 'league_staff')?.filters).toEqual({ league_id: LEAGUE, user_id: 'u1', is_active: true });
    // Guest-only identities stay out, as on the web.
    expect(calls.find((c) => c.table === 'league_players')?.filters).toMatchObject({ league_id: LEAGUE, 'player.is_guest_only': false });
  });

  it('should hide the league from anyone who isn’t on its staff', async () => {
    const { db, calls } = withRpc({ 'league_staff.select': staff(null) });
    expect(await loadLeaguePlayers(db, 'u1', { leagueId: LEAGUE })).toMatchObject({ code: 'not_found' });
    expect(calls).toHaveLength(1);
  });
});

describe('loadLeaguePlayer', () => {
  const registration = (call: FakeCall): FakeResult => (call.filters.player_id === PLAYER ? { data: { player_id: PLAYER } } : { data: null });

  it('should return the player, their transfers and the teams to move them to', async () => {
    const { db } = withRpc({
      'league_staff.select': staff('league_admin'),
      'league_players.select': registration,
      'players.select': {
        data: {
          id: PLAYER, first_name: 'Sam', last_name: 'Lee', jersey_number: 7, date_of_birth: '2010-04-02', primary_position: 'pitcher',
          bats: 'right', throws: 'left', graduation_year: 2028, team_id: TEAM, team: [{ id: TEAM, name: 'Hawks' }],
        },
      },
      'player_transfers.select': {
        data: [{ id: 'tr1', transfer_type: 'trade', from_team: { name: 'Eagles' }, to_team: { name: 'Hawks' }, transferred_at: '2027-04-01T00:00:00Z', reason: 'Balance' }],
      },
      'league_members.select': members,
    });
    const result = await loadLeaguePlayer(db, 'u1', { leagueId: LEAGUE, playerId: PLAYER });
    expect(result.ok && result.data).toMatchObject({
      canEdit: true,
      player: { playerId: PLAYER, teamName: 'Hawks', dateOfBirth: '2010-04-02', bats: 'right', graduationYear: 2028 },
      transfers: [{ id: 'tr1', type: 'trade', fromTeamName: 'Eagles', toTeamName: 'Hawks', transferredAt: '2027-04-01T00:00:00Z', reason: 'Balance' }],
    });
  });

  it('should say not found for a player registered in another league', async () => {
    const { db, calls } = withRpc({ 'league_staff.select': staff('league_admin'), 'league_players.select': registration });
    expect(await loadLeaguePlayer(db, 'u1', { leagueId: LEAGUE, playerId: '55555555-5555-4555-8555-555555555555' })).toMatchObject({
      code: 'not_found',
    });
    expect(calls.some((c) => c.table === 'players')).toBe(false);
  });
});

describe('league player writes', () => {
  it('should refuse league managers, without calling the RPCs', async () => {
    const { db, rpc } = withRpc({ 'league_staff.select': staff('league_manager') });
    const forbidden = { code: 'forbidden', error: 'Only league admins can manage league players.' };
    expect(await createLeaguePlayer(db, 'u1', { leagueId: LEAGUE, firstName: 'A', lastName: 'B' })).toMatchObject(forbidden);
    expect(await transferLeaguePlayer(db, 'u1', { leagueId: LEAGUE, playerId: PLAYER, toTeamId: TEAM })).toMatchObject(forbidden);
    expect(await releaseLeaguePlayer(db, 'u1', { leagueId: LEAGUE, playerId: PLAYER })).toMatchObject(forbidden);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('should register a player with the actor as p_actor', async () => {
    const { db, rpc } = withRpc({ 'league_staff.select': staff('league_admin') }, { data: { id: PLAYER } });
    const result = await createLeaguePlayer(db, 'u1', { leagueId: LEAGUE, firstName: ' Sam ', lastName: 'Lee', jerseyNumber: 7, teamId: TEAM });
    expect(result).toEqual({ ok: true, data: { playerId: PLAYER } });
    expect(rpc).toHaveBeenCalledWith('fn_create_league_player', expect.objectContaining({
      p_league_id: LEAGUE,
      p_first_name: 'Sam',
      p_jersey_number: 7,
      p_team_id: TEAM,
      p_actor: 'u1',
    }));
  });

  it('should report a taken jersey on the new team as a conflict', async () => {
    const { db } = withRpc({ 'league_staff.select': staff('league_admin') }, { error: { code: '23505', message: 'duplicate key' } });
    expect(await createLeaguePlayer(db, 'u1', { leagueId: LEAGUE, firstName: 'A', lastName: 'B', jerseyNumber: 7, teamId: TEAM })).toMatchObject({
      code: 'conflict',
    });
  });

  it('should move a player, or hand back a jersey conflict to confirm', async () => {
    const moved = withRpc({ 'league_staff.select': staff('league_admin') }, { data: { id: 'tr1' } });
    expect(await transferLeaguePlayer(moved.db, 'u1', { leagueId: LEAGUE, playerId: PLAYER, toTeamId: TEAM, reason: 'Balance' })).toEqual({
      ok: true,
      data: { status: 'moved', transferId: 'tr1' },
    });
    expect(moved.rpc).toHaveBeenCalledWith('fn_transfer_player', expect.objectContaining({
      p_player_id: PLAYER,
      p_to_team_id: TEAM,
      p_reason: 'Balance',
      p_accept_jersey_clear: false,
      p_actor: 'u1',
    }));

    const clash = withRpc(
      { 'league_staff.select': staff('league_admin'), 'players.select': { data: { jersey_number: 7 } } },
      { error: { message: 'JERSEY_CONFLICT: Ava Diaz' } },
    );
    expect(await transferLeaguePlayer(clash.db, 'u1', { leagueId: LEAGUE, playerId: PLAYER, toTeamId: TEAM })).toEqual({
      ok: true,
      data: { status: 'jersey_conflict', jerseyNumber: 7, conflictingPlayerName: 'Ava Diaz' },
    });
  });

  it('should explain a player in a live game, or one already a free agent', async () => {
    const live = withRpc({ 'league_staff.select': staff('league_admin') }, { error: { message: 'IN_PROGRESS_GAME: abc' } });
    expect(await transferLeaguePlayer(live.db, 'u1', { leagueId: LEAGUE, playerId: PLAYER, toTeamId: TEAM })).toMatchObject({
      code: 'conflict',
      error: 'This player is in a game in progress. Finalize the game first.',
    });
    const free = withRpc({ 'league_staff.select': staff('league_admin') }, { error: { message: 'NOT_ON_TEAM' } });
    expect(await releaseLeaguePlayer(free.db, 'u1', { leagueId: LEAGUE, playerId: PLAYER, reason: 'Moved away' })).toMatchObject({
      code: 'conflict',
      error: 'That player is already a free agent.',
    });
    expect(free.rpc).toHaveBeenCalledWith('fn_release_player', expect.objectContaining({ p_reason: 'Moved away', p_actor: 'u1' }));
  });

  it('should hide an unexpected database error', async () => {
    const { db } = withRpc({ 'league_staff.select': staff('league_admin') }, { error: { message: 'connection reset' } });
    expect(await releaseLeaguePlayer(db, 'u1', { leagueId: LEAGUE, playerId: PLAYER })).toEqual({
      ok: false,
      code: 'failed',
      error: 'Something went wrong. Please try again.',
    });
  });
});
