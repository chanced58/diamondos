/**
 * League-wide scoring feature flags.
 *
 * Persisted at `leagues.scoring_settings` as JSONB. Defaults preserve the
 * platform's current behavior — every existing league reads as if all flags
 * are at their defaults until the league admin opens the Settings portal.
 */
export interface LeagueScoringSettings {
  lineup: {
    allowExpanded: boolean;
    maxBatters: number;
    allowMidGameExtension: boolean;
    continuousBattingOrder: boolean;
  };
  guests: {
    allowed: boolean;
    countTowardStatsDefault: boolean;
  };
  gameLength: {
    maxInnings: number;
    mercy: {
      enabled: boolean;
      runDiff: number;
      afterInning: number;
    };
    runCap: {
      enabled: boolean;
      value: number;
    };
    tiebreakerExtras: {
      enabled: boolean;
      startBase: 1 | 2 | 3;
      fromInning: number;
    };
  };
  substitutions: {
    courtesyRunnerForCatcherPitcher: boolean;
  };
  rules: {
    droppedThirdStrike: boolean;
  };
  compliance: {
    defaultPitchRuleId: string | null;
  };
  scorekeeping: {
    /**
     * When true, both teams may independently score the same game (paired
     * games). The home team's log stays canonical; conflicts between the two
     * logs are surfaced after the game is marked done. Requires the opponent
     * to be a linked DiamondOS team; otherwise this is a no-op.
     */
    dualScorekeeper: boolean;
  };
}
