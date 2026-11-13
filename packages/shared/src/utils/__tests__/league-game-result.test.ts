import {
  computeLeagueGameStandings,
  computeLeagueGameStreaks,
  formatCurrentStreak,
  isFinishedBook,
  manualLinesToBattingStats,
  mergeBattingStats,
  mergePitchingStats,
  selectResultSource,
  type ManualBattingLine,
} from '../league-game-result';
import { conflictKey, type ScoreConflict } from '../reconcile-scorelogs';
import { finalizeBattingRates } from '../batting-stats';
import type { BattingStats } from '../../types/batting';
import type { PitchingStats } from '../../types/pitching';

const done = { completed: true, eventCount: 40 };
const empty = { completed: false, eventCount: 0 };

const finalScoreAway: ScoreConflict = { kind: 'final_score', side: 'away', homeLog: 3, awayLog: 4 };
const batting: ScoreConflict = { kind: 'player_batting', playerId: 'p1', stat: 'hits' as never, homeLog: 1, awayLog: 2 };
const pitching: ScoreConflict = { kind: 'player_pitching', playerId: 'p2', stat: 'strikeouts' as never, homeLog: 5, awayLog: 6 };

function line(overrides: Partial<ManualBattingLine>): ManualBattingLine {
  return {
    playerId: 'p1', ab: 0, r: 0, h: 0, doubles: 0, triples: 0, hr: 0,
    rbi: 0, bb: 0, so: 0, hbp: 0, sf: 0, sb: 0, ...overrides,
  };
}

describe('isFinishedBook', () => {
  it('should count a row its team completed', () => {
    expect(isFinishedBook({ status: 'completed', result_source: null })).toBe(true);
  });

  it('should not count a row completed by a written league result', () => {
    expect(isFinishedBook({ status: 'completed', result_source: 'paired' })).toBe(false);
    expect(isFinishedBook({ status: 'completed', result_source: 'manual' })).toBe(false);
  });

  it('should not count a missing or unfinished row', () => {
    expect(isFinishedBook(null)).toBe(false);
    expect(isFinishedBook({ status: 'in_progress', result_source: null })).toBe(false);
  });
});

describe('selectResultSource', () => {
  it('should use the only completed book', () => {
    expect(
      selectResultSource({ home: empty, away: done, reconciliation: null, hasManualResult: false }),
    ).toEqual({ kind: 'single', side: 'away' });
  });

  it('should ignore a completed book that recorded no events', () => {
    expect(
      selectResultSource({
        home: { completed: true, eventCount: 0 },
        away: { completed: false, eventCount: 12 },
        reconciliation: null,
        hasManualResult: false,
      }),
    ).toEqual({ kind: 'none' });
  });

  it('should prefer a scorebook over a hand-entered result', () => {
    expect(
      selectResultSource({ home: done, away: empty, reconciliation: null, hasManualResult: true }),
    ).toEqual({ kind: 'single', side: 'home' });
  });

  it('should use the hand-entered result when no book is complete', () => {
    expect(
      selectResultSource({ home: empty, away: empty, reconciliation: null, hasManualResult: true }),
    ).toEqual({ kind: 'manual' });
  });

  it('should return none when no book is complete and nothing was entered', () => {
    expect(
      selectResultSource({ home: empty, away: empty, reconciliation: null, hasManualResult: false }),
    ).toEqual({ kind: 'none' });
  });

  it('should keep the home book for the score when two books have no accepted overrides', () => {
    const source = selectResultSource({
      home: done,
      away: done,
      reconciliation: { conflicts: [finalScoreAway], overrides: [{ key: conflictKey(finalScoreAway), useAwayValue: false }] },
      hasManualResult: false,
    });
    expect(source).toEqual({ kind: 'dual', scoreFrom: 'home', playerLineFrom: new Map() });
  });

  it('should take the final score from the away book when the home coach accepted it', () => {
    const source = selectResultSource({
      home: done,
      away: done,
      reconciliation: { conflicts: [finalScoreAway], overrides: [{ key: conflictKey(finalScoreAway), useAwayValue: true }] },
      hasManualResult: false,
    });
    expect(source).toEqual({ kind: 'dual', scoreFrom: 'away', playerLineFrom: new Map() });
  });

  it("should keep a player's line in the home book when the home line was chosen for them", () => {
    const source = selectResultSource({
      home: done,
      away: done,
      reconciliation: {
        conflicts: [batting, pitching],
        overrides: [
          { key: conflictKey(batting), useAwayValue: false },
          { key: conflictKey(pitching), useAwayValue: false },
        ],
      },
      hasManualResult: false,
    });
    expect(source).toEqual({ kind: 'dual', scoreFrom: 'home', playerLineFrom: new Map() });
  });

  it('should take a player\'s whole line from the away book when any of their stats was overridden', () => {
    const source = selectResultSource({
      home: done,
      away: done,
      reconciliation: {
        conflicts: [finalScoreAway, batting, pitching],
        overrides: [
          { key: conflictKey(batting), useAwayValue: true },
          { key: conflictKey(pitching), useAwayValue: false },
        ],
      },
      hasManualResult: false,
    });
    expect(source).toEqual({
      kind: 'dual',
      scoreFrom: 'home',
      playerLineFrom: new Map([['p1', 'away']]),
    });
  });
});

describe('computeLeagueGameStandings', () => {
  it('should tally wins, losses, ties and runs from both teams\' perspectives', () => {
    const standings = computeLeagueGameStandings(
      [
        { homeTeamId: 'a', awayTeamId: 'b', homeRuns: 5, awayRuns: 2, forfeitWinnerTeamId: null },
        { homeTeamId: 'b', awayTeamId: 'a', homeRuns: 3, awayRuns: 3, forfeitWinnerTeamId: null },
      ],
      ['a', 'b', 'c'],
    );
    expect(standings.get('a')).toEqual({ wins: 1, losses: 0, ties: 1, runsFor: 8, runsAgainst: 5, winPct: 0.5 });
    expect(standings.get('b')).toEqual({ wins: 0, losses: 1, ties: 1, runsFor: 5, runsAgainst: 8, winPct: 0 });
    expect(standings.get('c')).toEqual({ wins: 0, losses: 0, ties: 0, runsFor: 0, runsAgainst: 0, winPct: 0 });
  });

  it('should count a forfeit as a win and a loss without runs', () => {
    const standings = computeLeagueGameStandings(
      [{ homeTeamId: 'a', awayTeamId: 'b', homeRuns: 0, awayRuns: 7, forfeitWinnerTeamId: 'a' }],
      ['a', 'b'],
    );
    expect(standings.get('a')).toMatchObject({ wins: 1, losses: 0, runsFor: 0, runsAgainst: 0, winPct: 1 });
    expect(standings.get('b')).toMatchObject({ wins: 0, losses: 1, runsFor: 0, runsAgainst: 0, winPct: 0 });
  });
});

describe('manualLinesToBattingStats', () => {
  it('should compute AVG, OBP, SLG and OPS from hand-entered lines', () => {
    const stats = manualLinesToBattingStats([line({ ab: 4, h: 2, doubles: 1, bb: 1 })]).get('p1')!;
    expect(stats.avg).toBeCloseTo(0.5);
    expect(stats.obp).toBeCloseTo(0.6);
    expect(stats.slg).toBeCloseTo(0.75);
    expect(stats.ops).toBeCloseTo(1.35);
    expect(stats.plateAppearances).toBe(5);
  });

  it('should sum several lines for the same player', () => {
    const stats = manualLinesToBattingStats([line({ ab: 3, h: 1 }), line({ ab: 1, h: 1 })]).get('p1')!;
    expect(stats.atBats).toBe(4);
    expect(stats.hits).toBe(2);
    expect(stats.gamesAppeared).toBe(2);
  });
});

function reducerLine(): BattingStats {
  const stats = {
    ...manualLinesToBattingStats([line({ ab: 4, h: 1, bb: 1 })]).get('p1')!,
    battedBalls: 4,
    hardHitBalls: 2,
    qab: 3,
  };
  delete (stats as Partial<BattingStats>).qabPlateAppearances;
  finalizeBattingRates(stats);
  return stats;
}

describe('mergeBattingStats', () => {
  it('should leave hand-entered games out of QAB percentage', () => {
    const reducer = reducerLine();
    const manual = manualLinesToBattingStats([line({ ab: 10, h: 5 })]).get('p1')!;
    const merged = mergeBattingStats(reducer, manual);
    expect(reducer.qabPct).toBeCloseTo(3 / 5);
    expect(merged.qabPct).toBeCloseTo(reducer.qabPct);
    expect(merged.hardHitPct).toBeCloseTo(reducer.hardHitPct);
    expect(merged.plateAppearances).toBe(15);
    expect(merged.hits).toBe(6);
  });

  it('should keep QAB percentage stable when merging a merged line again', () => {
    const merged = mergeBattingStats(reducerLine(), manualLinesToBattingStats([line({ ab: 10 })]).get('p1')!);
    const again = mergeBattingStats(merged, reducerLine());
    expect(again.qab).toBe(6);
    expect(again.qabPct).toBeCloseTo(6 / 10);
  });

  it('should recompute rates from the summed counts', () => {
    const a = manualLinesToBattingStats([line({ ab: 4, h: 1 })]).get('p1')!;
    const b = manualLinesToBattingStats([line({ ab: 4, h: 3 })]).get('p1')!;
    expect(mergeBattingStats(a, b).avg).toBeCloseTo(0.5);
  });

  it('should keep the second line\'s name when the first line has none', () => {
    const manual = manualLinesToBattingStats([line({ ab: 1 })]).get('p1')!;
    const named = { ...reducerLine(), playerName: 'Alex Ramirez' };
    expect(mergeBattingStats(manual, named).playerName).toBe('Alex Ramirez');
  });
});

function pitcher(overrides: Partial<PitchingStats>): PitchingStats {
  const baByCount: PitchingStats['baByCount'] = {
    '0-0': { atBats: 2, hits: 1, average: 0.5 },
  };
  return {
    playerId: 'p2', playerName: 'P', gamesAppeared: 1, inningsPitchedOuts: 9,
    totalPitches: 50, strikes: 30, balls: 20, strikePercentage: 0.6,
    firstPitchStrikes: 5, firstPitchStrikePercentage: 0, threeBallCountPAs: 1,
    threeZeroCountPAs: 0, totalPAs: 10, threeBallCountPercentage: 0, threeZeroCountPercentage: 0,
    hitsAllowed: 3, runsAllowed: 2, earnedRunsAllowed: 2, walksAllowed: 1, strikeouts: 4,
    hitBatters: 0, wildPitches: 0, era: 0, whip: 0, strikeoutsPerSeven: 0, walksPerSeven: 0,
    baByCount, ...overrides,
  };
}

describe('mergePitchingStats', () => {
  it('should sum counts and recompute ERA with the seven-inning convention', () => {
    const merged = mergePitchingStats(pitcher({}), pitcher({ inningsPitchedOuts: 12, earnedRunsAllowed: 1 }));
    expect(merged.inningsPitchedOuts).toBe(21);
    expect(merged.earnedRunsAllowed).toBe(3);
    expect(merged.era).toBeCloseTo((3 * 7) / 7);
    expect(merged.whip).toBeCloseTo((2 + 6) / 7);
    expect(merged.baByCount['0-0']).toEqual({ atBats: 4, hits: 2, average: 0.5 });
  });

  it('should recompute ERA over 9 innings for an adult league', () => {
    const merged = mergePitchingStats(pitcher({}), pitcher({ inningsPitchedOuts: 12, earnedRunsAllowed: 1 }), 9);
    expect(merged.era).toBeCloseTo((3 * 9) / 7);
    expect(merged.whip).toBeCloseTo((2 + 6) / 7);
  });

  it('should keep count buckets that only the second line has', () => {
    const second = pitcher({ baByCount: { '3-2': { atBats: 4, hits: 1, average: 0.25 } } });
    const merged = mergePitchingStats(pitcher({}), second);
    expect(merged.baByCount['0-0']).toEqual({ atBats: 2, hits: 1, average: 0.5 });
    expect(merged.baByCount['3-2']).toEqual({ atBats: 4, hits: 1, average: 0.25 });
  });

  it('should keep the second line\'s name when the first line has none', () => {
    expect(mergePitchingStats(pitcher({ playerName: '' }), pitcher({})).playerName).toBe('P');
  });
});

describe('formatCurrentStreak', () => {
  it('should count the latest run of the same result', () => {
    expect(formatCurrentStreak(['L', 'W', 'W', 'W'])).toBe('W3');
    expect(formatCurrentStreak(['W', 'W', 'L'])).toBe('L1');
  });

  it('should treat a tie as its own streak', () => {
    expect(formatCurrentStreak(['W', 'T', 'T'])).toBe('T2');
  });

  it('should be empty before the first game', () => {
    expect(formatCurrentStreak([])).toBe('');
  });
});

describe('computeLeagueGameStreaks', () => {
  const game = (homeTeamId: string, awayTeamId: string, homeRuns: number, awayRuns: number, forfeitWinnerTeamId: string | null = null) =>
    ({ homeTeamId, awayTeamId, homeRuns, awayRuns, forfeitWinnerTeamId });

  it('should follow each team through its games in the order played', () => {
    const streaks = computeLeagueGameStreaks([
      game('a', 'b', 5, 2),
      game('b', 'a', 1, 4),
      game('c', 'b', 3, 3),
    ]);
    expect(streaks.get('a')).toBe('W2');
    expect(streaks.get('b')).toBe('T1');
    expect(streaks.get('c')).toBe('T1');
  });

  it('should count a forfeit as a win and a loss whatever the runs', () => {
    const streaks = computeLeagueGameStreaks([game('a', 'b', 6, 1), game('a', 'b', 0, 0, 'b')]);
    expect(streaks.get('a')).toBe('L1');
    expect(streaks.get('b')).toBe('W1');
  });

  it('should leave out teams that have not played', () => {
    expect(computeLeagueGameStreaks([game('a', 'b', 1, 0)]).has('c')).toBe(false);
  });
});
