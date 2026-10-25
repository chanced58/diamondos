import { practiceDetailResponseSchema, type PracticeRep } from '@baseball/shared';
import { loadPractice } from '../load-practice';
import { fakeDb } from '../../__tests__/fake-db';

const mockListReps = jest.fn();
jest.mock('@baseball/database', () => ({
  ...jest.requireActual('@baseball/database'),
  listTeamPracticeReps: (...args: unknown[]) => mockListReps(...args),
}));

const TEAM = '11111111-1111-4111-8111-111111111111';
const PRACTICE = '22222222-2222-4222-8222-222222222222';
const PLAYER = '33333333-3333-4333-8333-333333333333';

const practiceRow = {
  data: {
    id: PRACTICE, team_id: TEAM, scheduled_at: '2026-10-25T23:00:00Z', duration_minutes: 90, location: 'Field 2',
    address: null, latitude: null, longitude: null, status: 'scheduled', run_status: 'not_started', plan: '',
    linked_game_id: 'game-1', prep_focus_summary: 'Lefty starter',
  },
};
const notesRow = (playerId: string, extra: Record<string, string | null> = {}) => ({
  player_id: playerId, pitching: null, hitting: null, fielding_catching: null, baserunning: null, athleticism: null, attitude: null,
  player_notes: null, ...extra,
});
const rep = (playerId: string, outcome: string, category: string): PracticeRep => ({
  id: `${playerId}-${outcome}-${Math.random()}`, practiceId: PRACTICE, playerId, outcome, outcomeCategory: category as PracticeRep['outcomeCategory'],
  metrics: {}, recordedAt: new Date().toISOString(),
});

beforeEach(() => {
  jest.clearAllMocks();
  mockListReps.mockResolvedValue([]);
});

describe('loadPractice', () => {
  it('should give a coach the notes, roster, every player’s notes and ranked hitters', async () => {
    mockListReps.mockResolvedValue(Array.from({ length: 6 }, () => rep(PLAYER, 'hit_hard', 'positive')));
    const { db } = fakeDb({
      'practices.select': practiceRow,
      'team_members.select': { data: { role: 'head_coach' } },
      'games.select': { data: { opponent_name: 'Wolves', scheduled_at: '2026-10-26T23:00:00Z' } },
      'practice_notes.select': { data: { overall_notes: 'Great day', coach_notes: 'Watch Sam' } },
      'players.select': { data: [{ id: PLAYER, first_name: 'Sam', last_name: 'Lee', jersey_number: 7 }] },
      'practice_player_notes.select': { data: [notesRow(PLAYER, { hitting: 'Stay back' })] },
    });
    const result = await loadPractice(db, 'coach-1', { practiceId: PRACTICE });
    if (!result.ok) throw new Error(result.error);

    expect(practiceDetailResponseSchema.parse(result.data)).toEqual(result.data);
    expect(result.data.viewer).toBe('coach');
    expect(result.data.practice.prep).toEqual({ opponentName: 'Wolves', scheduledAt: '2026-10-26T23:00:00Z', focusSummary: 'Lefty starter' });
    expect(result.data.practice.plan).toBeNull();
    expect(result.data.coach).toMatchObject({
      canEditStructure: true,
      coachNotes: 'Watch Sam',
      players: [{ id: PLAYER, jerseyNumber: 7 }],
      playerNotes: { [PLAYER]: { hitting: 'Stay back' } },
      hitters: { totalReps: 6, hot: [{ playerId: PLAYER, rank: 1, qualityReps: 6, totalReps: 6 }] },
    });
  });

  it('should give a player only their own notes, editable, and no coach notes', async () => {
    const { db, calls } = fakeDb({
      'practices.select': practiceRow,
      'team_members.select': { data: { role: 'player' } },
      'games.select': { data: null },
      'practice_notes.select': { data: { overall_notes: 'Great day', coach_notes: 'Watch Sam' } },
      'players.select': { data: { id: PLAYER, first_name: 'Sam', last_name: 'Lee' } },
      'practice_player_notes.select': { data: [notesRow(PLAYER, { player_notes: 'Felt good' })] },
    });
    const result = await loadPractice(db, 'sam', { practiceId: PRACTICE });
    if (!result.ok) throw new Error(result.error);

    expect(result.data.viewer).toBe('player');
    expect(result.data.coach).toBeNull();
    expect(JSON.stringify(result.data)).not.toContain('Watch Sam');
    expect(result.data.myPlayers).toEqual([
      expect.objectContaining({ playerId: PLAYER, name: 'Sam Lee', canEditSelfNotes: true, notes: expect.objectContaining({ playerNotes: 'Felt good' }) }),
    ]);
    expect(calls.find((c) => c.table === 'practice_player_notes')?.filters).toMatchObject({ player_id: [PLAYER] });
    expect(mockListReps).not.toHaveBeenCalled();
  });

  it("should give a parent each linked child on the team, read-only, and skip other teams' children", async () => {
    const { db } = fakeDb({
      'practices.select': practiceRow,
      'team_members.select': { data: { role: 'parent' } },
      'games.select': { data: null },
      'practice_notes.select': { data: null },
      'players.select': { data: null },
      'parent_player_links.select': {
        data: [
          { players: { id: PLAYER, first_name: 'Sam', last_name: 'Lee', team_id: TEAM } },
          { players: { id: 'elsewhere', first_name: 'Max', last_name: 'Lee', team_id: 'other-team' } },
        ],
      },
      'practice_player_notes.select': { data: [] },
    });
    const result = await loadPractice(db, 'parent-1', { practiceId: PRACTICE });
    if (!result.ok) throw new Error(result.error);
    expect(result.data.viewer).toBe('parent');
    expect(result.data.myPlayers).toEqual([{ playerId: PLAYER, name: 'Sam Lee', notes: null, canEditSelfNotes: false }]);
  });

  it('should hide the practice from someone off the team', async () => {
    const { db, calls } = fakeDb({ 'practices.select': practiceRow, 'team_members.select': { data: null } });
    expect(await loadPractice(db, 'stranger', { practiceId: PRACTICE })).toMatchObject({ ok: false, code: 'not_found' });
    expect(calls.some((c) => c.table === 'practice_notes')).toBe(false);
  });
});
