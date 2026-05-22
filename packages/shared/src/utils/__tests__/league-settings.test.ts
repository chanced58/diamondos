import { defaultLeagueScoringSettings } from '../../validation/league-scoring-settings';
import {
  getMaxBattingOrder,
  isMidGameExtensionAllowed,
  shouldEndGameForMercy,
  getHalfInningRunCap,
  getTiebreakerExtras,
  isCourtesyRunnerAllowed,
} from '../league-settings';
import { PlayerPosition } from '../../types/player';

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
