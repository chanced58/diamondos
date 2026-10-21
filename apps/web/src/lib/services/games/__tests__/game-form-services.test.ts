import { createGame } from '../create-game';
import { updateGame } from '../update-game';
import { loadGameFormOptions } from '../load-game-form-options';
import { deleteTeamEvent } from '../../team-events/delete-team-event';
import { fakeDb } from '../../__tests__/fake-db';

const mockPostEventAlert = jest.fn();
const mockProvisionMirrorGame = jest.fn();
const mockEnsureTournamentOpponentTeam = jest.fn();

jest.mock('@/app/(app)/messages/notify', () => ({
  postEventAlert: (...args: unknown[]) => mockPostEventAlert(...args),
}));
jest.mock('@/lib/dual-scorekeeper/provision', () => ({
  provisionMirrorGame: (...args: unknown[]) => mockProvisionMirrorGame(...args),
}));
jest.mock('@/lib/games/tournament-opponent-team', () => ({
  ensureTournamentOpponentTeam: (...args: unknown[]) => mockEnsureTournamentOpponentTeam(...args),
}));

const TEAM = '11111111-1111-4111-8111-111111111111';
const GAME = '22222222-2222-4222-8222-222222222222';
const OPP = '33333333-3333-4333-8333-333333333333';
const TOURNEY = '44444444-4444-4444-8444-444444444444';
const EVENT = '55555555-5555-4555-8555-555555555555';

const coach = { 'team_members.select': { data: { role: 'head_coach' } } };

const form = {
  opponentName: 'Eagles',
  date: '2026-10-22',
  time: '18:00',
  locationType: 'home',
  deviceTimeZone: 'America/Boise',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('createGame', () => {
  it('should refuse a non-coach without inserting', async () => {
    const { db, calls } = fakeDb({ 'team_members.select': { data: { role: 'parent' } } });
    expect(await createGame(db, 'u', { teamId: TEAM, ...form }))
      .toEqual({ ok: false, code: 'forbidden', error: 'Only coaches can schedule games.' });
    expect(calls.find((c) => c.op === 'insert')).toBeUndefined();
  });

  it('should only count an active coach membership', async () => {
    const { db, calls } = fakeDb({ ...coach, 'games.insert': { data: { id: GAME } } });
    await createGame(db, 'coach', { teamId: TEAM, ...form });
    expect(calls.find((c) => c.table === 'team_members')?.filters).toMatchObject({ is_active: true });
  });

  it('should store the typed time in the device zone when no venue is picked', async () => {
    const { db, calls } = fakeDb({
      ...coach,
      'seasons.select': { data: { id: 'season-1' } },
      'games.insert': { data: { id: GAME } },
    });
    expect(await createGame(db, 'coach', { teamId: TEAM, ...form, venue: { name: 'Field 2' } }))
      .toEqual({ ok: true, data: { gameId: GAME } });
    const insert = calls.find((c) => c.table === 'games' && c.op === 'insert');
    expect(insert?.payload).toMatchObject({
      team_id: TEAM,
      opponent_name: 'Eagles',
      // 18:00 MDT on Oct 22 is 00:00 UTC on Oct 23.
      scheduled_at: '2026-10-23T00:00:00.000Z',
      time_zone: 'America/Boise',
      venue_name: 'Field 2',
      latitude: null,
      season_id: 'season-1',
      neutral_home_team: null,
      created_by: 'coach',
    });
    expect(mockProvisionMirrorGame).toHaveBeenCalled();
  });

  it("should prefer the venue's zone over the device's", async () => {
    const { db, calls } = fakeDb({ ...coach, 'games.insert': { data: { id: GAME } } });
    // A Chicago venue scheduled from a Boise phone.
    await createGame(db, 'coach', {
      teamId: TEAM, ...form,
      venue: { name: 'Wrigley', latitude: 41.948, longitude: -87.655, placeId: 'p1', address: 'Chicago' },
    });
    const insert = calls.find((c) => c.table === 'games' && c.op === 'insert');
    expect(insert?.payload).toMatchObject({ time_zone: 'America/Chicago', scheduled_at: '2026-10-22T23:00:00.000Z', place_id: 'p1' });
  });

  it('should reject an opponent team outside the team and its leagues', async () => {
    const { db } = fakeDb({ ...coach, 'opponent_teams.select': { data: { id: OPP, team_id: 'other-team' } } });
    const result = await createGame(db, 'coach', { teamId: TEAM, ...form, opponentTeamId: OPP });
    expect(result).toMatchObject({ ok: false, code: 'invalid' });
  });

  it('should accept a league opponent the team shares an active league with', async () => {
    const { db, calls } = fakeDb({
      ...coach,
      'opponent_teams.select': { data: { id: OPP, team_id: 'other-team' } },
      'league_members.select': [{ data: [{ league_id: 'league-1' }] }, { data: [{ id: 'm1' }] }],
      'games.insert': { data: { id: GAME } },
    });
    expect((await createGame(db, 'coach', { teamId: TEAM, ...form, opponentTeamId: OPP })).ok).toBe(true);
    expect(calls.find((c) => c.table === 'games' && c.op === 'insert')?.payload).toMatchObject({ opponent_team_id: OPP });
  });

  it('should report a failed league lookup as a server fault, not a foreign opponent', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { db, calls } = fakeDb({
      ...coach,
      'opponent_teams.select': { data: { id: OPP, team_id: 'other-team' } },
      'league_members.select': { data: null, error: { message: 'connection reset' } },
    });
    const result = await createGame(db, 'coach', { teamId: TEAM, ...form, opponentTeamId: OPP });
    expect(result).toMatchObject({ ok: false, code: 'failed' });
    expect(calls.find((c) => c.op === 'insert')).toBeUndefined();
    log.mockRestore();
  });

  it('should scope a tournament game to the tournament team and give a typed opponent a record', async () => {
    mockEnsureTournamentOpponentTeam.mockResolvedValue({ opponentTeamId: OPP });
    const { db, calls } = fakeDb({
      ...coach,
      'tournament_teams.select': { data: { team_id: TEAM, season_id: 'cup-season' } },
      'games.insert': { data: { id: GAME } },
    });
    await createGame(db, 'coach', { teamId: TEAM, tournamentId: TOURNEY, ...form });
    expect(calls.find((c) => c.table === 'games' && c.op === 'insert')?.payload)
      .toMatchObject({ season_id: 'cup-season', tournament_id: TOURNEY, opponent_team_id: OPP });
  });

  it('should announce the game only when asked and the opponent is known', async () => {
    const results = { ...coach, 'games.insert': { data: { id: GAME } } };
    await createGame(fakeDb(results).db, 'coach', { teamId: TEAM, ...form, notifyTeam: true });
    await createGame(fakeDb(results).db, 'coach', { teamId: TEAM, ...form, opponentName: null, opponentTbd: true, notifyTeam: true });
    expect(mockPostEventAlert).toHaveBeenCalledTimes(1);
    expect(mockPostEventAlert.mock.calls[0][3]).toContain('vs. Eagles');
  });
});

describe('updateGame', () => {
  const game = { 'games.select': { data: { team_id: TEAM, status: 'scheduled', time_zone: 'America/Denver', tournament_id: null } } };

  it('should report a missing game as not found', async () => {
    const { db } = fakeDb();
    expect(await updateGame(db, 'coach', { gameId: GAME, ...form }))
      .toEqual({ ok: false, code: 'not_found', error: 'Game not found.' });
  });

  it('should refuse a non-coach', async () => {
    const { db } = fakeDb({ ...game, 'team_members.select': { data: { role: 'player' } } });
    expect(await updateGame(db, 'u', { gameId: GAME, ...form })).toMatchObject({ ok: false, code: 'forbidden' });
  });

  it('should let a platform admin edit', async () => {
    const { db } = fakeDb({ ...game, 'user_profiles.select': { data: { is_platform_admin: true } } });
    expect(await updateGame(db, 'admin', { gameId: GAME, ...form })).toEqual({ ok: true, data: { gameId: GAME } });
  });

  it('should not clear the opponent of a game that has started', async () => {
    const { db } = fakeDb({ ...coach, 'games.select': { data: { team_id: TEAM, status: 'in_progress', time_zone: null } } });
    const result = await updateGame(db, 'coach', { gameId: GAME, ...form, opponentName: null, opponentTbd: true });
    expect(result).toMatchObject({ ok: false, code: 'conflict' });
  });

  it("should keep the game's saved zone when the venue has no coordinates", async () => {
    const { db, calls } = fakeDb({ ...coach, ...game });
    await updateGame(db, 'coach', { gameId: GAME, ...form, venue: { name: 'Field 3' } });
    const update = calls.find((c) => c.table === 'games' && c.op === 'update');
    // 18:00 MDT (the saved Denver zone, not the device's) is 00:00 UTC.
    expect(update?.payload).toMatchObject({ time_zone: 'America/Denver', scheduled_at: '2026-10-23T00:00:00.000Z' });
    expect(update?.filters).toEqual({ id: GAME });
  });
});

describe('loadGameFormOptions', () => {
  it('should merge, dedupe and sort the team and league opponents', async () => {
    const { db } = fakeDb({
      ...coach,
      'opponent_teams.select': { data: [{ id: 'b', name: 'Bears', city: null }, { id: 'z', name: 'Zebras', city: 'Boise' }] },
      // First the team's active leagues, then those leagues' opponents.
      'league_members.select': [
        { data: [{ league_id: 'league-1' }] },
        { data: [
          { opponent_teams: { id: 'a', name: 'Aces', city: null } },
          { opponent_teams: [{ id: 'b', name: 'Bears', city: null }] },
        ] },
      ],
    });
    const result = await loadGameFormOptions(db, 'coach', { teamId: TEAM });
    if (!result.ok) throw new Error(result.error);
    expect(result.data.opponentTeams.map((t) => t.id)).toEqual(['a', 'b', 'z']);
  });

  it('should only offer active opponents from every league the team is actively in', async () => {
    const { db, calls } = fakeDb({
      ...coach,
      'league_members.select': [{ data: [{ league_id: 'league-1' }, { league_id: 'league-2' }] }, { data: [] }],
    });
    await loadGameFormOptions(db, 'coach', { teamId: TEAM });
    const [teamLeagues, opponents] = calls.filter((c) => c.table === 'league_members');
    expect(teamLeagues.filters).toEqual({ team_id: TEAM, is_active: true });
    expect(opponents.filters).toEqual({ league_id: ['league-1', 'league-2'], is_active: true });
  });

  it.each([
    ['the team leagues', [{ data: null, error: { message: 'boom' } }]],
    ['the league opponents', [{ data: [{ league_id: 'league-1' }] }, { data: null, error: { message: 'boom' } }]],
  ])('should fail rather than return a partial list when %s lookup fails', async (_what, leagueResults) => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { db } = fakeDb({ ...coach, 'opponent_teams.select': { data: [] }, 'league_members.select': leagueResults });
    expect(await loadGameFormOptions(db, 'coach', { teamId: TEAM })).toMatchObject({ ok: false, code: 'failed' });
    log.mockRestore();
  });

  it('should skip the league query for a team in no league', async () => {
    const { db, calls } = fakeDb({ ...coach, 'league_members.select': { data: [] } });
    await loadGameFormOptions(db, 'coach', { teamId: TEAM });
    expect(calls.filter((c) => c.table === 'league_members')).toHaveLength(1);
  });

  it('should refuse a non-coach', async () => {
    const { db } = fakeDb({ 'team_members.select': { data: null } });
    expect(await loadGameFormOptions(db, 'u', { teamId: TEAM })).toMatchObject({ ok: false, code: 'forbidden' });
  });
});

describe('deleteTeamEvent', () => {
  it('should delete an event for its team coach, scoped to the team', async () => {
    const { db, calls } = fakeDb({ ...coach, 'team_events.select': { data: { team_id: TEAM } } });
    expect(await deleteTeamEvent(db, 'coach', { eventId: EVENT })).toEqual({ ok: true, data: { eventId: EVENT } });
    expect(calls.find((c) => c.op === 'delete')?.filters).toEqual({ id: EVENT, team_id: TEAM });
  });

  it('should refuse anyone else and report missing events', async () => {
    const stranger = fakeDb({ 'team_events.select': { data: { team_id: TEAM } }, 'team_members.select': { data: null } });
    expect(await deleteTeamEvent(stranger.db, 'u', { eventId: EVENT })).toMatchObject({ ok: false, code: 'forbidden' });
    expect(stranger.calls.find((c) => c.op === 'delete')).toBeUndefined();
    expect(await deleteTeamEvent(fakeDb().db, 'coach', { eventId: EVENT })).toMatchObject({ ok: false, code: 'not_found' });
  });

  it('should report a failed lookup as a server fault, not a missing event', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { db, calls } = fakeDb({ 'team_events.select': { data: null, error: { message: 'connection reset' } } });
    const result = await deleteTeamEvent(db, 'coach', { eventId: EVENT });
    expect(result).toMatchObject({ ok: false, code: 'failed' });
    expect(log).toHaveBeenCalled();
    expect(calls.find((c) => c.op === 'delete')).toBeUndefined();
    log.mockRestore();
  });
});
