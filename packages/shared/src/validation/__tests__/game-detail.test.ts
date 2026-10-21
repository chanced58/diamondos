import {
  cancelGameInputSchema,
  gameDetailResponseSchema,
  resolveReconciliationConflictInputSchema,
} from '../game-detail';

const GAME_ID = '11111111-1111-4111-8111-111111111111';

const detail = {
  game: {
    id: GAME_ID,
    teamId: 'team',
    status: 'completed',
    opponentName: 'Eagles',
    opponentTeamId: null,
    scheduledAt: '2026-10-20T23:00:00.000Z',
    timeZone: 'America/Chicago',
    locationType: 'neutral',
    neutralHomeTeam: 'opponent',
    venueName: null,
    notes: null,
    homeScore: 4,
    awayScore: 3,
    currentInning: 7,
    latitude: null,
    longitude: null,
    tournamentId: null,
  },
  viewer: { isCoach: true },
  hasLineup: true,
  hasOpponentLineup: false,
  takeaways: { lostGame: true, unavailable: false, items: [] },
  reconciliation: null,
};

describe('cancelGameInputSchema', () => {
  it('should default notifyTeam to false', () => {
    expect(cancelGameInputSchema.parse({ gameId: GAME_ID })).toEqual({ gameId: GAME_ID, notifyTeam: false });
  });

  it('should reject a malformed game id', () => {
    expect(cancelGameInputSchema.safeParse({ gameId: 'nope' }).success).toBe(false);
  });
});

describe('resolveReconciliationConflictInputSchema', () => {
  it('should require a non-blank conflict key and an explicit choice', () => {
    const base = { reconciliationId: GAME_ID, conflictKey: 'final_score:home' };
    expect(resolveReconciliationConflictInputSchema.safeParse({ ...base, useAwayValue: true }).success).toBe(true);
    expect(resolveReconciliationConflictInputSchema.safeParse(base).success).toBe(false);
    expect(
      resolveReconciliationConflictInputSchema.safeParse({ ...base, conflictKey: '  ', useAwayValue: true }).success,
    ).toBe(false);
  });
});

describe('gameDetailResponseSchema', () => {
  it('should accept a full payload and strip unknown keys', () => {
    const parsed = gameDetailResponseSchema.parse({ ...detail, extra: 'ignored' });
    // Older servers omit the venue address and place id; they parse as null.
    expect(parsed).toEqual({ ...detail, game: { ...detail.game, venueAddress: null, placeId: null } });
  });

  it('should reject an unknown game status', () => {
    const game = { ...detail.game, status: 'suspended' };
    expect(gameDetailResponseSchema.safeParse({ ...detail, game }).success).toBe(false);
  });
});
