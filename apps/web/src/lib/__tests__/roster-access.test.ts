import { getPlayerAccess, getRosterAccess, seesEveryPlayer } from '../roster-access';
import { fakeDb } from '../services/__tests__/fake-db';

const access = (results: Parameters<typeof fakeDb>[0]) => getRosterAccess(fakeDb(results).db, 't1', 'u1');
const member = (role: string) => ({ 'team_members.select': { data: { role } } });

describe('getRosterAccess', () => {
  it('should let coach roles view and manage the roster', async () => {
    for (const role of ['head_coach', 'assistant_coach', 'athletic_director']) {
      await expect(access(member(role))).resolves.toEqual({ canView: true, canManage: true, role });
    }
  });

  it('should let players, parents and other staff view without managing', async () => {
    for (const role of ['player', 'parent', 'scorekeeper', 'staff']) {
      await expect(access(member(role))).resolves.toEqual({ canView: true, canManage: false, role });
    }
  });

  it('should refuse someone with no membership on the team', async () => {
    await expect(access({})).resolves.toEqual({ canView: false, canManage: false, role: null });
  });

  it('should let platform admins and admins of the team’s league in', async () => {
    await expect(access({ 'user_profiles.select': { data: { is_platform_admin: true } } })).resolves.toMatchObject({ canView: true, canManage: true });
    await expect(
      access({ 'league_staff.select': { data: [{ league_id: 'l1', role: 'league_admin' }] }, 'league_members.select': { data: { id: 'm1' } } }),
    ).resolves.toMatchObject({ canView: true, canManage: true });
  });

  it('should refuse a league admin whose leagues do not include the team', async () => {
    const { db, calls } = fakeDb({ 'league_staff.select': { data: [{ league_id: 'l2', role: 'league_admin' }] } });
    await expect(getRosterAccess(db, 't1', 'u1')).resolves.toMatchObject({ canView: false, canManage: false });
    expect(calls.find((c) => c.table === 'league_members')?.filters).toMatchObject({ team_id: 't1', league_id: ['l2'], is_active: true });
  });
});

describe('getPlayerAccess', () => {
  const playerAccess = (results: Parameters<typeof fakeDb>[0]) => getPlayerAccess(fakeDb(results).db, 't1', 'p1', 'u1');

  it('should open every player to roster managers and team staff', async () => {
    for (const role of ['head_coach', 'scorekeeper', 'staff']) {
      await expect(playerAccess(member(role))).resolves.toMatchObject({ canView: true });
    }
  });

  it('should open a player’s own page and a linked parent’s child, and no one else’s', async () => {
    const { db, calls } = fakeDb({ ...member('player'), 'players.select': { data: { id: 'p1' } } });
    await expect(getPlayerAccess(db, 't1', 'p1', 'u1')).resolves.toMatchObject({ canView: true, canManage: false });
    expect(calls.find((c) => c.table === 'players')?.filters).toEqual({ id: 'p1', team_id: 't1', user_id: 'u1' });

    const linked = fakeDb({ ...member('parent'), 'parent_player_links.select': { data: { player_id: 'p1' } } });
    await expect(getPlayerAccess(linked.db, 't1', 'p1', 'u1')).resolves.toMatchObject({ canView: true });
    expect(linked.calls.find((c) => c.table === 'parent_player_links')?.filters).toEqual({
      player_id: 'p1',
      parent_user_id: 'u1',
      'players.team_id': 't1',
    });
    await expect(playerAccess(member('parent'))).resolves.toMatchObject({ canView: false });
    await expect(playerAccess(member('player'))).resolves.toMatchObject({ canView: false });
  });

  it('should refuse a non-member without looking the player up', async () => {
    const { db, calls } = fakeDb({ 'players.select': { data: { id: 'p1' } } });
    await expect(getPlayerAccess(db, 't1', 'p1', 'u1')).resolves.toMatchObject({ canView: false });
    expect(calls.some((c) => c.table === 'players')).toBe(false);
  });
});

describe('seesEveryPlayer', () => {
  it('should be true for managers and staff only', () => {
    expect(seesEveryPlayer({ canView: true, canManage: true, role: null })).toBe(true);
    expect(seesEveryPlayer({ canView: true, canManage: false, role: 'scorekeeper' })).toBe(true);
    expect(seesEveryPlayer({ canView: true, canManage: false, role: 'parent' })).toBe(false);
  });
});
