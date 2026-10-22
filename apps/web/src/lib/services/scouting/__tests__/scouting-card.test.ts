import { scoutingCardResponseSchema } from '@baseball/shared';
import { generateScoutingCard, loadScoutingCard } from '../scouting-card';
import { fakeDb } from '../../__tests__/fake-db';

const mockGetLatestScoutingCard = jest.fn();
const mockInsertScoutingCard = jest.fn();
jest.mock('@baseball/database', () => ({
  getLatestScoutingCard: (...args: unknown[]) => mockGetLatestScoutingCard(...args),
  insertScoutingCard: (...args: unknown[]) => mockInsertScoutingCard(...args),
}));
const mockGenerate = jest.fn();
jest.mock('@/lib/ai/scouting-card', () => ({ generateScoutingCard: (...args: unknown[]) => mockGenerate(...args) }));
jest.mock('@/lib/ai/opponent-pitcher-stats', () => ({ computeOpponentPitcherStats: () => [] }));
const mockLog = jest.fn();
jest.mock('@/lib/ai/log-generation', () => ({ logAiGeneration: (...args: unknown[]) => mockLog(...args) }));
jest.mock('@/lib/ai/client', () => ({ AI_MODELS: { opus: 'claude-opus' } }));

const TEAM = '11111111-1111-4111-8111-111111111111';
const OPP = '22222222-2222-4222-8222-222222222222';
const HITTER = '33333333-3333-4333-8333-333333333333';

const coach = { 'team_members.select': { data: { role: 'assistant_coach' } } };
const ownedOpponent = {
  'opponent_teams.select': { data: { id: OPP, team_id: TEAM, name: 'Eagles', abbreviation: null, city: 'Boise', state_code: 'ID' } },
};

const aiCard = {
  hitterProfiles: [],
  pitcherTendencies: [],
  teamTendencies: { bullets: ['Aggressive on the first pitch.'] },
  keyMatchups: [],
  oneLineSummary: 'Make them earn it.',
};
const persisted = {
  id: 'card-1', opponentTeamId: OPP, teamId: TEAM, aiCard, hitterStats: [], pitcherStats: [], gameSampleCount: 2,
  model: 'claude-opus', generatedBy: 'coach-1', generatedAt: '2026-10-21T18:00:00Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetLatestScoutingCard.mockResolvedValue(null);
  mockGenerate.mockResolvedValue({ card: aiCard, model: 'claude-opus', usage: {} });
  mockInsertScoutingCard.mockResolvedValue(persisted);
});

describe('loadScoutingCard', () => {
  it('should give a coach the latest card and the games played against them', async () => {
    mockGetLatestScoutingCard.mockResolvedValue(persisted);
    const { db } = fakeDb({ ...coach, ...ownedOpponent, 'games.select': { data: null, count: 2 } });
    const result = await loadScoutingCard(db, 'coach-1', { opponentTeamId: OPP });
    if (!result.ok) throw new Error(result.error);

    expect(scoutingCardResponseSchema.parse(result.data)).toEqual(result.data);
    expect(result.data).toMatchObject({ priorGames: 2, opponentTeam: { name: 'Eagles', stateCode: 'ID' } });
    expect(mockGetLatestScoutingCard).toHaveBeenCalledWith(db, OPP, TEAM);
  });

  it('should keep cards from non-coaches', async () => {
    const { db } = fakeDb({ 'team_members.select': { data: { role: 'player' } }, ...ownedOpponent });
    expect(await loadScoutingCard(db, 'player-1', { opponentTeamId: OPP })).toMatchObject({ ok: false, code: 'forbidden' });
  });
});

describe('generateScoutingCard', () => {
  it('should refuse before calling the model when there are no games against them', async () => {
    const { db } = fakeDb({ ...coach, ...ownedOpponent, 'games.select': { data: [] }, 'opponent_players.select': { data: [] } });
    expect(await generateScoutingCard(db, 'coach-1', { opponentTeamId: OPP })).toMatchObject({ ok: false, code: 'conflict' });
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("should card their hitters from our games, leaving out undone plays, and find our pitchers by enum position", async () => {
    const { db, calls } = fakeDb({
      ...coach,
      ...ownedOpponent,
      'games.select': { data: [{ id: 'g1' }, { id: 'g2' }] },
      'opponent_players.select': { data: [{ id: HITTER, first_name: 'X', last_name: 'Kling', primary_position: 'shortstop', bats: 'left' }] },
      'game_events.select': {
        data: [
          { id: 'e1', game_id: 'g1', sequence_number: 1, event_type: 'hit', payload: { batterId: HITTER, hitType: 'single' } },
          { id: 'e2', game_id: 'g1', sequence_number: 2, event_type: 'event_voided', payload: { voidedEventId: 'e1' } },
          { id: 'e3', game_id: 'g2', sequence_number: 1, event_type: 'hit', payload: { batterId: HITTER, hitType: 'double' } },
        ],
      },
      'players.select': { data: [{ first_name: 'Luke', last_name: 'Fox' }] },
    });

    const result = await generateScoutingCard(db, 'coach-1', { opponentTeamId: OPP });

    expect(result).toEqual({ ok: true, data: { card: persisted } });
    const input = mockGenerate.mock.calls[0][0];
    expect(input).toMatchObject({ opponentName: 'Eagles', opponentCity: 'Boise', gameSampleCount: 2, ourPitchers: ['Luke Fox'] });
    // The double counts; the voided single doesn't.
    expect(input.hitterStats.find((h: { opponentPlayerId: string }) => h.opponentPlayerId === HITTER)).toMatchObject({
      displayName: 'X Kling', position: 'shortstop', bats: 'left', h: 1,
    });
    expect(mockInsertScoutingCard).toHaveBeenCalledWith(db, expect.objectContaining({ teamId: TEAM, generatedBy: 'coach-1' }));
    expect(mockLog).toHaveBeenCalledWith(expect.objectContaining({ feature: 'scouting_card', status: 'success' }));
    const pitchers = calls.find((c) => c.table === 'players')!;
    expect(pitchers.filters).toEqual({
      team_id: TEAM,
      is_active: true,
      or: 'primary_position.eq.pitcher,secondary_positions.cs.{pitcher}',
    });
  });

  it('should log a failed generation and say so without the internal error', async () => {
    mockGenerate.mockRejectedValue(new Error('overloaded_error'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const { db } = fakeDb({
      ...coach,
      ...ownedOpponent,
      'games.select': { data: [{ id: 'g1' }] },
      'opponent_players.select': { data: [] },
      'game_events.select': { data: [] },
      'players.select': { data: [] },
    });

    expect(await generateScoutingCard(db, 'coach-1', { opponentTeamId: OPP })).toEqual({
      ok: false, code: 'failed', error: 'Scouting card generation failed. Please try again.',
    });
    expect(mockLog).toHaveBeenCalledWith(expect.objectContaining({ status: 'error', errorMessage: 'overloaded_error' }));
  });
});
