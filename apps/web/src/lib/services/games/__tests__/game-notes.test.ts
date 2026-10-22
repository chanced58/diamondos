import { fakeDb } from '../../__tests__/fake-db';
import { loadGameNotes } from '../load-game-notes';
import { saveGameNotes, savePlayerGameNotes } from '../save-game-notes';
import { gameNotesInputFromFormData } from '../game-notes-form-data';

const mockGetAuthorizedCoach = jest.fn();
jest.mock('@/lib/games/finalize', () => ({
  getAuthorizedCoach: (...args: unknown[]) => mockGetAuthorizedCoach(...args),
}));

const GAME_ID = '11111111-1111-4111-8111-111111111111';
const PLAYER_A = '22222222-2222-4222-8222-222222222222';
const PLAYER_B = '33333333-3333-4333-8333-333333333333';
const TEAM_ID = 'team-1';

const noteRow = (playerId: string, over: Record<string, unknown> = {}) => ({
  player_id: playerId,
  pitching: null,
  hitting: 'Quick hands',
  fielding_catching: 'Good glove',
  baserunning: null,
  athleticism: null,
  attitude: null,
  player_notes: 'Felt good',
  ...over,
});

const emptyAssessment = {
  pitching: null,
  hitting: null,
  fieldingCatching: null,
  baserunning: null,
  athleticism: null,
  attitude: null,
};

beforeEach(() => {
  mockGetAuthorizedCoach.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('loadGameNotes', () => {
  const game = { data: { id: GAME_ID, team_id: TEAM_ID } };

  it('should answer not_found to someone off the team', async () => {
    const { db } = fakeDb({ 'games.select': game, 'team_members.select': { data: null } });
    const result = await loadGameNotes(db, 'stranger', { gameId: GAME_ID });
    expect(result).toMatchObject({ ok: false, code: 'not_found' });
  });

  it('should give a coach every active player with the coach-only notes', async () => {
    const { db } = fakeDb({
      'games.select': game,
      'team_members.select': { data: { role: 'head_coach' } },
      'game_notes.select': { data: { overall_notes: 'Windy day' } },
      'game_coach_notes.select': { data: { coach_notes: 'Work on bunts' } },
      'players.select': {
        data: [
          { id: PLAYER_A, first_name: 'Ada', last_name: 'Abbott', jersey_number: 4 },
          { id: PLAYER_B, first_name: 'Bo', last_name: 'Burke', jersey_number: null },
        ],
      },
      'game_player_notes.select': { data: [noteRow(PLAYER_A)] },
    });

    const result = await loadGameNotes(db, 'coach', { gameId: GAME_ID });

    expect(result).toEqual({
      ok: true,
      data: {
        gameId: GAME_ID,
        view: 'coach',
        overallNotes: 'Windy day',
        coachNotes: 'Work on bunts',
        players: [
          {
            playerId: PLAYER_A,
            name: 'Ada Abbott',
            jerseyNumber: 4,
            assessment: { ...emptyAssessment, hitting: 'Quick hands', fieldingCatching: 'Good glove' },
            selfNotes: 'Felt good',
            canEditSelfNotes: false,
          },
          {
            playerId: PLAYER_B,
            name: 'Bo Burke',
            jerseyNumber: null,
            assessment: emptyAssessment,
            selfNotes: null,
            canEditSelfNotes: false,
          },
        ],
      },
    });
  });

  it('should give a player only their own entry, editable, and never read coach-only notes', async () => {
    const { db, calls } = fakeDb({
      'games.select': game,
      'team_members.select': { data: { role: 'player' } },
      'game_notes.select': { data: null },
      'players.select': { data: { id: PLAYER_A, first_name: 'Ada', last_name: 'Abbott', jersey_number: 4 } },
      'game_player_notes.select': { data: [noteRow(PLAYER_A)] },
    });

    const result = await loadGameNotes(db, 'player-user', { gameId: GAME_ID });

    expect(result).toMatchObject({
      ok: true,
      data: { view: 'player', coachNotes: null, overallNotes: null, players: [{ playerId: PLAYER_A, canEditSelfNotes: true }] },
    });
    expect(calls.some((c) => c.table === 'game_coach_notes')).toBe(false);
    expect(calls.find((c) => c.table === 'players')?.filters).toMatchObject({ team_id: TEAM_ID, user_id: 'player-user' });
  });

  it("should give a parent each linked child on this game's team, read-only", async () => {
    const { db, calls } = fakeDb({
      'games.select': game,
      'team_members.select': { data: { role: 'parent' } },
      'game_notes.select': { data: { overall_notes: 'Windy day' } },
      'players.select': { data: null },
      'parent_player_links.select': {
        data: [
          { players: { id: PLAYER_A, first_name: 'Ada', last_name: 'Abbott', jersey_number: 4, team_id: TEAM_ID } },
          { players: { id: PLAYER_B, first_name: 'Bo', last_name: 'Burke', jersey_number: 7, team_id: 'other-team' } },
        ],
      },
      'game_player_notes.select': { data: [] },
    });

    const result = await loadGameNotes(db, 'parent-user', { gameId: GAME_ID });

    expect(result).toMatchObject({
      ok: true,
      data: { view: 'parent', players: [{ playerId: PLAYER_A, canEditSelfNotes: false }] },
    });
    if (result.ok) expect(result.data.players).toHaveLength(1);
    expect(calls.find((c) => c.table === 'game_player_notes')?.filters).toMatchObject({ player_id: [PLAYER_A] });
  });

  it('should give any other member the overall notes alone', async () => {
    const { db } = fakeDb({
      'games.select': game,
      'team_members.select': { data: { role: 'scorekeeper' } },
      'game_notes.select': { data: { overall_notes: 'Windy day' } },
      'players.select': { data: null },
    });
    const result = await loadGameNotes(db, 'scorer', { gameId: GAME_ID });
    expect(result).toEqual({
      ok: true,
      data: { gameId: GAME_ID, view: 'member', overallNotes: 'Windy day', coachNotes: null, players: [] },
    });
  });

  it('should report a failed read instead of empty notes', async () => {
    const { db } = fakeDb({
      'games.select': game,
      'team_members.select': { data: { role: 'player' } },
      'game_notes.select': { error: { message: 'boom' } },
    });
    const result = await loadGameNotes(db, 'player-user', { gameId: GAME_ID });
    expect(result).toMatchObject({ ok: false, code: 'failed' });
  });
});

describe('saveGameNotes', () => {
  const coachOk = () => mockGetAuthorizedCoach.mockResolvedValue({ game: { team_id: TEAM_ID, status: 'completed' } });

  it('should refuse anyone but a coach of the game', async () => {
    mockGetAuthorizedCoach.mockResolvedValue({ error: 'Only coaches can perform this action.', code: undefined });
    const { db, calls } = fakeDb();
    const result = await saveGameNotes(db, 'player-user', { gameId: GAME_ID, overallNotes: 'x' });
    expect(result).toMatchObject({ ok: false, code: 'forbidden' });
    expect(calls).toHaveLength(0);
  });

  it("should reject a player who isn't on the game's team and write nothing", async () => {
    coachOk();
    const { db, calls } = fakeDb({ 'players.select': { data: [{ id: PLAYER_A }] } });
    const result = await saveGameNotes(db, 'coach', {
      gameId: GAME_ID,
      overallNotes: 'x',
      players: [
        { playerId: PLAYER_A, assessment: emptyAssessment },
        { playerId: PLAYER_B, assessment: emptyAssessment },
      ],
    });
    expect(result).toMatchObject({ ok: false, code: 'invalid' });
    expect(calls.find((c) => c.table === 'players')?.filters).toMatchObject({ team_id: TEAM_ID });
    expect(calls.some((c) => c.op === 'upsert')).toBe(false);
  });

  it('should write only the parts sent, store blanks as null, and leave self-reflections alone', async () => {
    coachOk();
    const { db, calls } = fakeDb({ 'players.select': { data: [{ id: PLAYER_A }] } });
    const result = await saveGameNotes(db, 'coach', {
      gameId: GAME_ID,
      coachNotes: '  ',
      players: [{ playerId: PLAYER_A, assessment: { ...emptyAssessment, hitting: 'Quick hands', fieldingCatching: '' } }],
    });

    expect(result).toEqual({ ok: true, data: { gameId: GAME_ID } });
    const upserts = calls.filter((c) => c.op === 'upsert');
    expect(upserts.map((c) => c.table)).toEqual(['game_coach_notes', 'game_player_notes']);
    expect(upserts[0].payload).toMatchObject({ game_id: GAME_ID, coach_notes: null, updated_by: 'coach' });
    const [row] = upserts[1].payload as Record<string, unknown>[];
    expect(row).toMatchObject({ player_id: PLAYER_A, hitting: 'Quick hands', fielding_catching: null });
    expect(row).not.toHaveProperty('player_notes');
  });

  it('should reject a malformed game id before touching the database', async () => {
    const { db, calls } = fakeDb();
    const result = await saveGameNotes(db, 'coach', { gameId: 'nope' });
    expect(result).toMatchObject({ ok: false, code: 'invalid' });
    expect(calls).toHaveLength(0);
    expect(mockGetAuthorizedCoach).not.toHaveBeenCalled();
  });
});

describe('savePlayerGameNotes', () => {
  it("should refuse someone who isn't the player", async () => {
    const { db, calls } = fakeDb({ 'players.select': { data: null } });
    const result = await savePlayerGameNotes(db, 'parent-user', { gameId: GAME_ID, playerId: PLAYER_A, playerNotes: 'x' });
    expect(result).toMatchObject({ ok: false, code: 'forbidden' });
    expect(calls[0].filters).toMatchObject({ id: PLAYER_A, user_id: 'parent-user', is_active: true });
    expect(calls.some((c) => c.op === 'upsert')).toBe(false);
  });

  it("should refuse a game from another team", async () => {
    const { db, calls } = fakeDb({
      'players.select': { data: { id: PLAYER_A, team_id: TEAM_ID } },
      'games.select': { data: null },
    });
    const result = await savePlayerGameNotes(db, 'player-user', { gameId: GAME_ID, playerId: PLAYER_A, playerNotes: 'x' });
    expect(result).toMatchObject({ ok: false, code: 'not_found' });
    expect(calls.find((c) => c.table === 'games')?.filters).toMatchObject({ id: GAME_ID, team_id: TEAM_ID });
  });

  it('should write only the self-reflection', async () => {
    const { db, calls } = fakeDb({
      'players.select': { data: { id: PLAYER_A, team_id: TEAM_ID } },
      'games.select': { data: { id: GAME_ID } },
    });
    const result = await savePlayerGameNotes(db, 'player-user', { gameId: GAME_ID, playerId: PLAYER_A, playerNotes: 'Felt good' });
    expect(result).toEqual({ ok: true, data: { gameId: GAME_ID, playerId: PLAYER_A } });
    const upsert = calls.find((c) => c.op === 'upsert');
    expect(upsert?.payload).toMatchObject({ game_id: GAME_ID, player_id: PLAYER_A, player_notes: 'Felt good' });
    expect(upsert?.payload).not.toHaveProperty('hitting');
  });
});

describe('gameNotesInputFromFormData', () => {
  it("should read the web form's snake_case player fields into assessments", () => {
    const form = new FormData();
    form.set('gameId', GAME_ID);
    form.set('teamId', 'ignored');
    form.set('overall_notes', 'Windy day');
    form.set('coach_notes', '');
    form.set(`player_${PLAYER_A}_fielding_catching`, 'Good glove');
    form.set(`player_${PLAYER_A}_hitting`, '');
    form.set(`player_${PLAYER_A}_unknown`, 'dropped');

    expect(gameNotesInputFromFormData(form)).toEqual({
      gameId: GAME_ID,
      overallNotes: 'Windy day',
      coachNotes: '',
      players: [{ playerId: PLAYER_A, assessment: { ...emptyAssessment, fieldingCatching: 'Good glove', hitting: '' } }],
    });
  });
});
