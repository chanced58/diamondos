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

export const leagueScoringSettingsSchema = z
  .object({
    lineup: lineupSchema,
    guests: guestsSchema,
    gameLength: gameLengthSchema,
    substitutions: substitutionsSchema,
    rules: rulesSchema,
    compliance: complianceSchema,
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
  };
}

/**
 * Merge a (possibly partial / legacy) JSON blob with platform defaults so the
 * rest of the codebase can always rely on a fully-shaped LeagueScoringSettings.
 *
 * Tolerant by design: unknown keys are dropped, malformed nested values fall
 * back to the default for that subtree. This keeps the consumer side simple
 * even as the schema evolves.
 */
export function mergeWithDefaults(raw: unknown): LeagueScoringSettings {
  const defaults = defaultLeagueScoringSettings();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaults;
  const input = raw as Record<string, unknown>;

  return {
    lineup: mergeSubtree(defaults.lineup, input.lineup),
    guests: mergeSubtree(defaults.guests, input.guests),
    gameLength: mergeGameLength(defaults.gameLength, input.gameLength),
    substitutions: mergeSubtree(defaults.substitutions, input.substitutions),
    rules: mergeSubtree(defaults.rules, input.rules),
    compliance: mergeSubtree(defaults.compliance, input.compliance),
  };
}

function mergeSubtree<T extends Record<string, unknown>>(defaults: T, raw: unknown): T {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaults;
  const out = { ...defaults };
  for (const key of Object.keys(defaults)) {
    const value = (raw as Record<string, unknown>)[key];
    if (value !== undefined && typeof value === typeof defaults[key] && value !== null) {
      (out as Record<string, unknown>)[key] = value;
    } else if (defaults[key] === null && (value === null || typeof value === 'string')) {
      // nullable fields like defaultPitchRuleId
      (out as Record<string, unknown>)[key] = value as unknown;
    }
  }
  return out;
}

function mergeGameLength(
  defaults: LeagueScoringSettings['gameLength'],
  raw: unknown,
): LeagueScoringSettings['gameLength'] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaults;
  const input = raw as Record<string, unknown>;
  return {
    maxInnings:
      typeof input.maxInnings === 'number' && Number.isInteger(input.maxInnings)
        ? clamp(input.maxInnings, MIN_INNINGS, MAX_INNINGS_CAP)
        : defaults.maxInnings,
    mercy: mergeSubtree(defaults.mercy, input.mercy),
    runCap: mergeSubtree(defaults.runCap, input.runCap),
    tiebreakerExtras: mergeTiebreaker(defaults.tiebreakerExtras, input.tiebreakerExtras),
  };
}

function mergeTiebreaker(
  defaults: LeagueScoringSettings['gameLength']['tiebreakerExtras'],
  raw: unknown,
): LeagueScoringSettings['gameLength']['tiebreakerExtras'] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaults;
  const input = raw as Record<string, unknown>;
  const startBase =
    input.startBase === 1 || input.startBase === 2 || input.startBase === 3
      ? (input.startBase as 1 | 2 | 3)
      : defaults.startBase;
  return {
    enabled: typeof input.enabled === 'boolean' ? input.enabled : defaults.enabled,
    startBase,
    fromInning:
      typeof input.fromInning === 'number' && Number.isInteger(input.fromInning)
        ? clamp(input.fromInning, 1, MAX_INNINGS_CAP)
        : defaults.fromInning,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
