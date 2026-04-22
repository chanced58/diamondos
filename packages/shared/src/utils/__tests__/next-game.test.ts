import { GameStatus } from '../../types/game';
import type { Game } from '../../types/game';
import { GameLocationType } from '../../types/game';
import { findNextGame } from '../next-game';

function makeGame(overrides: Partial<Game> & { id: string; scheduledAt: string }): Game {
  return {
    seasonId: 'season-1',
    teamId: 'team-1',
    opponentName: 'Opp',
    locationType: GameLocationType.HOME,
    status: GameStatus.SCHEDULED,
    homeScore: 0,
    awayScore: 0,
    currentInning: 1,
    isTopOfInning: true,
    outs: 0,
    createdBy: 'user-1',
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('findNextGame', () => {
  const now = new Date('2026-04-22T12:00:00Z');

  it('returns null when games array is empty', () => {
    expect(findNextGame([], now)).toBeNull();
  });

  it('returns null when all games are in the past', () => {
    const games = [
      makeGame({ id: 'g1', scheduledAt: '2026-04-10T18:00:00Z' }),
      makeGame({ id: 'g2', scheduledAt: '2026-04-15T18:00:00Z' }),
    ];
    expect(findNextGame(games, now)).toBeNull();
  });

  it('returns the chronologically next scheduled game', () => {
    const games = [
      makeGame({ id: 'far', scheduledAt: '2026-05-01T18:00:00Z' }),
      makeGame({ id: 'soon', scheduledAt: '2026-04-25T18:00:00Z' }),
      makeGame({ id: 'past', scheduledAt: '2026-04-10T18:00:00Z' }),
    ];
    expect(findNextGame(games, now)?.id).toBe('soon');
  });

  it('ignores completed and in-progress games even if future-dated', () => {
    const games = [
      makeGame({ id: 'done', scheduledAt: '2026-04-25T18:00:00Z', status: GameStatus.COMPLETED }),
      makeGame({ id: 'active', scheduledAt: '2026-04-25T18:00:00Z', status: GameStatus.IN_PROGRESS }),
      makeGame({ id: 'real-next', scheduledAt: '2026-04-26T18:00:00Z' }),
    ];
    expect(findNextGame(games, now)?.id).toBe('real-next');
  });

  it('includes postponed games (they still need prepping)', () => {
    const games = [
      makeGame({ id: 'ppd', scheduledAt: '2026-04-25T18:00:00Z', status: GameStatus.POSTPONED }),
      makeGame({ id: 'later', scheduledAt: '2026-05-01T18:00:00Z' }),
    ];
    expect(findNextGame(games, now)?.id).toBe('ppd');
  });

  it('excludes cancelled games', () => {
    const games = [
      makeGame({ id: 'cxl', scheduledAt: '2026-04-25T18:00:00Z', status: GameStatus.CANCELLED }),
      makeGame({ id: 'real', scheduledAt: '2026-04-26T18:00:00Z' }),
    ];
    expect(findNextGame(games, now)?.id).toBe('real');
  });

  it('treats scheduledAt equal to fromDate as already started (excluded)', () => {
    const games = [
      makeGame({ id: 'equal', scheduledAt: now.toISOString() }),
      makeGame({ id: 'later', scheduledAt: '2026-04-25T18:00:00Z' }),
    ];
    expect(findNextGame(games, now)?.id).toBe('later');
  });
});
