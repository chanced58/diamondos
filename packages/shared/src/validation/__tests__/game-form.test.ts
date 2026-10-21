import { createGameInputSchema, updateGameInputSchema } from '../game-form';

const TEAM_ID = '11111111-1111-4111-8111-111111111111';
const base = { teamId: TEAM_ID, date: '2026-10-22' };

describe('createGameInputSchema', () => {
  it('should apply the defaults the web form used', () => {
    const parsed = createGameInputSchema.parse({ ...base, opponentName: ' Eagles ' });
    expect(parsed).toMatchObject({
      opponentName: 'Eagles',
      opponentTbd: false,
      opponentTeamId: null,
      time: '12:00',
      locationType: 'home',
      neutralHomeTeam: null,
      venue: null,
      notes: null,
      notifyTeam: false,
      tournamentId: null,
    });
  });

  it('should require an opponent unless the game is TBD', () => {
    expect(createGameInputSchema.safeParse(base).success).toBe(false);
    expect(createGameInputSchema.safeParse({ ...base, opponentName: '   ' }).success).toBe(false);
    expect(createGameInputSchema.safeParse({ ...base, opponentTbd: true }).success).toBe(true);
  });

  it('should reject malformed dates and times', () => {
    expect(createGameInputSchema.safeParse({ ...base, opponentName: 'E', date: '10/22/2026' }).success).toBe(false);
    expect(createGameInputSchema.safeParse({ ...base, opponentName: 'E', time: '4pm' }).success).toBe(false);
  });

  it('should accept a typed venue without coordinates', () => {
    const parsed = createGameInputSchema.parse({ ...base, opponentName: 'E', venue: { name: 'Field 2' } });
    expect(parsed.venue).toEqual({ name: 'Field 2', address: null, latitude: null, longitude: null, placeId: null });
  });
});

describe('updateGameInputSchema', () => {
  it('should require the game id instead of the team id', () => {
    expect(updateGameInputSchema.safeParse({ date: '2026-10-22', opponentTbd: true }).success).toBe(false);
    expect(updateGameInputSchema.safeParse({ gameId: TEAM_ID, date: '2026-10-22', opponentTbd: true }).success)
      .toBe(true);
  });
});
