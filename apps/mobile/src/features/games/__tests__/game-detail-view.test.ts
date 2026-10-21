import type { GameDetailResponse } from '@baseball/shared';
import {
  gameDetailSections,
  locationLabel,
  matchupLabel,
  matchupTitle,
  opponentLabel,
  scoreFromOurSide,
} from '../game-detail-view';

type Game = GameDetailResponse['game'];

function detail(game: Partial<Game> = {}, isCoach = false): GameDetailResponse {
  return {
    game: {
      id: 'g1',
      teamId: 't1',
      status: 'scheduled',
      opponentName: 'Eagles',
      opponentTeamId: null,
      scheduledAt: '2026-10-20T23:00:00.000Z',
      timeZone: 'America/Chicago',
      locationType: 'home',
      neutralHomeTeam: null,
      venueName: null,
      venueAddress: null,
      placeId: null,
      notes: null,
      homeScore: 0,
      awayScore: 0,
      currentInning: null,
      latitude: null,
      longitude: null,
      tournamentId: null,
      ...game,
    },
    viewer: { isCoach },
    hasLineup: false,
    hasOpponentLineup: false,
    takeaways: null,
    reconciliation: null,
  };
}

describe('labels', () => {
  it('should treat a null or blank opponent as TBD', () => {
    expect(opponentLabel({ opponentName: null })).toBe('TBD');
    expect(opponentLabel({ opponentName: '   ' })).toBe('TBD');
    expect(opponentLabel({ opponentName: ' Eagles ' })).toBe('Eagles');
  });

  it('should title the matchup from our side, including neutral sites', () => {
    expect(matchupTitle(detail({ locationType: 'home' }).game)).toBe('vs Eagles');
    expect(matchupTitle(detail({ locationType: 'away' }).game)).toBe('@ Eagles');
    expect(matchupTitle(detail({ locationType: 'neutral', neutralHomeTeam: 'opponent' }).game)).toBe('@ Eagles');
    expect(locationLabel(detail({ locationType: 'neutral', neutralHomeTeam: 'us' }).game)).toBe('Neutral site (home)');
  });

  it('should label offline list rows from bare fields, keeping "vs" when the location is unknown', () => {
    expect(matchupLabel('Marsing', 'away')).toBe('@ Marsing');
    expect(matchupLabel('Marsing', 'neutral', 'opponent')).toBe('@ Marsing');
    expect(matchupLabel('Marsing', 'home')).toBe('vs Marsing');
    expect(matchupLabel('', undefined)).toBe('vs TBD');
  });

  it('should report the score as ours versus theirs whichever side we batted on', () => {
    expect(scoreFromOurSide(detail({ locationType: 'away', homeScore: 2, awayScore: 5 }).game))
      .toEqual({ us: 5, them: 2 });
    expect(scoreFromOurSide(detail({ locationType: 'home', homeScore: 2, awayScore: 5 }).game))
      .toEqual({ us: 2, them: 5 });
  });
});

describe('gameDetailSections', () => {
  it('should let a scorer start a scheduled game against a named opponent', () => {
    const sections = gameDetailSections(detail({}, true), true);
    expect(sections.score).toEqual({ kind: 'start', label: 'Score this game' });
    expect(sections.rsvpOpen).toBe(true);
    expect(sections.showAttendance).toBe(true);
    expect(sections.canReset).toBe(false);
    expect(sections.canCancel).toBe(true);
  });

  it('should block starting against a TBD opponent', () => {
    const sections = gameDetailSections(detail({ opponentName: null }, true), true);
    expect(sections.score).toEqual({ kind: 'needs_opponent' });
    expect(sections.showLineup).toBe(false);
  });

  it('should not offer the scorer for a scheduled game to a player or parent', () => {
    const sections = gameDetailSections(detail(), false);
    expect(sections.score).toBeNull();
    expect(sections.canEdit).toBe(false);
    expect(sections.canCancel).toBe(false);
    expect(sections.showAttendance).toBe(false);
  });

  it('should let anyone follow a live game but only scorers continue scoring', () => {
    expect(gameDetailSections(detail({ status: 'in_progress' }), false).score)
      .toEqual({ kind: 'continue', label: 'Follow live' });
    expect(gameDetailSections(detail({ status: 'in_progress' }, true), true).score)
      .toEqual({ kind: 'continue', label: 'Continue scoring' });
  });

  it('should give coaches recalculate and reset once a game has started', () => {
    const sections = gameDetailSections(detail({ status: 'completed' }, true), true);
    expect(sections.score).toEqual({ kind: 'final', label: 'View final scorebook' });
    expect(sections.showStatsAndHistory).toBe(true);
    expect(sections.canRecalculate).toBe(true);
    expect(sections.canReset).toBe(true);
    expect(sections.rsvpOpen).toBe(false);
  });

  it('should hide cancel and lineup on a cancelled game but still allow a reset', () => {
    const sections = gameDetailSections(detail({ status: 'cancelled' }, true), true);
    expect(sections.canCancel).toBe(false);
    expect(sections.showLineup).toBe(false);
    expect(sections.canReset).toBe(true);
    expect(sections.score).toBeNull();
  });

  it("should offer the opponent lineup to coaches, except a started tournament game's", () => {
    expect(gameDetailSections(detail({}, true), true).showOpponentLineup).toBe(true);
    expect(gameDetailSections(detail({}, false), false).showOpponentLineup).toBe(false);
    expect(gameDetailSections(detail({ status: 'in_progress' }, true), true).showOpponentLineup).toBe(true);
    expect(gameDetailSections(detail({ tournamentId: 'tour', status: 'scheduled' }, true), true).showOpponentLineup).toBe(true);
    expect(gameDetailSections(detail({ tournamentId: 'tour', status: 'in_progress' }, true), true).showOpponentLineup).toBe(false);
  });
});
