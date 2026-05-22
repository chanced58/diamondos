import type { LeagueScoringSettings } from '../types/league-scoring-settings';
import { PlayerPosition } from '../types/player';

/**
 * Pure helpers that read flags out of a fully-shaped LeagueScoringSettings.
 * Consumers should normalize JSON into LeagueScoringSettings first via
 * `mergeWithDefaults()` from the validation module.
 */

export function getMaxBattingOrder(settings: LeagueScoringSettings): number {
  if (!settings.lineup.allowExpanded) return 9;
  return settings.lineup.maxBatters;
}

export function isMidGameExtensionAllowed(settings: LeagueScoringSettings): boolean {
  return settings.lineup.allowExpanded && settings.lineup.allowMidGameExtension;
}

export function isContinuousBattingOrder(settings: LeagueScoringSettings): boolean {
  return settings.lineup.continuousBattingOrder;
}

/**
 * True if the current run differential triggers the league's mercy rule.
 * Pass the raw lead (winning − losing run total) and the inning that just
 * completed (i.e. evaluate this after each half-inning ends).
 */
export function shouldEndGameForMercy(
  settings: LeagueScoringSettings,
  leadingMargin: number,
  completedInning: number,
): boolean {
  const { mercy } = settings.gameLength;
  if (!mercy.enabled) return false;
  if (completedInning < mercy.afterInning) return false;
  return leadingMargin >= mercy.runDiff;
}

export function getHalfInningRunCap(settings: LeagueScoringSettings): number | null {
  const { runCap } = settings.gameLength;
  return runCap.enabled ? runCap.value : null;
}

export function getRegulationInnings(settings: LeagueScoringSettings): number {
  return settings.gameLength.maxInnings;
}

export function getTiebreakerExtras(
  settings: LeagueScoringSettings,
): { startBase: 1 | 2 | 3; fromInning: number } | null {
  const { tiebreakerExtras } = settings.gameLength;
  if (!tiebreakerExtras.enabled) return null;
  return { startBase: tiebreakerExtras.startBase, fromInning: tiebreakerExtras.fromInning };
}

export function isCourtesyRunnerAllowed(
  settings: LeagueScoringSettings,
  fromPosition: PlayerPosition,
): boolean {
  if (!settings.substitutions.courtesyRunnerForCatcherPitcher) return false;
  return fromPosition === PlayerPosition.CATCHER || fromPosition === PlayerPosition.PITCHER;
}

export function isDroppedThirdStrikeAllowed(settings: LeagueScoringSettings): boolean {
  return settings.rules.droppedThirdStrike;
}
