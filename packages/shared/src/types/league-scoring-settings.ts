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
}
