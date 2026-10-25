import { logPracticeRep, savePracticeNotes, savePracticePlan, savePracticeSelfNotes } from '../practice-notes';
import { fakeDb } from '../../__tests__/fake-db';

const mockInsertReps = jest.fn();
jest.mock('@baseball/database', () => ({
  ...jest.requireActual('@baseball/database'),
  insertPracticeReps: (...args: unknown[]) => mockInsertReps(...args),
}));

const TEAM = '11111111-1111-4111-8111-111111111111';
const PRACTICE = '22222222-2222-4222-8222-222222222222';
const PLAYER = '33333333-3333-4333-8333-333333333333';
const OTHER_PLAYER = '44444444-4444-4444-8444-444444444444';
const role = (r: string) => ({ data: { role: r } });
const practiceRow = (status = 'scheduled') => ({
  data: { id: PRACTICE, team_id: TEAM, scheduled_at: '2026-10-25T23:00:00Z', status, latitude: null, longitude: null },
});

beforeEach(() => {
  jest.clearAllMocks();
  mockInsertReps.mockResolvedValue(undefined);
});

describe('savePracticePlan', () => {
  it('should save the plan for a coach and refuse a player', async () => {
    const coach = fakeDb({ 'practices.select': practiceRow(), 'team_members.select': role('assistant_coach') });
    expect(await savePracticePlan(coach.db, 'c', { practiceId: PRACTICE, plan: 'BP, then situations' })).toMatchObject({ ok: true });
    expect(coach.calls.find((c) => c.op === 'update')?.payload).toEqual({ plan: 'BP, then situations' });

    const player = fakeDb({ 'practices.select': practiceRow(), 'team_members.select': role('player') });
    expect(await savePracticePlan(player.db, 'p', { practiceId: PRACTICE, plan: 'x' })).toMatchObject({ ok: false, code: 'forbidden' });
  });
});

describe('savePracticeNotes', () => {
  it("should save overall, coach and player notes against the practice's own team", async () => {
    const { db, calls } = fakeDb({
      'practices.select': practiceRow(),
      'team_members.select': role('head_coach'),
      'players.select': { data: [{ id: PLAYER }] },
    });
    const result = await savePracticeNotes(db, 'c', {
      practiceId: PRACTICE,
      overallNotes: 'Good energy',
      coachNotes: '',
      players: [{ playerId: PLAYER, hitting: 'Stay back', attitude: '' }],
    });
    expect(result).toMatchObject({ ok: true });

    expect(calls.find((c) => c.table === 'team_members')?.filters).toMatchObject({ team_id: TEAM });
    expect(calls.find((c) => c.table === 'practice_notes')?.payload).toMatchObject({ overall_notes: 'Good energy', coach_notes: null });
    const playerNotes = calls.find((c) => c.table === 'practice_player_notes')?.payload as Record<string, unknown>[];
    expect(playerNotes[0]).toMatchObject({ player_id: PLAYER, hitting: 'Stay back', attitude: null });
    // The player's own reflection is never overwritten by the coach.
    expect(playerNotes[0]).not.toHaveProperty('player_notes');
  });

  it('should leave overall and coach notes alone when a save leaves them out', async () => {
    const { db, calls } = fakeDb({
      'practices.select': practiceRow(),
      'team_members.select': role('head_coach'),
      'players.select': { data: [{ id: PLAYER }] },
    });
    expect(await savePracticeNotes(db, 'c', { practiceId: PRACTICE, coachNotes: '', players: [{ playerId: PLAYER, hitting: 'x' }] })).toMatchObject({ ok: true });
    const notes = calls.find((c) => c.table === 'practice_notes')?.payload as Record<string, unknown>;
    expect(notes).toMatchObject({ coach_notes: null });
    expect(notes).not.toHaveProperty('overall_notes');

    const playersOnly = fakeDb({ 'practices.select': practiceRow(), 'team_members.select': role('head_coach'), 'players.select': { data: [{ id: PLAYER }] } });
    await savePracticeNotes(playersOnly.db, 'c', { practiceId: PRACTICE, players: [{ playerId: PLAYER, hitting: 'x' }] });
    expect(playersOnly.calls.some((c) => c.table === 'practice_notes')).toBe(false);
  });

  it('should write one row per player when a player is sent twice, the last one winning', async () => {
    const { db, calls } = fakeDb({
      'practices.select': practiceRow(),
      'team_members.select': role('head_coach'),
      'players.select': { data: [{ id: PLAYER }] },
    });
    await savePracticeNotes(db, 'c', {
      practiceId: PRACTICE,
      players: [{ playerId: PLAYER, hitting: 'first' }, { playerId: PLAYER, hitting: 'second' }],
    });
    const rows = calls.find((c) => c.table === 'practice_player_notes')?.payload as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ player_id: PLAYER, hitting: 'second' });
  });

  it("should refuse notes about another team's player, before writing anything", async () => {
    const { db, calls } = fakeDb({
      'practices.select': practiceRow(),
      'team_members.select': role('head_coach'),
      'players.select': { data: [{ id: PLAYER }] },
    });
    const result = await savePracticeNotes(db, 'c', {
      practiceId: PRACTICE,
      players: [{ playerId: PLAYER }, { playerId: OTHER_PLAYER }],
    });
    expect(result).toMatchObject({ ok: false, code: 'invalid' });
    expect(calls.some((c) => c.op === 'upsert')).toBe(false);
  });
});

describe('savePracticeSelfNotes', () => {
  it("should save a player's own notes on their team's practice", async () => {
    const { db, calls } = fakeDb({ 'players.select': { data: { id: PLAYER, team_id: TEAM } }, 'practices.select': practiceRow() });
    expect(await savePracticeSelfNotes(db, 'me', { practiceId: PRACTICE, playerId: PLAYER, playerNotes: 'Felt good' })).toMatchObject({ ok: true });
    expect(calls.find((c) => c.table === 'players')?.filters).toMatchObject({ id: PLAYER, user_id: 'me' });
    expect(calls.find((c) => c.op === 'upsert')?.payload).toMatchObject({ player_id: PLAYER, player_notes: 'Felt good' });
  });

  it("should refuse someone else's player, and another team's practice", async () => {
    expect(await savePracticeSelfNotes(fakeDb({ 'players.select': { data: null } }).db, 'me', { practiceId: PRACTICE, playerId: PLAYER }))
      .toMatchObject({ ok: false, code: 'forbidden' });
    const elsewhere = fakeDb({ 'players.select': { data: { id: PLAYER, team_id: 'other-team' } }, 'practices.select': practiceRow() });
    expect(await savePracticeSelfNotes(elsewhere.db, 'me', { practiceId: PRACTICE, playerId: PLAYER }))
      .toMatchObject({ ok: false, code: 'not_found' });
    expect(elsewhere.calls.some((c) => c.op === 'upsert')).toBe(false);
  });
});

describe('logPracticeRep', () => {
  it("should log the rep with the outcome's default bucket", async () => {
    const { db } = fakeDb({ 'practices.select': practiceRow(), 'team_members.select': role('assistant_coach'), 'players.select': { data: { team_id: TEAM } } });
    expect(await logPracticeRep(db, 'c', { practiceId: PRACTICE, playerId: PLAYER, outcome: 'swing_miss', coachTag: 'cold' })).toMatchObject({ ok: true });
    expect(mockInsertReps).toHaveBeenCalledWith(
      db,
      [{ practiceId: PRACTICE, playerId: PLAYER, outcome: 'swing_miss', outcomeCategory: 'negative', coachTag: 'cold' }],
      'c',
    );
  });

  it("should refuse a cancelled practice and another team's player", async () => {
    const cancelled = fakeDb({ 'practices.select': practiceRow('cancelled'), 'team_members.select': role('head_coach') });
    expect(await logPracticeRep(cancelled.db, 'c', { practiceId: PRACTICE, playerId: PLAYER, outcome: 'walk' })).toMatchObject({ ok: false, code: 'conflict' });

    const stranger = fakeDb({ 'practices.select': practiceRow(), 'team_members.select': role('head_coach'), 'players.select': { data: { team_id: 'x' } } });
    expect(await logPracticeRep(stranger.db, 'c', { practiceId: PRACTICE, playerId: PLAYER, outcome: 'walk' })).toMatchObject({ ok: false, code: 'invalid' });
    expect(mockInsertReps).not.toHaveBeenCalled();
  });
});
