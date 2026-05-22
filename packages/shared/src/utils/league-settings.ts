import type { LeagueScoringSettings } from '../types/league-scoring-settings';
import { PlayerPosition } from '../types/player';
import type { LineScoreData } from './line-score';

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

/**
 * Returns the base where a ghost runner should be placed at the start of
 * the current half-inning under the league's tiebreaker rule. Returns null
 * when:
 *  - tiebreaker isn't enabled
 *  - we haven't reached the rule's `fromInning` yet
 *  - the half-inning has already begun (any baserunner or any out logged)
 *  - the configured base is already occupied
 *
 * The caller is expected to surface a prompt and emit a SUBSTITUTION event
 * with `runnerBase = result` so the event log keeps a record of the
 * placement.
 */
export function ghostRunnerBaseForHalf(
  settings: LeagueScoringSettings,
  inning: number,
  outs: number,
  runnersOnBase: {
    first: string | null;
    second: string | null;
    third: string | null;
  },
): 1 | 2 | 3 | null {
  const cfg = getTiebreakerExtras(settings);
  if (!cfg) return null;
  if (inning < cfg.fromInning) return null;
  if (outs > 0) return null;
  if (runnersOnBase.first || runnersOnBase.second || runnersOnBase.third) return null;
  return cfg.startBase;
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

/**
 * Runs scored in the half-inning currently being played.
 */
export function runsInCurrentHalf(
  lineScore: LineScoreData,
  currentInning: number,
  isTopOfInning: boolean,
): number {
  const idx = currentInning - 1;
  if (idx < 0) return 0;
  return isTopOfInning
    ? lineScore.awayRunsByInning[idx] ?? 0
    : lineScore.homeRunsByInning[idx] ?? 0;
}

/**
 * Does the run cap for this half-inning say "stop now"? Returns false if the
 * league hasn't enabled a cap. The caller is responsible for actually emitting
 * an INNING_CHANGE event when this is true.
 */
export function shouldEndHalfForRunCap(
  settings: LeagueScoringSettings,
  lineScore: LineScoreData,
  currentInning: number,
  isTopOfInning: boolean,
): boolean {
  const cap = getHalfInningRunCap(settings);
  if (cap == null) return false;
  return runsInCurrentHalf(lineScore, currentInning, isTopOfInning) >= cap;
}

export type GameEndReason = 'mercy' | 'innings_complete' | 'walkoff';

export interface GameEndDecision {
  reason: GameEndReason;
  /** Human-readable label suitable for surfacing in a banner. */
  message: string;
}

/**
 * Decide whether the game can end given current state and league settings.
 * Returns null if play should continue.
 *
 * The caller (ScoringBoard / mobile score) is expected to:
 *  - Surface a banner / confirmation when this returns non-null
 *  - Still wait for the coach to press "End Game" — this helper does not
 *    auto-emit GAME_END. Auto-emit would race with in-flight events on the
 *    offline-first mobile side.
 */
export function evaluateGameEnd(
  settings: LeagueScoringSettings,
  lineScore: LineScoreData,
  currentInning: number,
  isTopOfInning: boolean,
  outs: number,
): GameEndDecision | null {
  const regulation = getRegulationInnings(settings);
  const { mercy } = settings.gameLength;
  const home = lineScore.homeRuns;
  const away = lineScore.awayRuns;

  // Mercy rule: evaluated after a half-inning has concluded (outs == 3) or
  // when the inning has fully completed. We compare against the absolute
  // run differential — direction doesn't matter for ending the game early.
  if (mercy.enabled) {
    const diff = Math.abs(home - away);
    // A half-inning has "completed" if we have advanced past it. Use the
    // simpler check: the inning we are PAST must be >= mercy.afterInning.
    // When isTopOfInning=true and inning>afterInning, the previous bottom
    // half completed at inning-1. When isTopOfInning=false (bottom in
    // progress) the top of `inning` already completed.
    const lastCompletedInning = isTopOfInning ? currentInning - 1 : currentInning;
    if (lastCompletedInning >= mercy.afterInning && diff >= mercy.runDiff) {
      return {
        reason: 'mercy',
        message: `Mercy rule reached (${diff}-run lead after ${lastCompletedInning} innings).`,
      };
    }
  }

  // Walk-off: bottom of regulation or later, home team leads, current at-bat
  // ends or already ended.
  if (currentInning >= regulation && !isTopOfInning && home > away && outs >= 3) {
    return { reason: 'walkoff', message: `Walk-off — game ends in the bottom of the ${ordinal(currentInning)}.` };
  }

  // Regulation completed (top of inning after regulation, score not tied)
  if (currentInning > regulation && isTopOfInning && outs === 0 && home !== away) {
    return {
      reason: 'innings_complete',
      message: `${regulation} innings complete.`,
    };
  }

  return null;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}
