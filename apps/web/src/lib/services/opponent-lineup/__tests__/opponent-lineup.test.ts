import { fakeDb } from '../../__tests__/fake-db';
import { loadOpponentLineup } from '../load-opponent-lineup';
import { saveOpponentTeam } from '../opponent-team';
import { addOpponentPlayer, removeOpponentPlayer, updateOpponentPlayer } from '../opponent-roster';
import { autoFillOpponentLineup, saveOpponentLineup } from '../opponent-batting-order';

const mockGetAuthorizedCoach = jest.fn();
const mockGetScoringSettings = jest.fn();
jest.mock('@/lib/games/finalize', () => ({
  getAuthorizedCoach: (...args: unknown[]) => mockGetAuthorizedCoach(...args),
}));
jest.mock('@/lib/game-scoring-settings', () => ({
  getScoringSettingsForGame: (...args: unknown[]) => mockGetScoringSettings(...args),
}));
jest.mock('@baseball/shared', () => ({
  ...jest.requireActual('@baseball/shared'),
  getMaxBattingOrder: () => 9,
}));

const GAME_ID = '11111111-1111-4111-8111-111111111111';
const P1 = '22222222-2222-4222-8222-222222222222';
const P2 = '33333333-3333-4333-8333-333333333333';
const OPP_TEAM = 'opp-team-1';

const coachGame = (over: Record<string, unknown> = {}) =>
  mockGetAuthorizedCoach.mockResolvedValue({
    game: { team_id: 'team-1', opponent_name: 'Eagles', opponent_team_id: OPP_TEAM, status: 'scheduled', tournament_id: null, ...over },
  });

beforeEach(() => {
  mockGetAuthorizedCoach.mockReset();
  mockGetScoringSettings.mockReset().mockResolvedValue({});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('authorization', () => {
  it('should refuse anyone but a coach of the game', async () => {
    mockGetAuthorizedCoach.mockResolvedValue({ error: 'Only coaches can perform this action.' });
    const { db, calls } = fakeDb();
    expect(await loadOpponentLineup(db, 'parent', { gameId: GAME_ID })).toMatchObject({ ok: false, code: 'forbidden' });
    expect(calls).toHaveLength(0);
  });

  it('should refuse edits to a started tournament game', async () => {
    coachGame({ tournament_id: 'tour-1', status: 'in_progress' });
    const { db, calls } = fakeDb();
    const result = await saveOpponentLineup(db, 'coach', { gameId: GAME_ID, entries: [] });
    expect(result).toMatchObject({ ok: false, code: 'conflict' });
    expect(calls.some((c) => c.table === 'opponent_game_lineups')).toBe(false);
  });
});

describe('loadOpponentLineup', () => {
  it("should return the game's opponent team, roster and order", async () => {
    coachGame();
    const { db } = fakeDb({
      'games.select': { data: { scoring_settings_snapshot: null } },
      'opponent_teams.select': { data: { id: OPP_TEAM, name: 'Eagles' } },
      'opponent_players.select': {
        data: [{ id: P1, first_name: 'Ty', last_name: 'Cobb', jersey_number: '07', primary_position: 'center_field' }],
      },
      'opponent_game_lineups.select': { data: [{ opponent_player_id: P1, batting_order: 1, starting_position: 'center_field' }] },
    });

    expect(await loadOpponentLineup(db, 'coach', { gameId: GAME_ID })).toEqual({
      ok: true,
      data: {
        gameId: GAME_ID,
        opponentName: 'Eagles',
        opponentTeam: { id: OPP_TEAM, name: 'Eagles' },
        maxBatters: 9,
        players: [{ id: P1, firstName: 'Ty', lastName: 'Cobb', jerseyNumber: '07', primaryPosition: 'center_field' }],
        lineup: [{ opponentPlayerId: P1, battingOrder: 1, startingPosition: 'center_field' }],
      },
    });
  });
});

describe('saveOpponentTeam', () => {
  it("should rename only the team linked to the game, within the coach's team", async () => {
    coachGame();
    const { db, calls } = fakeDb();
    const result = await saveOpponentTeam(db, 'coach', { gameId: GAME_ID, name: ' Lincoln Eagles ' });
    expect(result).toEqual({ ok: true, data: { opponentTeamId: OPP_TEAM } });
    const update = calls.find((c) => c.table === 'opponent_teams');
    expect(update).toMatchObject({ op: 'update', filters: { id: OPP_TEAM, team_id: 'team-1' } });
    expect(update?.payload).toMatchObject({ name: 'Lincoln Eagles' });
  });

  it('should create and link a team when the game has none', async () => {
    coachGame({ opponent_team_id: null });
    const { db, calls } = fakeDb({ 'opponent_teams.insert': { data: { id: 'new-team' } } });
    const result = await saveOpponentTeam(db, 'coach', { gameId: GAME_ID, name: 'Eagles' });
    expect(result).toEqual({ ok: true, data: { opponentTeamId: 'new-team' } });
    expect(calls.find((c) => c.op === 'insert')?.payload).toMatchObject({ team_id: 'team-1', name: 'Eagles', created_by: 'coach' });
    expect(calls.find((c) => c.table === 'games' && c.op === 'update')).toMatchObject({
      filters: { id: GAME_ID },
      payload: { opponent_team_id: 'new-team' },
    });
  });
});

describe('opponent roster', () => {
  it("should add a player to the game's opponent team", async () => {
    coachGame();
    const { db, calls } = fakeDb({ 'opponent_players.insert': { data: { id: P1 } } });
    const result = await addOpponentPlayer(db, 'coach', {
      gameId: GAME_ID, firstName: 'Ty', lastName: 'Cobb', jerseyNumber: ' ', primaryPosition: 'center_field',
    });
    expect(result).toEqual({ ok: true, data: { playerId: P1 } });
    expect(calls[0].payload).toEqual({
      opponent_team_id: OPP_TEAM, first_name: 'Ty', last_name: 'Cobb', jersey_number: null, primary_position: 'center_field',
    });
  });

  it('should need an opponent team before adding players', async () => {
    coachGame({ opponent_team_id: null });
    const { db } = fakeDb();
    const result = await addOpponentPlayer(db, 'coach', { gameId: GAME_ID, firstName: 'Ty', lastName: 'Cobb' });
    expect(result).toMatchObject({ ok: false, code: 'conflict' });
  });

  it("should not touch a player on another team's roster", async () => {
    coachGame();
    const { db, calls } = fakeDb({ 'opponent_players.update': { data: [] } });
    expect(await removeOpponentPlayer(db, 'coach', { gameId: GAME_ID, playerId: P1 })).toMatchObject({ ok: false, code: 'not_found' });
    expect(calls[0].filters).toEqual({ id: P1, opponent_team_id: OPP_TEAM });
    expect(calls[0].payload).toMatchObject({ is_active: false, updated_at: expect.any(String) });
  });

  it('should stamp updated_at on edits so phones pull them', async () => {
    coachGame();
    const { db, calls } = fakeDb({ 'opponent_players.update': { data: [{ id: P1 }] } });
    const result = await updateOpponentPlayer(db, 'coach', {
      gameId: GAME_ID, playerId: P1, firstName: 'Ty', lastName: 'Cobb', jerseyNumber: '07', primaryPosition: null,
    });
    expect(result).toEqual({ ok: true, data: { playerId: P1 } });
    expect(calls[0].payload).toMatchObject({ jersey_number: '07', primary_position: null, updated_at: expect.any(String) });
  });
});

describe('saveOpponentLineup', () => {
  const save = (entries: unknown[], results = {}) => {
    coachGame();
    const harness = fakeDb({ 'games.select': { data: { scoring_settings_snapshot: null } }, ...results });
    return { harness, result: saveOpponentLineup(harness.db, 'coach', { gameId: GAME_ID, entries }) };
  };

  it('should reject a slot used twice', async () => {
    const { result } = save([
      { opponentPlayerId: P1, battingOrder: 1, startingPosition: null },
      { opponentPlayerId: P2, battingOrder: 1, startingPosition: null },
    ]);
    expect(await result).toMatchObject({ ok: false, code: 'invalid' });
  });

  it('should reject a slot past the batting cap', async () => {
    const { result } = save([{ opponentPlayerId: P1, battingOrder: 10, startingPosition: null }]);
    expect(await result).toMatchObject({ ok: false, code: 'invalid', error: 'The order holds at most 9 batters.' });
  });

  it('should reject a player who is not on the opponent roster', async () => {
    const { result, harness } = save(
      [{ opponentPlayerId: P1, battingOrder: 1, startingPosition: null }],
      { 'opponent_players.select': { data: [] } },
    );
    expect(await result).toMatchObject({ ok: false, code: 'invalid' });
    expect(harness.calls.some((c) => c.op === 'delete')).toBe(false);
  });

  it('should replace the order, keep a benched pitcher, drop other bench players and touch the game', async () => {
    const { result, harness } = save(
      [
        { opponentPlayerId: P1, battingOrder: 1, startingPosition: 'center_field' },
        { opponentPlayerId: P2, battingOrder: null, startingPosition: 'pitcher' },
        { opponentPlayerId: '44444444-4444-4444-8444-444444444444', battingOrder: null, startingPosition: 'catcher' },
      ],
      { 'opponent_players.select': { data: [{ id: P1 }, { id: P2 }] } },
    );
    expect(await result).toEqual({ ok: true, data: { gameId: GAME_ID } });

    const { calls } = harness;
    expect(calls.find((c) => c.op === 'delete')?.filters).toEqual({ game_id: GAME_ID });
    expect(calls.find((c) => c.table === 'opponent_game_lineups' && c.op === 'insert')?.payload).toEqual([
      { game_id: GAME_ID, opponent_player_id: P1, batting_order: 1, starting_position: 'center_field', is_starter: true },
      { game_id: GAME_ID, opponent_player_id: P2, batting_order: null, starting_position: 'pitcher', is_starter: true },
    ]);
    expect(calls.find((c) => c.table === 'games' && c.op === 'update')?.filters).toEqual({ id: GAME_ID });
  });

  it('should put the previous order back when the new one fails to save', async () => {
    const previous = { opponent_player_id: P2, batting_order: 3, starting_position: null, is_starter: true };
    const { result, harness } = save(
      [{ opponentPlayerId: P1, battingOrder: 1, startingPosition: null }],
      {
        'opponent_players.select': { data: [{ id: P1 }] },
        'opponent_game_lineups.select': { data: [previous] },
        'opponent_game_lineups.insert': [{ error: { message: 'boom' } }, { error: null }],
      },
    );
    expect(await result).toMatchObject({ ok: false, code: 'failed' });
    const inserts = harness.calls.filter((c) => c.table === 'opponent_game_lineups' && c.op === 'insert');
    expect(inserts[1].payload).toEqual([{ game_id: GAME_ID, ...previous }]);
    expect(harness.calls.some((c) => c.table === 'games' && c.op === 'update')).toBe(false);
  });
});

describe('autoFillOpponentLineup', () => {
  it('should bench every active roster player at their usual position', async () => {
    coachGame();
    const { db, calls } = fakeDb({
      'opponent_players.select': { data: [{ id: P1, primary_position: 'shortstop' }, { id: P2, primary_position: null }] },
    });
    expect(await autoFillOpponentLineup(db, 'coach', { gameId: GAME_ID })).toEqual({ ok: true, data: { gameId: GAME_ID } });
    expect(calls.find((c) => c.table === 'opponent_players')?.filters).toEqual({ opponent_team_id: OPP_TEAM, is_active: true });
    expect(calls.find((c) => c.table === 'opponent_game_lineups' && c.op === 'insert')?.payload).toEqual([
      { game_id: GAME_ID, opponent_player_id: P1, batting_order: null, starting_position: 'shortstop', is_starter: true },
      { game_id: GAME_ID, opponent_player_id: P2, batting_order: null, starting_position: null, is_starter: true },
    ]);
  });
});
