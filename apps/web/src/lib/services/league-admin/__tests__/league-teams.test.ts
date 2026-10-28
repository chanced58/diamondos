import {
  addLeagueDivision,
  loadLeagueTeams,
  removeLeagueDivision,
  removeLeagueTeam,
  setLeagueTeamActive,
  setLeagueTeamDivision,
} from '../league-teams';
import { fakeDb, type FakeResult } from '../../__tests__/fake-db';

const LEAGUE = '11111111-1111-4111-8111-111111111111';
const MEMBERSHIP = '22222222-2222-4222-8222-222222222222';
const DIVISION = '33333333-3333-4333-8333-333333333333';

const staff = (role: string | null): FakeResult => ({
  data: role ? { role, leagues: { id: LEAGUE, name: 'Valley League' } } : null,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('loadLeagueTeams', () => {
  it('should list platform and opponent teams with their divisions, and what a manager can change', async () => {
    const { db } = fakeDb({
      'league_staff.select': staff('league_manager'),
      'league_members.select': {
        data: [
          { id: 'm2', team_id: null, opponent_team_id: 'o1', division_id: null, is_active: true, teams: null, opponent_teams: { name: 'Bears' } },
          { id: 'm1', team_id: 't1', opponent_team_id: null, division_id: DIVISION, is_active: false, teams: { name: 'Hawks', organization: 'Valley HS' }, opponent_teams: null },
        ],
      },
      'league_divisions.select': { data: [{ id: DIVISION, name: 'North' }] },
    });
    expect(await loadLeagueTeams(db, 'u1', { leagueId: LEAGUE })).toEqual({
      ok: true,
      data: {
        league: { id: LEAGUE, name: 'Valley League' },
        canEditTeams: false,
        canEditDivisions: true,
        teams: [
          { membershipId: 'm2', name: 'Bears', organization: null, divisionId: null, isOpponentTeam: true, isActive: true },
          { membershipId: 'm1', name: 'Hawks', organization: 'Valley HS', divisionId: DIVISION, isOpponentTeam: false, isActive: false },
        ],
        divisions: [{ id: DIVISION, name: 'North' }],
      },
    });
  });

  it('should hide the league from anyone off its staff', async () => {
    const { db } = fakeDb({ 'league_staff.select': staff(null) });
    expect(await loadLeagueTeams(db, 'u1', { leagueId: LEAGUE })).toMatchObject({ code: 'not_found' });
  });
});

describe('divisions', () => {
  it('should let any staff member add a division, refusing a duplicate name', async () => {
    const added = fakeDb({ 'league_staff.select': staff('league_manager'), 'league_divisions.insert': { data: { id: DIVISION } } });
    expect(await addLeagueDivision(added.db, 'u1', { leagueId: LEAGUE, name: ' North ' })).toEqual({ ok: true, data: { divisionId: DIVISION } });
    expect(added.calls.find((c) => c.op === 'insert')?.payload).toEqual({ league_id: LEAGUE, name: 'North' });

    const duplicate = fakeDb({ 'league_staff.select': staff('league_admin'), 'league_divisions.insert': { error: { code: '23505' } } });
    expect(await addLeagueDivision(duplicate.db, 'u1', { leagueId: LEAGUE, name: 'North' })).toMatchObject({
      code: 'conflict',
      error: 'There is already a division named North.',
    });
  });

  it('should remove only a division of the league', async () => {
    const removed = fakeDb({ 'league_staff.select': staff('league_manager'), 'league_divisions.delete': { data: [{ id: DIVISION }] } });
    expect(await removeLeagueDivision(removed.db, 'u1', { leagueId: LEAGUE, divisionId: DIVISION })).toEqual({ ok: true, data: { divisionId: DIVISION } });
    expect(removed.calls.find((c) => c.op === 'delete')?.filters).toEqual({ id: DIVISION, league_id: LEAGUE });

    const elsewhere = fakeDb({ 'league_staff.select': staff('league_admin'), 'league_divisions.delete': { data: [] } });
    expect(await removeLeagueDivision(elsewhere.db, 'u1', { leagueId: LEAGUE, divisionId: DIVISION })).toMatchObject({ code: 'not_found' });
  });
});

describe('team changes', () => {
  it('should refuse league managers, without touching the team', async () => {
    const { db, calls } = fakeDb({ 'league_staff.select': staff('league_manager') });
    const refused = { code: 'forbidden', error: 'Only league admins can change teams.' };
    expect(await setLeagueTeamDivision(db, 'u1', { leagueId: LEAGUE, membershipId: MEMBERSHIP, divisionId: null })).toMatchObject(refused);
    expect(await setLeagueTeamActive(db, 'u1', { leagueId: LEAGUE, membershipId: MEMBERSHIP, isActive: false })).toMatchObject(refused);
    expect(await removeLeagueTeam(db, 'u1', { leagueId: LEAGUE, membershipId: MEMBERSHIP })).toMatchObject(refused);
    expect(calls.some((c) => c.table === 'league_members')).toBe(false);
  });

  it('should move a team only into one of the league’s divisions', async () => {
    const moved = fakeDb({
      'league_staff.select': staff('league_admin'),
      'league_divisions.select': { data: { id: DIVISION } },
      'league_members.update': { data: [{ id: MEMBERSHIP }] },
    });
    expect(await setLeagueTeamDivision(moved.db, 'u1', { leagueId: LEAGUE, membershipId: MEMBERSHIP, divisionId: DIVISION })).toEqual({
      ok: true,
      data: { membershipId: MEMBERSHIP },
    });
    const update = moved.calls.find((c) => c.op === 'update');
    expect(update?.payload).toEqual({ division_id: DIVISION });
    expect(update?.filters).toEqual({ id: MEMBERSHIP, league_id: LEAGUE });

    const foreign = fakeDb({ 'league_staff.select': staff('league_admin'), 'league_divisions.select': { data: null } });
    expect(await setLeagueTeamDivision(foreign.db, 'u1', { leagueId: LEAGUE, membershipId: MEMBERSHIP, divisionId: DIVISION })).toMatchObject({
      code: 'invalid',
      error: 'Pick one of the league’s divisions.',
    });
    expect(foreign.calls.some((c) => c.op === 'update')).toBe(false);
  });

  it('should take a team out of every division without checking one', async () => {
    const { db, calls } = fakeDb({ 'league_staff.select': staff('league_admin'), 'league_members.update': { data: [{ id: MEMBERSHIP }] } });
    expect(await setLeagueTeamDivision(db, 'u1', { leagueId: LEAGUE, membershipId: MEMBERSHIP, divisionId: null })).toMatchObject({ ok: true });
    expect(calls.some((c) => c.table === 'league_divisions')).toBe(false);
  });

  it('should activate, deactivate and remove only the league’s own teams', async () => {
    const toggled = fakeDb({ 'league_staff.select': staff('league_admin'), 'league_members.update': { data: [{ id: MEMBERSHIP }] } });
    await setLeagueTeamActive(toggled.db, 'u1', { leagueId: LEAGUE, membershipId: MEMBERSHIP, isActive: false });
    expect(toggled.calls.find((c) => c.op === 'update')?.payload).toEqual({ is_active: false });

    const removed = fakeDb({ 'league_staff.select': staff('league_admin'), 'league_members.delete': { data: [{ id: MEMBERSHIP }] } });
    expect(await removeLeagueTeam(removed.db, 'u1', { leagueId: LEAGUE, membershipId: MEMBERSHIP })).toMatchObject({ ok: true });
    expect(removed.calls.find((c) => c.op === 'delete')?.filters).toEqual({ id: MEMBERSHIP, league_id: LEAGUE });

    const elsewhere = fakeDb({ 'league_staff.select': staff('league_admin'), 'league_members.update': { data: [] } });
    expect(await setLeagueTeamActive(elsewhere.db, 'u1', { leagueId: LEAGUE, membershipId: MEMBERSHIP, isActive: true })).toMatchObject({
      code: 'not_found',
    });
  });
});
