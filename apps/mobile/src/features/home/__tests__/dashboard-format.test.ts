import { dayParts, liveSituation, matchup, recordTiles, remoteLiveGames, result, upcomingDetail } from '../dashboard-format';

const live = (id: string, teamId: string) => ({
  id, teamId, teamName: 'Huskies', opponentName: 'Eagles', isHome: true, ourScore: 3, theirScore: 1, inning: 4, isTopOfInning: false, outs: 1,
});

describe('dashboard format', () => {
  it("should leave a scorer's own live games to the local resume card", () => {
    const games = [live('ours', 't1'), live('rival', 't2')];
    expect(remoteLiveGames(games, 't1', true).map((g) => g.id)).toEqual(['rival']);
    expect(remoteLiveGames(games, 't1', false).map((g) => g.id)).toEqual(['ours', 'rival']);
  });

  it('should describe matchups, situations and results', () => {
    expect(matchup(true, 'Eagles')).toBe('vs Eagles');
    expect(matchup(false, null)).toBe('@ TBD');
    expect(liveSituation({ inning: 4, isTopOfInning: false, outs: 1 })).toBe('Bot 4 · 1 out');
    expect([result(5, 2), result(1, 4), result(3, 3)]).toEqual(['W', 'L', 'T']);
  });

  it("should date items in the item's zone", () => {
    // 01:30 UTC on Oct 28 is still Oct 27 in Denver.
    expect(dayParts('2026-10-28T01:30:00Z', 'America/Denver')).toEqual({ month: 'OCT', day: '27' });
    expect(upcomingDetail('2026-10-28T01:30:00Z', 'America/Denver', 'Home · Main field')).toBe('7:30 PM · Home · Main field');
  });

  it('should build the record and run-diff tiles', () => {
    expect(recordTiles({ wins: 3, losses: 1, runsFor: 20, runsAgainst: 24 }, 4)).toEqual({
      record: '3–1',
      tracked: '4 games tracked',
      runDiff: '-4',
      runs: '20 RF · 24 RA',
      trend: 'down',
    });
    expect(recordTiles({ wins: 1, losses: 0, runsFor: 5, runsAgainst: 2 }, 1)).toMatchObject({ tracked: '1 game tracked', runDiff: '+3', trend: 'up' });
  });
});
