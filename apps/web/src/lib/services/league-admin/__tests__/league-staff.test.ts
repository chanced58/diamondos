import { loadLeagueStaff, removeLeagueStaff } from '../league-staff';
import { fakeDb, type FakeResult } from '../../__tests__/fake-db';

const LEAGUE = '11111111-1111-4111-8111-111111111111';
const SEAT = '22222222-2222-4222-8222-222222222222';
const ACTOR = 'u1';

const seatOf = (role: string | null): FakeResult => ({
  data: role ? { role, leagues: { id: LEAGUE, name: 'Valley League' } } : null,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('loadLeagueStaff', () => {
  it('should list the staff admins first, naming each from their profile', async () => {
    const { db, calls } = fakeDb({
      'league_staff.select': [
        seatOf('league_admin'),
        {
          data: [
            { id: 's3', user_id: 'u3', role: 'league_manager', user_profiles: { first_name: null, last_name: null, email: 'zed@example.com' } },
            { id: 's2', user_id: 'u2', role: 'league_manager', user_profiles: [{ first_name: 'Ann', last_name: 'Bell', email: 'ann@example.com' }] },
            { id: 's1', user_id: ACTOR, role: 'league_admin', user_profiles: { first_name: 'Cy', last_name: 'Young', email: null } },
            { id: 's4', user_id: 'u4', role: 'scorer', user_profiles: null },
          ],
        },
      ],
    });
    expect(await loadLeagueStaff(db, ACTOR, { leagueId: LEAGUE })).toEqual({
      ok: true,
      data: {
        league: { id: LEAGUE, name: 'Valley League' },
        staff: [
          { staffId: 's1', userId: ACTOR, role: 'league_admin', name: 'Cy Young', email: null, isYou: true },
          { staffId: 's2', userId: 'u2', role: 'league_manager', name: 'Ann Bell', email: 'ann@example.com', isYou: false },
          { staffId: 's3', userId: 'u3', role: 'league_manager', name: 'zed@example.com', email: 'zed@example.com', isYou: false },
        ],
      },
    });
    expect(calls[1].filters).toEqual({ league_id: LEAGUE, is_active: true });
  });

  it('should refuse a league manager and hide the league from anyone off its staff', async () => {
    const manager = fakeDb({ 'league_staff.select': seatOf('league_manager') });
    expect(await loadLeagueStaff(manager.db, ACTOR, { leagueId: LEAGUE })).toMatchObject({
      code: 'forbidden',
      error: 'Only league admins can manage the league’s staff.',
    });
    const outsider = fakeDb({ 'league_staff.select': seatOf(null) });
    expect(await loadLeagueStaff(outsider.db, ACTOR, { leagueId: LEAGUE })).toMatchObject({ code: 'not_found' });
  });

  it('should report a failed read', async () => {
    const { db } = fakeDb({ 'league_staff.select': [seatOf('league_admin'), { error: { message: 'boom' } }] });
    expect(await loadLeagueStaff(db, ACTOR, { leagueId: LEAGUE })).toMatchObject({ code: 'failed' });
  });
});

describe('removeLeagueStaff', () => {
  it('should delete a seat of the league', async () => {
    const { db, calls } = fakeDb({
      'league_staff.select': [seatOf('league_admin'), { data: { id: SEAT, user_id: 'u2' } }],
      'league_staff.delete': { data: [{ id: SEAT }] },
    });
    expect(await removeLeagueStaff(db, ACTOR, { leagueId: LEAGUE, staffId: SEAT })).toEqual({ ok: true, data: { staffId: SEAT } });
    expect(calls[1].filters).toEqual({ id: SEAT, league_id: LEAGUE });
    expect(calls.find((c) => c.op === 'delete')?.filters).toEqual({ id: SEAT, league_id: LEAGUE });
  });

  it('should never remove the admin’s own seat', async () => {
    const { db, calls } = fakeDb({ 'league_staff.select': [seatOf('league_admin'), { data: { id: SEAT, user_id: ACTOR } }] });
    expect(await removeLeagueStaff(db, ACTOR, { leagueId: LEAGUE, staffId: SEAT })).toMatchObject({
      code: 'conflict',
      error: 'You can’t remove yourself from the league’s staff.',
    });
    expect(calls.some((c) => c.op === 'delete')).toBe(false);
  });

  it('should explain when the database keeps the league’s last admin', async () => {
    const { db } = fakeDb({
      'league_staff.select': [seatOf('league_admin'), { data: { id: SEAT, user_id: 'u2' } }],
      'league_staff.delete': { error: { code: 'P0001', hint: 'last_league_admin', message: 'A league must keep at least one league admin.' } },
    });
    expect(await removeLeagueStaff(db, ACTOR, { leagueId: LEAGUE, staffId: SEAT })).toMatchObject({
      code: 'conflict',
      error: 'A league must keep at least one league admin.',
    });
  });

  it('should refuse a manager, a seat of another league and a bad id', async () => {
    const manager = fakeDb({ 'league_staff.select': seatOf('league_manager') });
    expect(await removeLeagueStaff(manager.db, ACTOR, { leagueId: LEAGUE, staffId: SEAT })).toMatchObject({ code: 'forbidden' });
    expect(manager.calls.some((c) => c.op === 'delete')).toBe(false);

    const elsewhere = fakeDb({ 'league_staff.select': [seatOf('league_admin'), { data: null }] });
    expect(await removeLeagueStaff(elsewhere.db, ACTOR, { leagueId: LEAGUE, staffId: SEAT })).toMatchObject({ code: 'not_found' });

    const { db } = fakeDb();
    expect(await removeLeagueStaff(db, ACTOR, { leagueId: LEAGUE, staffId: 'nope' })).toMatchObject({ code: 'invalid' });
  });
});
