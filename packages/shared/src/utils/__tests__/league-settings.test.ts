import { defaultLeagueScoringSettings } from '../../validation/league-scoring-settings';
import {
  getMaxBattingOrder,
  isMidGameExtensionAllowed,
  shouldEndGameForMercy,
  getHalfInningRunCap,
  getTiebreakerExtras,
  isCourtesyRunnerAllowed,
  runsInCurrentHalf,
  shouldEndHalfForRunCap,
  evaluateGameEnd,
} from '../league-settings';
import { PlayerPosition } from '../../types/player';
import type { LineScoreData } from '../line-score';

function makeLineScore(over: {
  awayByInning?: number[];
  homeByInning?: number[];
}): LineScoreData {
  const away = over.awayByInning ?? [];
  const home = over.homeByInning ?? [];
  return {
    awayRunsByInning: away,
    homeRunsByInning: home,
    awayRuns: away.reduce((s, n) => s + n, 0),
    homeRuns: home.reduce((s, n) => s + n, 0),
    awayHits: 0,
    homeHits: 0,
    awayErrors: 0,
    homeErrors: 0,
  };
}

describe('getMaxBattingOrder', () => {
  it('returns 9 when expanded lineups are disabled', () => {
    const s = defaultLeagueScoringSettings();
    s.lineup.allowExpanded = false;
    expect(getMaxBattingOrder(s)).toBe(9);
  });

  it('returns the configured cap when expanded lineups are enabled', () => {
    const s = defaultLeagueScoringSettings();
    s.lineup.maxBatters = 15;
    expect(getMaxBattingOrder(s)).toBe(15);
  });
});

describe('isMidGameExtensionAllowed', () => {
  it('is false when expanded lineups are disabled, regardless of the sub-flag', () => {
    const s = defaultLeagueScoringSettings();
    s.lineup.allowExpanded = false;
    s.lineup.allowMidGameExtension = true;
    expect(isMidGameExtensionAllowed(s)).toBe(false);
  });

  it('respects the sub-flag when expanded lineups are enabled', () => {
    const s = defaultLeagueScoringSettings();
    s.lineup.allowMidGameExtension = false;
    expect(isMidGameExtensionAllowed(s)).toBe(false);
    s.lineup.allowMidGameExtension = true;
    expect(isMidGameExtensionAllowed(s)).toBe(true);
  });
});

describe('shouldEndGameForMercy', () => {
  it('is false when mercy is disabled', () => {
    const s = defaultLeagueScoringSettings();
    expect(shouldEndGameForMercy(s, 20, 7)).toBe(false);
  });

  it('triggers only after the required inning AND when the lead meets the threshold', () => {
    const s = defaultLeagueScoringSettings();
    s.gameLength.mercy = { enabled: true, runDiff: 10, afterInning: 5 };
    expect(shouldEndGameForMercy(s, 10, 4)).toBe(false); // too early
    expect(shouldEndGameForMercy(s, 9, 5)).toBe(false);  // not enough lead
    expect(shouldEndGameForMercy(s, 10, 5)).toBe(true);
    expect(shouldEndGameForMercy(s, 11, 6)).toBe(true);
  });
});

describe('getHalfInningRunCap', () => {
  it('returns null when disabled', () => {
    expect(getHalfInningRunCap(defaultLeagueScoringSettings())).toBeNull();
  });
  it('returns the configured cap when enabled', () => {
    const s = defaultLeagueScoringSettings();
    s.gameLength.runCap = { enabled: true, value: 7 };
    expect(getHalfInningRunCap(s)).toBe(7);
  });
});

describe('getTiebreakerExtras', () => {
  it('returns null when disabled', () => {
    expect(getTiebreakerExtras(defaultLeagueScoringSettings())).toBeNull();
  });

  it('returns the startBase + fromInning when enabled', () => {
    const s = defaultLeagueScoringSettings();
    s.gameLength.tiebreakerExtras = { enabled: true, startBase: 2, fromInning: 8 };
    expect(getTiebreakerExtras(s)).toEqual({ startBase: 2, fromInning: 8 });
  });
});

describe('isCourtesyRunnerAllowed', () => {
  it('is false when the flag is off', () => {
    const s = defaultLeagueScoringSettings();
    expect(isCourtesyRunnerAllowed(s, PlayerPosition.CATCHER)).toBe(false);
  });

  it('is restricted to catcher and pitcher even when the flag is on', () => {
    const s = defaultLeagueScoringSettings();
    s.substitutions.courtesyRunnerForCatcherPitcher = true;
    expect(isCourtesyRunnerAllowed(s, PlayerPosition.CATCHER)).toBe(true);
    expect(isCourtesyRunnerAllowed(s, PlayerPosition.PITCHER)).toBe(true);
    expect(isCourtesyRunnerAllowed(s, PlayerPosition.SHORTSTOP)).toBe(false);
  });
});

describe('runsInCurrentHalf', () => {
  it('returns runs from the right half of the current inning', () => {
    const ls = makeLineScore({ awayByInning: [0, 3, 1], homeByInning: [2, 0, 0] });
    expect(runsInCurrentHalf(ls, 2, true)).toBe(3);   // top of 2nd
    expect(runsInCurrentHalf(ls, 1, false)).toBe(2);  // bottom of 1st
  });

  it('returns 0 for an unstarted inning', () => {
    const ls = makeLineScore({});
    expect(runsInCurrentHalf(ls, 1, true)).toBe(0);
  });
});

describe('shouldEndHalfForRunCap', () => {
  it('is false when the cap is disabled', () => {
    const s = defaultLeagueScoringSettings();
    const ls = makeLineScore({ awayByInning: [50] });
    expect(shouldEndHalfForRunCap(s, ls, 1, true)).toBe(false);
  });

  it('triggers as soon as the half reaches the cap', () => {
    const s = defaultLeagueScoringSettings();
    s.gameLength.runCap = { enabled: true, value: 5 };
    const ls = makeLineScore({ awayByInning: [5] });
    expect(shouldEndHalfForRunCap(s, ls, 1, true)).toBe(true);
    const lsUnder = makeLineScore({ awayByInning: [4] });
    expect(shouldEndHalfForRunCap(s, lsUnder, 1, true)).toBe(false);
  });
});

describe('evaluateGameEnd', () => {
  it('returns null when nothing dictates an end', () => {
    const s = defaultLeagueScoringSettings();
    const ls = makeLineScore({ awayByInning: [1], homeByInning: [0] });
    expect(evaluateGameEnd(s, ls, 1, false, 1)).toBeNull();
  });

  it('triggers mercy after the configured inning + diff', () => {
    const s = defaultLeagueScoringSettings();
    s.gameLength.mercy = { enabled: true, runDiff: 10, afterInning: 5 };
    // After the top of the 6th (so isTopOfInning=false, currentInning=6 means
    // top of 6 just finished). Away 12, Home 0 → diff 12 after 5+ innings.
    const ls = makeLineScore({
      awayByInning: [3, 3, 3, 3, 0, 0],
      homeByInning: [0, 0, 0, 0, 0, 0],
    });
    const decision = evaluateGameEnd(s, ls, 6, false, 0);
    expect(decision?.reason).toBe('mercy');
  });

  it('does not trigger mercy before the configured inning', () => {
    const s = defaultLeagueScoringSettings();
    s.gameLength.mercy = { enabled: true, runDiff: 10, afterInning: 5 };
    // 4 innings completed (we're now in top of 5), away leads by 12.
    const ls = makeLineScore({
      awayByInning: [12, 0, 0, 0],
      homeByInning: [0, 0, 0, 0],
    });
    expect(evaluateGameEnd(s, ls, 5, true, 0)).toBeNull();
  });

  it('recognises a walk-off at the end of regulation', () => {
    const s = defaultLeagueScoringSettings(); // maxInnings=9
    const ls = makeLineScore({
      awayByInning: [0, 0, 0, 0, 0, 0, 0, 0, 0],
      homeByInning: [0, 0, 0, 0, 0, 0, 0, 0, 1],
    });
    const decision = evaluateGameEnd(s, ls, 9, false, 3);
    expect(decision?.reason).toBe('walkoff');
  });

  it('recognises regulation complete at top-of-10 with no tie', () => {
    const s = defaultLeagueScoringSettings();
    const ls = makeLineScore({
      awayByInning: [1, 0, 0, 0, 0, 0, 0, 0, 0],
      homeByInning: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    });
    const decision = evaluateGameEnd(s, ls, 10, true, 0);
    expect(decision?.reason).toBe('innings_complete');
  });
});
