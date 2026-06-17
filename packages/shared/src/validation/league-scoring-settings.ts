import { z } from 'zod';
import type { LeagueScoringSettings } from '../types/league-scoring-settings';

export const MAX_BATTERS_CAP = 30;
export const MIN_BATTERS_CAP = 9;
export const MIN_INNINGS = 1;
export const MAX_INNINGS_CAP = 15;
export const STANDARD_INNINGS = 9;

const lineupSchema = z
  .object({
    allowExpanded: z.boolean(),
    maxBatters: z.number().int().min(MIN_BATTERS_CAP).max(MAX_BATTERS_CAP),
    allowMidGameExtension: z.boolean(),
    continuousBattingOrder: z.boolean(),
  })
  .strict();

const guestsSchema = z
  .object({
    allowed: z.boolean(),
    countTowardStatsDefault: z.boolean(),
  })
  .strict();

const mercySchema = z
  .object({
    enabled: z.boolean(),
    runDiff: z.number().int().min(1).max(30),
    afterInning: z.number().int().min(1).max(MAX_INNINGS_CAP),
  })
  .strict();

const runCapSchema = z
  .object({
    enabled: z.boolean(),
    value: z.number().int().min(1).max(30),
  })
  .strict();

const tiebreakerExtrasSchema = z
  .object({
    enabled: z.boolean(),
    startBase: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    fromInning: z.number().int().min(1).max(MAX_INNINGS_CAP),
  })
  .strict();

const gameLengthSchema = z
  .object({
    maxInnings: z.number().int().min(MIN_INNINGS).max(MAX_INNINGS_CAP),
    mercy: mercySchema,
    runCap: runCapSchema,
    tiebreakerExtras: tiebreakerExtrasSchema,
  })
  .strict();

const substitutionsSchema = z
  .object({
    courtesyRunnerForCatcherPitcher: z.boolean(),
  })
  .strict();

const rulesSchema = z
  .object({
    droppedThirdStrike: z.boolean(),
  })
  .strict();

const complianceSchema = z
  .object({
    defaultPitchRuleId: z.string().uuid().nullable(),
  })
  .strict();

const scorekeepingSchema = z
  .object({
    dualScorekeeper: z.boolean(),
  })
  .strict();

export const leagueScoringSettingsSchema = z
  .object({
    lineup: lineupSchema,
    guests: guestsSchema,
    gameLength: gameLengthSchema,
    substitutions: substitutionsSchema,
    rules: rulesSchema,
    compliance: complianceSchema,
    scorekeeping: scorekeepingSchema,
  })
  .strict();

export type LeagueScoringSettingsInput = z.infer<typeof leagueScoringSettingsSchema>;

export function defaultLeagueScoringSettings(): LeagueScoringSettings {
  return {
    lineup: {
      allowExpanded: true,
      maxBatters: MAX_BATTERS_CAP,
      allowMidGameExtension: true,
      continuousBattingOrder: false,
    },
    guests: {
      allowed: false,
      countTowardStatsDefault: true,
    },
    gameLength: {
      maxInnings: STANDARD_INNINGS,
      mercy: { enabled: false, runDiff: 10, afterInning: 5 },
      runCap: { enabled: false, value: 5 },
      tiebreakerExtras: { enabled: false, startBase: 2, fromInning: STANDARD_INNINGS + 1 },
    },
    substitutions: {
      courtesyRunnerForCatcherPitcher: false,
    },
    rules: {
      droppedThirdStrike: true,
    },
    compliance: {
      defaultPitchRuleId: null,
    },
    scorekeeping: {
      dualScorekeeper: false,
    },
  };
}

/**
 * Merge a (possibly partial / legacy) JSON blob with platform defaults so the
 * rest of the codebase can always rely on a fully-shaped LeagueScoringSettings.
 *
 * Each leaf is validated against the same range/type constraints used by the
 * strict schema. Invalid values silently fall back to the default for that
 * field — including range violations (e.g. `maxBatters: 5` falls back to the
 * default 30, not silently accepted). Unknown keys are dropped.
 */
export function mergeWithDefaults(raw: unknown): LeagueScoringSettings {
  const defaults = defaultLeagueScoringSettings();
  return tolerantSchema(defaults).parse(raw);
}

/**
 * Build a Zod schema where every leaf has a `.catch(default)` clause so any
 * parse-time error (wrong type, out of range, missing field) falls back to
 * the supplied default. The whole thing is wrapped in a top-level `.catch`
 * for the "raw isn't an object at all" case.
 */
function tolerantSchema(defaults: LeagueScoringSettings) {
  const lineup = z
    .object({
      allowExpanded: z.boolean().catch(defaults.lineup.allowExpanded),
      maxBatters: z
        .number()
        .int()
        .min(MIN_BATTERS_CAP)
        .max(MAX_BATTERS_CAP)
        .catch(defaults.lineup.maxBatters),
      allowMidGameExtension: z.boolean().catch(defaults.lineup.allowMidGameExtension),
      continuousBattingOrder: z.boolean().catch(defaults.lineup.continuousBattingOrder),
    })
    .catch(defaults.lineup);

  const guests = z
    .object({
      allowed: z.boolean().catch(defaults.guests.allowed),
      countTowardStatsDefault: z.boolean().catch(defaults.guests.countTowardStatsDefault),
    })
    .catch(defaults.guests);

  const mercy = z
    .object({
      enabled: z.boolean().catch(defaults.gameLength.mercy.enabled),
      runDiff: z.number().int().min(1).max(30).catch(defaults.gameLength.mercy.runDiff),
      afterInning: z
        .number()
        .int()
        .min(1)
        .max(MAX_INNINGS_CAP)
        .catch(defaults.gameLength.mercy.afterInning),
    })
    .catch(defaults.gameLength.mercy);

  const runCap = z
    .object({
      enabled: z.boolean().catch(defaults.gameLength.runCap.enabled),
      value: z.number().int().min(1).max(30).catch(defaults.gameLength.runCap.value),
    })
    .catch(defaults.gameLength.runCap);

  const tiebreakerExtras = z
    .object({
      enabled: z.boolean().catch(defaults.gameLength.tiebreakerExtras.enabled),
      startBase: z
        .union([z.literal(1), z.literal(2), z.literal(3)])
        .catch(defaults.gameLength.tiebreakerExtras.startBase),
      fromInning: z
        .number()
        .int()
        .min(1)
        .max(MAX_INNINGS_CAP)
        .catch(defaults.gameLength.tiebreakerExtras.fromInning),
    })
    .catch(defaults.gameLength.tiebreakerExtras);

  const gameLength = z
    .object({
      maxInnings: z
        .number()
        .int()
        .min(MIN_INNINGS)
        .max(MAX_INNINGS_CAP)
        .catch(defaults.gameLength.maxInnings),
      mercy,
      runCap,
      tiebreakerExtras,
    })
    .catch(defaults.gameLength);

  const substitutions = z
    .object({
      courtesyRunnerForCatcherPitcher: z
        .boolean()
        .catch(defaults.substitutions.courtesyRunnerForCatcherPitcher),
    })
    .catch(defaults.substitutions);

  const rules = z
    .object({
      droppedThirdStrike: z.boolean().catch(defaults.rules.droppedThirdStrike),
    })
    .catch(defaults.rules);

  const compliance = z
    .object({
      defaultPitchRuleId: z
        .string()
        .uuid()
        .nullable()
        .catch(defaults.compliance.defaultPitchRuleId),
    })
    .catch(defaults.compliance);

  const scorekeeping = z
    .object({
      dualScorekeeper: z.boolean().catch(defaults.scorekeeping.dualScorekeeper),
    })
    .catch(defaults.scorekeeping);

  return z
    .object({ lineup, guests, gameLength, substitutions, rules, compliance, scorekeeping })
    .catch(defaults);
}
