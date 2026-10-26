import { createTeamSeason, deactivateTeamSeason, loadTeamSeasons, setActiveTeamSeason } from '../team-seasons';
import { fakeDb, type FakeCall, type FakeResult } from '../../__tests__/fake-db';

const TEAM = '11111111-1111-4111-8111-111111111111';
const SEASON = '22222222-2222-4222-8222-222222222222';
const PREVIOUS = '33333333-3333-4333-8333-333333333333';
const ACTOR = 'actor';

type Results = Record<string, FakeResult | FakeResult[] | ((call: FakeCall) => FakeResult)>;

/** A team where the actor is `role` (null: not on it), plus `results`. */
function team(role: string | null, results: Results = {}, isPlatformAdmin = false) {
  return fakeDb({
    'user_profiles.select': { data: { is_platform_admin: isPlatformAdmin } },
    'team_members.select': { data: role ? { role } : null },
    ...results,
  });
}
const writes = (calls: FakeCall[], table: string) => calls.filter((c) => c.table === table && c.op !== 'select');

beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => undefined));

describe('authorization', () => {
  it('should refuse members who aren’t coaches, and hide the team from strangers', async () => {
    expect(await loadTeamSeasons(team('parent').db, ACTOR, { teamId: TEAM })).toMatchObject({ code: 'forbidden' });
    expect(await loadTeamSeasons(team('scorekeeper').db, ACTOR, { teamId: TEAM })).toMatchObject({ code: 'forbidden' });
    expect(await loadTeamSeasons(team(null).db, ACTOR, { teamId: TEAM })).toMatchObject({ code: 'not_found' });
    expect(await loadTeamSeasons(team(null, {}, true).db, ACTOR, { teamId: TEAM })).toMatchObject({ ok: true });
  });
});

describe('loadTeamSeasons', () => {
  it('should list the team’s seasons newest first', async () => {
    const { db, calls } = team('assistant_coach', {
      'seasons.select': { data: [{ id: SEASON, name: 'Fall 2026', start_date: '2026-09-01', end_date: '2026-11-30', is_active: true }] },
    });
    expect(await loadTeamSeasons(db, ACTOR, { teamId: TEAM })).toEqual({
      ok: true,
      data: { seasons: [{ seasonId: SEASON, name: 'Fall 2026', startDate: '2026-09-01', endDate: '2026-11-30', isActive: true }] },
    });
    expect(calls.find((c) => c.table === 'seasons')?.filters).toMatchObject({ team_id: TEAM });
  });
});

describe('createTeamSeason', () => {
  it('should create the season inactive with its dates, and take in the team’s unassigned games in them', async () => {
    const { db, calls } = team('head_coach', {
      'seasons.select': { data: null },
      'seasons.insert': { data: { id: SEASON } },
      'games.update': { data: [{ id: 'g1' }, { id: 'g2' }] },
    });
    expect(await createTeamSeason(db, ACTOR, { teamId: TEAM, term: 'Spring', year: 2027 })).toEqual({
      ok: true,
      data: { seasonId: SEASON, gamesAttached: 2 },
    });
    expect(writes(calls, 'seasons')[0].payload).toEqual({
      team_id: TEAM,
      name: 'Spring 2027',
      start_date: '2027-03-01',
      end_date: '2027-05-31',
      is_active: false,
    });
    expect(writes(calls, 'games')[0]).toMatchObject({
      payload: { season_id: SEASON },
      filters: {
        team_id: TEAM,
        'season_id is': null,
        'scheduled_at>=': '2027-03-01T00:00:00',
        'scheduled_at<=': '2027-05-31T23:59:59',
      },
    });
  });

  it('should refuse a season the team already has, and a term or year outside the choices', async () => {
    const { db, calls } = team('head_coach', { 'seasons.select': { data: { id: SEASON } } });
    expect(await createTeamSeason(db, ACTOR, { teamId: TEAM, term: 'Fall', year: 2026 })).toEqual({
      ok: false,
      code: 'conflict',
      error: 'Fall 2026 already exists.',
    });
    expect(await createTeamSeason(db, ACTOR, { teamId: TEAM, term: 'Winter', year: 2026 })).toMatchObject({ code: 'invalid' });
    expect(await createTeamSeason(db, ACTOR, { teamId: TEAM, term: 'Fall', year: 1999 })).toMatchObject({ code: 'invalid' });
    expect(writes(calls, 'seasons')).toHaveLength(0);
  });

  it('should keep the season when its games can’t be attached', async () => {
    const { db } = team('head_coach', {
      'seasons.select': { data: null },
      'seasons.insert': { data: { id: SEASON } },
      'games.update': { error: { message: 'timeout' } },
    });
    expect(await createTeamSeason(db, ACTOR, { teamId: TEAM, term: 'Fall', year: 2026 })).toEqual({
      ok: true,
      data: { seasonId: SEASON, gamesAttached: 0 },
    });
  });
});

describe('setActiveTeamSeason', () => {
  it('should deactivate the active season, then activate this one', async () => {
    const { db, calls } = team('athletic_director', {
      'seasons.select': { data: { id: SEASON, is_active: false } },
      'seasons.update': [{ data: [{ id: PREVIOUS }] }, { data: null }],
    });
    expect(await setActiveTeamSeason(db, ACTOR, { teamId: TEAM, seasonId: SEASON })).toEqual({ ok: true, data: { ok: true } });
    const [deactivate, activate] = writes(calls, 'seasons');
    expect(deactivate).toMatchObject({ payload: { is_active: false }, filters: { team_id: TEAM, is_active: true } });
    expect(activate).toMatchObject({ payload: { is_active: true }, filters: { id: SEASON, team_id: TEAM } });
  });

  it('should put the previous season back when the switch fails', async () => {
    const { db, calls } = team('head_coach', {
      'seasons.select': { data: { id: SEASON, is_active: false } },
      'seasons.update': [{ data: [{ id: PREVIOUS }] }, { error: { message: 'unique violation' } }, { data: null }],
    });
    expect(await setActiveTeamSeason(db, ACTOR, { teamId: TEAM, seasonId: SEASON })).toMatchObject({ code: 'failed' });
    expect(writes(calls, 'seasons')[2]).toMatchObject({ payload: { is_active: true }, filters: { id: PREVIOUS, team_id: TEAM } });
  });

  it('should say not found for another team’s season, and leave an active one as it is', async () => {
    const missing = team('head_coach', { 'seasons.select': { data: null } });
    expect(await setActiveTeamSeason(missing.db, ACTOR, { teamId: TEAM, seasonId: SEASON })).toMatchObject({ code: 'not_found' });

    const active = team('head_coach', { 'seasons.select': { data: { id: SEASON, is_active: true } } });
    expect(await setActiveTeamSeason(active.db, ACTOR, { teamId: TEAM, seasonId: SEASON })).toEqual({ ok: true, data: { ok: true } });
    expect(writes([...missing.calls, ...active.calls], 'seasons')).toHaveLength(0);
  });
});

describe('deactivateTeamSeason', () => {
  it('should deactivate only a season on the team', async () => {
    const here = team('head_coach', { 'seasons.update': { data: [{ id: SEASON }] } });
    expect(await deactivateTeamSeason(here.db, ACTOR, { teamId: TEAM, seasonId: SEASON })).toEqual({ ok: true, data: { ok: true } });
    expect(writes(here.calls, 'seasons')[0]).toMatchObject({ payload: { is_active: false }, filters: { id: SEASON, team_id: TEAM } });

    const elsewhere = team('head_coach', { 'seasons.update': { data: [] } });
    expect(await deactivateTeamSeason(elsewhere.db, ACTOR, { teamId: TEAM, seasonId: SEASON })).toMatchObject({ code: 'not_found' });
  });
});
