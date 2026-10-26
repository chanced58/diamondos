import { getRosterAccess } from '../roster-access';
import { fakeDb } from '../services/__tests__/fake-db';

const access = (results: Parameters<typeof fakeDb>[0]) => getRosterAccess(fakeDb(results).db, 't1', 'u1');

describe('getRosterAccess', () => {
  it('should let coach roles view and manage the roster', async () => {
    for (const role of ['head_coach', 'assistant_coach', 'athletic_director']) {
      await expect(access({ 'team_members.select': { data: { role } } })).resolves.toEqual({ canView: true, canManage: true });
    }
  });

  it('should let players, parents and other staff view without managing', async () => {
    for (const role of ['player', 'parent', 'scorekeeper', 'staff']) {
      await expect(access({ 'team_members.select': { data: { role } } })).resolves.toEqual({ canView: true, canManage: false });
    }
  });

  it('should refuse someone with no membership on the team', async () => {
    await expect(access({})).resolves.toEqual({ canView: false, canManage: false });
  });

  it('should let platform admins and admins of the team’s league in', async () => {
    await expect(access({ 'user_profiles.select': { data: { is_platform_admin: true } } })).resolves.toEqual({ canView: true, canManage: true });
    await expect(
      access({ 'league_staff.select': { data: [{ league_id: 'l1', role: 'league_admin' }] }, 'league_members.select': { data: { id: 'm1' } } }),
    ).resolves.toEqual({ canView: true, canManage: true });
  });

  it('should refuse a league admin whose leagues do not include the team', async () => {
    const { db, calls } = fakeDb({ 'league_staff.select': { data: [{ league_id: 'l2', role: 'league_admin' }] } });
    await expect(getRosterAccess(db, 't1', 'u1')).resolves.toEqual({ canView: false, canManage: false });
    expect(calls.find((c) => c.table === 'league_members')?.filters).toMatchObject({ team_id: 't1', league_id: ['l2'], is_active: true });
  });
});
