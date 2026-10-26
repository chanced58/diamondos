import {
  createRosterPlayer,
  deactivateRosterPlayer,
  loadRosterPlayer,
  reactivateRosterPlayer,
  updateRosterPlayer,
} from '../roster-players';
import { fakeDb, type FakeCall } from '../../__tests__/fake-db';

const mockGetRosterAccess = jest.fn();
const mockGetPlayerAccess = jest.fn();
jest.mock('@/lib/roster-access', () => ({
  getRosterAccess: (...args: unknown[]) => mockGetRosterAccess(...args),
  getPlayerAccess: (...args: unknown[]) => mockGetPlayerAccess(...args),
}));

const TEAM = '11111111-1111-4111-8111-111111111111';
const PLAYER = '22222222-2222-4222-8222-222222222222';
const MANAGER = { canView: true, canManage: true, role: 'head_coach' };
const VIEWER = { canView: true, canManage: false, role: 'parent' };
const STRANGER = { canView: false, canManage: false, role: null };

const row = (extra = {}) => ({
  id: PLAYER,
  team_id: TEAM,
  first_name: 'Sam',
  last_name: 'Lee',
  jersey_number: 7,
  primary_position: 'shortstop',
  secondary_positions: ['pitcher'],
  bats: 'right',
  throws: 'right',
  graduation_year: 2027,
  email: 'sam@example.com',
  phone: null,
  is_active: true,
  disabled_at: null,
  ...extra,
});
const fields = (extra = {}) => ({ firstName: 'Sam', lastName: 'Lee', jerseyNumber: 7, primaryPosition: 'shortstop', ...extra });
const writes = (calls: FakeCall[], table: string) => calls.filter((c) => c.table === table && c.op !== 'select');

function withAuth(db: ReturnType<typeof fakeDb>['db'], inviteError: unknown = null) {
  const inviteUserByEmail = jest.fn().mockResolvedValue({ data: {}, error: inviteError });
  Object.assign(db, { auth: { admin: { inviteUserByEmail } } });
  return inviteUserByEmail;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  mockGetRosterAccess.mockResolvedValue(MANAGER);
  mockGetPlayerAccess.mockResolvedValue(MANAGER);
});

describe('loadRosterPlayer', () => {
  it('should return the player and whether the viewer manages the roster', async () => {
    mockGetPlayerAccess.mockResolvedValue(VIEWER);
    const { db, calls } = fakeDb({ 'players.select': { data: row() } });
    const result = await loadRosterPlayer(db, 'u1', { teamId: TEAM, playerId: PLAYER });
    expect(result).toEqual({
      ok: true,
      data: {
        canManage: false,
        player: expect.objectContaining({ id: PLAYER, firstName: 'Sam', jerseyNumber: 7, secondaryPositions: ['pitcher'], isActive: true }),
      },
    });
    expect(mockGetPlayerAccess).toHaveBeenCalledWith(db, TEAM, PLAYER, 'u1');
    expect(calls[0].filters).toEqual({ id: PLAYER, team_id: TEAM });
  });

  it('should say not found to someone who may not open the player', async () => {
    mockGetPlayerAccess.mockResolvedValue(STRANGER);
    const { db, calls } = fakeDb({ 'players.select': { data: row() } });
    expect(await loadRosterPlayer(db, 'u1', { teamId: TEAM, playerId: PLAYER })).toMatchObject({ ok: false, code: 'not_found' });
    expect(calls).toHaveLength(0);
  });
});

describe('createRosterPlayer', () => {
  it('should refuse a viewer who cannot manage, and hide the team from a stranger', async () => {
    mockGetRosterAccess.mockResolvedValueOnce(VIEWER).mockResolvedValueOnce(STRANGER);
    const { db, calls } = fakeDb();
    expect(await createRosterPlayer(db, 'u1', { teamId: TEAM, ...fields() })).toMatchObject({ code: 'forbidden' });
    expect(await createRosterPlayer(db, 'u1', { teamId: TEAM, ...fields() })).toMatchObject({ code: 'not_found' });
    expect(calls).toHaveLength(0);
  });

  it('should validate the fields with the shared schema', async () => {
    const { db } = fakeDb();
    expect(await createRosterPlayer(db, 'u1', { teamId: TEAM, ...fields({ firstName: ' ' }) })).toMatchObject({ code: 'invalid' });
    expect(await createRosterPlayer(db, 'u1', { teamId: TEAM, ...fields({ jerseyNumber: 100 }) })).toMatchObject({ code: 'invalid' });
    expect(await createRosterPlayer(db, 'u1', { teamId: TEAM, ...fields({ secondaryPositions: ['goalie'] }) })).toMatchObject({ code: 'invalid' });
  });

  it('should add the player and their membership, and invite them by email', async () => {
    const { db, calls } = fakeDb({ 'players.insert': { data: { id: PLAYER } } });
    const invite = withAuth(db);
    const result = await createRosterPlayer(db, 'u1', { teamId: TEAM, ...fields({ email: ' Sam@Example.com ', secondaryPositions: ['pitcher'] }) });

    expect(result).toEqual({ ok: true, data: { playerId: PLAYER, invited: true } });
    expect(writes(calls, 'players')[0].payload).toMatchObject({
      team_id: TEAM,
      first_name: 'Sam',
      jersey_number: 7,
      secondary_positions: ['pitcher'],
      email: 'sam@example.com',
      phone: null,
      bats: null,
    });
    expect(writes(calls, 'player_team_memberships')[0].payload).toEqual({ player_id: PLAYER, team_id: TEAM, jersey_number: 7, is_active: true });
    expect(invite).toHaveBeenCalledWith('sam@example.com', expect.objectContaining({ data: expect.objectContaining({ invited_as_player: PLAYER }) }));
    expect(writes(calls, 'team_invitations')[0].payload).toMatchObject({ team_id: TEAM, email: 'sam@example.com', role: 'player', status: 'pending' });
  });

  it('should not invite a player without an email', async () => {
    const { db, calls } = fakeDb({ 'players.insert': { data: { id: PLAYER } } });
    const invite = withAuth(db);
    expect(await createRosterPlayer(db, 'u1', { teamId: TEAM, ...fields() })).toEqual({ ok: true, data: { playerId: PLAYER, invited: false } });
    expect(invite).not.toHaveBeenCalled();
    expect(writes(calls, 'team_invitations')).toHaveLength(0);
  });

  it('should report a taken jersey and remove the player it just added', async () => {
    const { db, calls } = fakeDb({
      'players.insert': { data: { id: PLAYER } },
      'player_team_memberships.insert': { error: { code: '23505', message: 'duplicate key' } },
    });
    expect(await createRosterPlayer(db, 'u1', { teamId: TEAM, ...fields() })).toEqual({
      ok: false,
      code: 'conflict',
      error: 'Jersey #7 is already taken on this team.',
    });
    const removal = writes(calls, 'players').find((c) => c.op === 'delete');
    expect(removal?.filters).toEqual({ id: PLAYER, team_id: TEAM });
  });
});

describe('updateRosterPlayer', () => {
  it('should move the membership jersey before the player, replacing every field', async () => {
    const { db, calls } = fakeDb({ 'players.select': { data: row() } });
    const result = await updateRosterPlayer(db, 'u1', { teamId: TEAM, playerId: PLAYER, ...fields({ jerseyNumber: 12 }) });
    expect(result).toEqual({ ok: true, data: { playerId: PLAYER } });

    const order = calls.filter((c) => c.op === 'update').map((c) => c.table);
    expect(order).toEqual(['player_team_memberships', 'players']);
    expect(writes(calls, 'player_team_memberships')[0]).toMatchObject({
      payload: { jersey_number: 12 },
      filters: { player_id: PLAYER, team_id: TEAM, is_active: true },
    });
    expect(writes(calls, 'players')[0].payload).toMatchObject({ jersey_number: 12, secondary_positions: [], email: null, graduation_year: null });
  });

  it('should leave the player alone when the jersey is taken', async () => {
    const { db, calls } = fakeDb({
      'players.select': { data: row() },
      'player_team_memberships.update': { error: { code: '23505', message: 'duplicate key' } },
    });
    expect(await updateRosterPlayer(db, 'u1', { teamId: TEAM, playerId: PLAYER, ...fields({ jerseyNumber: 3 }) })).toMatchObject({
      code: 'conflict',
      error: 'Jersey #3 is already taken on this team.',
    });
    expect(writes(calls, 'players')).toHaveLength(0);
  });

  it('should log a failed revert of the membership jersey', async () => {
    const { db } = fakeDb({
      'players.select': { data: row() },
      'player_team_memberships.update': [{}, { error: { message: 'revert boom' } }],
      'players.update': { error: { message: 'boom' } },
    });
    await updateRosterPlayer(db, 'u1', { teamId: TEAM, playerId: PLAYER, ...fields({ jerseyNumber: 12 }) });
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('updateRosterPlayer revert failed'), { message: 'revert boom' });
  });

  it('should put the membership jersey back when the player write fails', async () => {
    const { db, calls } = fakeDb({ 'players.select': { data: row() }, 'players.update': { error: { message: 'boom' } } });
    expect(await updateRosterPlayer(db, 'u1', { teamId: TEAM, playerId: PLAYER, ...fields({ jerseyNumber: 12 }) })).toMatchObject({ code: 'failed' });
    expect(writes(calls, 'player_team_memberships').map((c) => c.payload)).toEqual([{ jersey_number: 12 }, { jersey_number: 7 }]);
  });

  it('should refuse to edit a player who is not on the team or is disabled', async () => {
    const missing = fakeDb({});
    expect(await updateRosterPlayer(missing.db, 'u1', { teamId: TEAM, playerId: PLAYER, ...fields() })).toMatchObject({ code: 'not_found' });
    const disabled = fakeDb({ 'players.select': { data: row({ is_active: false }) } });
    expect(await updateRosterPlayer(disabled.db, 'u1', { teamId: TEAM, playerId: PLAYER, ...fields() })).toMatchObject({ code: 'conflict' });
    expect(writes(disabled.calls, 'players')).toHaveLength(0);
  });
});

describe('deactivateRosterPlayer', () => {
  it('should end the membership, then disable the player and free the jersey', async () => {
    const { db, calls } = fakeDb({ 'players.select': { data: row() }, 'player_team_memberships.update': { data: [{ id: 'm1' }] } });
    expect(await deactivateRosterPlayer(db, 'u1', { teamId: TEAM, playerId: PLAYER })).toEqual({ ok: true, data: { playerId: PLAYER } });
    expect(writes(calls, 'player_team_memberships')[0].payload).toMatchObject({ is_active: false, transfer_reason: 'deactivated' });
    expect(writes(calls, 'players')[0].payload).toMatchObject({ is_active: false, jersey_number: null, disabled_by: 'u1' });
  });

  it('should record a removal from the list as removed', async () => {
    const { db, calls } = fakeDb({ 'players.select': { data: row() } });
    await deactivateRosterPlayer(db, 'u1', { teamId: TEAM, playerId: PLAYER, reason: 'removed' });
    expect(writes(calls, 'player_team_memberships')[0].payload).toMatchObject({ transfer_reason: 'removed' });
  });

  it('should reopen the membership it ended when the player write fails', async () => {
    const { db, calls } = fakeDb({
      'players.select': { data: row() },
      'player_team_memberships.update': { data: [{ id: 'm1' }] },
      'players.update': { error: { message: 'boom' } },
    });
    expect(await deactivateRosterPlayer(db, 'u1', { teamId: TEAM, playerId: PLAYER })).toMatchObject({ code: 'failed' });
    expect(writes(calls, 'player_team_memberships')[1]).toMatchObject({ payload: { is_active: true, left_at: null }, filters: { id: ['m1'] } });
  });

  it('should log a failed reopen of the membership it ended', async () => {
    const { db } = fakeDb({
      'players.select': { data: row() },
      'player_team_memberships.update': [{ data: [{ id: 'm1' }] }, { error: { message: 'revert boom' } }],
      'players.update': { error: { message: 'boom' } },
    });
    await deactivateRosterPlayer(db, 'u1', { teamId: TEAM, playerId: PLAYER });
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('deactivateRosterPlayer revert failed'), { message: 'revert boom' });
  });

  it('should leave an inactive player as is', async () => {
    const { db, calls } = fakeDb({ 'players.select': { data: row({ is_active: false }) } });
    expect(await deactivateRosterPlayer(db, 'u1', { teamId: TEAM, playerId: PLAYER })).toMatchObject({ ok: true });
    expect(calls.filter((c) => c.op !== 'select')).toHaveLength(0);
  });
});

describe('reactivateRosterPlayer', () => {
  it('should reopen the latest membership with the new jersey, then the player', async () => {
    const { db, calls } = fakeDb({
      'players.select': { data: row({ is_active: false, jersey_number: null }) },
      'player_team_memberships.select': { data: { id: 'm1', jersey_number: 7, left_at: '2026-01-01', transfer_reason: 'deactivated' } },
      'player_team_memberships.update': { data: { id: 'm1' } },
    });
    expect(await reactivateRosterPlayer(db, 'u1', { teamId: TEAM, playerId: PLAYER, jerseyNumber: 9 })).toEqual({ ok: true, data: { playerId: PLAYER } });
    expect(writes(calls, 'player_team_memberships')[0]).toMatchObject({
      payload: { is_active: true, jersey_number: 9, left_at: null },
      filters: { id: 'm1' },
    });
    expect(writes(calls, 'players')[0].payload).toMatchObject({ is_active: true, jersey_number: 9, disabled_at: null });
  });

  it('should start a membership when the player never had one, and report a taken jersey', async () => {
    const fresh = fakeDb({
      'players.select': { data: row({ is_active: false }) },
      'player_team_memberships.insert': { data: { id: 'm2' } },
    });
    expect(await reactivateRosterPlayer(fresh.db, 'u1', { teamId: TEAM, playerId: PLAYER })).toMatchObject({ ok: true });
    expect(writes(fresh.calls, 'player_team_memberships')[0].payload).toEqual({ player_id: PLAYER, team_id: TEAM, jersey_number: null, is_active: true });

    const taken = fakeDb({
      'players.select': { data: row({ is_active: false }) },
      'player_team_memberships.insert': { error: { code: '23505', message: 'duplicate key' } },
    });
    expect(await reactivateRosterPlayer(taken.db, 'u1', { teamId: TEAM, playerId: PLAYER, jerseyNumber: 4 })).toMatchObject({
      code: 'conflict',
      error: 'Jersey #4 is already taken on this team.',
    });
    expect(writes(taken.calls, 'players')).toHaveLength(0);
  });
});
