import { mergeWithDefaults, STANDARD_INNINGS, type LeagueScoringSettings } from '@baseball/shared';

/**
 * An adult league's scoring settings at setup: whatever the league already
 * has (merged with the defaults), with a nine-inning regulation game for its
 * rate stats (ERA, K/9, BB/9) instead of the high-school seven.
 */
export function adultLeagueScoringSettings(rawSettings: unknown): LeagueScoringSettings {
  const settings = mergeWithDefaults(rawSettings ?? {});
  return { ...settings, gameLength: { ...settings.gameLength, statInnings: STANDARD_INNINGS } };
}
