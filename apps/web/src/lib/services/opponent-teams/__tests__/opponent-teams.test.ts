import { opponentTeamDetailResponseSchema, opponentTeamsResponseSchema } from '@baseball/shared';
import {
  addOpponentTeamPlayer,
  createOpponentTeam,
  listOpponentTeams,
  loadOpponentTeam,
  removeOpponentTeamPlayer,
  updateOpponentTeam,
  updateOpponentTeamPlayer,
} from '../opponent-teams';
import { fakeDb } from '../../__tests__/fake-db';

const TEAM = '11111111-1111-4111-8111-111111111111';
const OPP = '22222222-2222-4222-8222-222222222222';
const PLAYER = '33333333-3333-4333-8333-333333333333';

const coach = { 'team_members.select': { data: { role: 'head_coach' } } };
const parent = { 'team_members.select': { data: { role: 'parent' } } };
const ownedOpponent = {
  'opponent_teams.select': { data: { id: OPP, team_id: TEAM, name: 'Eagles', abbreviation: 'EAG', city: 'Boise', state_code: 'ID' } },
};

describe('listOpponentTeams', () => {
  it("should list the team's own opponents with active roster sizes", async () => {
    const { db, calls } = fakeDb({
      ...coach,
      'opponent_teams.select': { data: [{ id: OPP, name: 'Eagles', abbreviation: null, city: null, state_code: null }] },
      'opponent_players.select': { data: [{ opponent_team_id: OPP }, { opponent_team_id: OPP }] },
    });
    const result = await listOpponentTeams(db, 'coach-1', { teamId: TEAM });
    if (!result.ok) throw new Error(result.error);

    expect(opponentTeamsResponseSchema.parse(result.data)).toEqual(result.data);
    expect(result.data.opponentTeams).toEqual([
      { id: OPP, name: 'Eagles', abbreviation: null, city: null, stateCode: null, playerCount: 2 },
    ]);
    expect(calls.find((c) => c.table === 'opponent_teams')?.filters).toEqual({ team_id: TEAM });
    expect(calls.find((c) => c.table === 'opponent_players')?.filters).toMatchObject({ is_active: true });
  });

  it('should keep opponents from non-coaches and hide them from outsiders', async () => {
    expect(await listOpponentTeams(fakeDb(parent).db, 'parent-1', { teamId: TEAM })).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await listOpponentTeams(fakeDb().db, 'stranger', { teamId: TEAM })).toMatchObject({ ok: false, code: 'not_found' });
  });
});

describe('loadOpponentTeam', () => {
  it('should give a coach the roster and the games played against them', async () => {
    const { db } = fakeDb({
      ...coach,
      ...ownedOpponent,
      'opponent_players.select': {
        data: [{ id: PLAYER, first_name: 'X', last_name: 'Kling', jersey_number: '7', primary_position: 'shortstop', bats: 'left', throws: 'right' }],
      },
      'games.select': { data: null, count: 3 },
    });
    const result = await loadOpponentTeam(db, 'coach-1', { opponentTeamId: OPP });
    if (!result.ok) throw new Error(result.error);

    expect(opponentTeamDetailResponseSchema.parse(result.data)).toEqual(result.data);
    expect(result.data.team).toEqual({ id: OPP, name: 'Eagles', abbreviation: 'EAG', city: 'Boise', stateCode: 'ID' });
    expect(result.data.players[0]).toMatchObject({ lastName: 'Kling', jerseyNumber: '7', bats: 'left' });
    expect(result.data.priorGames).toBe(3);
  });

  it("should not reveal another team's opponent, or a league-owned one", async () => {
    expect(await loadOpponentTeam(fakeDb(ownedOpponent).db, 'stranger', { opponentTeamId: OPP })).toMatchObject({
      ok: false, code: 'not_found', error: 'Opponent team not found.',
    });
    const leagueOwned = { 'opponent_teams.select': { data: { id: OPP, team_id: null, name: 'Eagles' } } };
    expect(await loadOpponentTeam(fakeDb({ ...coach, ...leagueOwned }).db, 'coach-1', { opponentTeamId: OPP })).toMatchObject({
      ok: false, code: 'not_found',
    });
  });
});

describe('createOpponentTeam / updateOpponentTeam', () => {
  it('should create a team owned by the coach’s team, clearing blank details', async () => {
    const { db, calls } = fakeDb({ ...coach, 'opponent_teams.insert': { data: { id: OPP } } });
    const result = await createOpponentTeam(db, 'coach-1', { teamId: TEAM, name: '  Eagles ', abbreviation: '', city: 'Boise' });

    expect(result).toEqual({ ok: true, data: { opponentTeamId: OPP } });
    expect(calls.find((c) => c.op === 'insert')?.payload).toEqual({
      team_id: TEAM, name: 'Eagles', abbreviation: null, city: 'Boise', state_code: null, created_by: 'coach-1',
    });
  });

  it('should require a name and refuse non-coaches', async () => {
    expect(await createOpponentTeam(fakeDb(coach).db, 'coach-1', { teamId: TEAM, name: ' ' })).toMatchObject({
      ok: false, code: 'invalid', error: 'Team name is required.',
    });
    expect(await createOpponentTeam(fakeDb(parent).db, 'parent-1', { teamId: TEAM, name: 'Eagles' })).toMatchObject({
      ok: false, code: 'forbidden',
    });
  });

  it('should update only within the owning team', async () => {
    const { db, calls } = fakeDb({ ...coach, ...ownedOpponent });
    const result = await updateOpponentTeam(db, 'coach-1', { opponentTeamId: OPP, name: 'Eagles JV', stateCode: 'ID' });

    expect(result).toEqual({ ok: true, data: { opponentTeamId: OPP } });
    const update = calls.find((c) => c.op === 'update')!;
    expect(update.filters).toEqual({ id: OPP, team_id: TEAM });
    expect(update.payload).toMatchObject({ name: 'Eagles JV', state_code: 'ID', city: null });
  });
});

describe('roster', () => {
  it('should add a player with handedness and a position enum value', async () => {
    const { db, calls } = fakeDb({ ...coach, ...ownedOpponent, 'opponent_players.insert': { data: { id: PLAYER } } });
    const result = await addOpponentTeamPlayer(db, 'coach-1', {
      opponentTeamId: OPP, firstName: 'X', lastName: 'Kling', jerseyNumber: '07', primaryPosition: 'shortstop', bats: 'switch', throws: 'right',
    });

    expect(result).toEqual({ ok: true, data: { playerId: PLAYER } });
    expect(calls.find((c) => c.op === 'insert')?.payload).toEqual({
      opponent_team_id: OPP, first_name: 'X', last_name: 'Kling', jersey_number: '07', primary_position: 'shortstop', bats: 'switch', throws: 'right',
    });
  });

  it('should reject a hand that is not right, left or switch', async () => {
    const { db } = fakeDb({ ...coach, ...ownedOpponent });
    expect(await addOpponentTeamPlayer(db, 'coach-1', { opponentTeamId: OPP, firstName: 'X', lastName: 'Y', throws: 'switch' })).toMatchObject({
      ok: false, code: 'invalid',
    });
  });

  it('should edit and remove only players on that opponent team', async () => {
    const found = fakeDb({ ...coach, ...ownedOpponent, 'opponent_players.update': { data: [{ id: PLAYER }] } });
    expect(await updateOpponentTeamPlayer(found.db, 'coach-1', { opponentTeamId: OPP, playerId: PLAYER, firstName: 'X', lastName: 'Y' })).toEqual({
      ok: true, data: { playerId: PLAYER },
    });
    expect(found.calls.find((c) => c.op === 'update')?.filters).toEqual({ id: PLAYER, opponent_team_id: OPP });

    const missing = fakeDb({ ...coach, ...ownedOpponent, 'opponent_players.update': { data: [] } });
    expect(await removeOpponentTeamPlayer(missing.db, 'coach-1', { opponentTeamId: OPP, playerId: PLAYER })).toMatchObject({
      ok: false, code: 'not_found',
    });
    expect(missing.calls.find((c) => c.op === 'update')?.payload).toMatchObject({ is_active: false });
  });
});
