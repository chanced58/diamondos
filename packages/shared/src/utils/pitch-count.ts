import type { GameEvent } from '../types/game-event';
import { EventType } from '../types/game-event';
import type { PitchComplianceRule, PitchComplianceStatus } from '../types/compliance';
import { PITCH_COUNT_WARNING_THRESHOLD, PITCH_COUNT_DANGER_THRESHOLD } from '../constants/baseball';

/**
 * Counts the number of pitches thrown by a specific pitcher from an event array.
 * Events must include all game events (the function filters by type and pitcherId).
 */
export function countPitches(events: GameEvent[], pitcherId: string): number {
  return events.filter(
    (e) =>
      e.eventType === EventType.PITCH_THROWN &&
      (e.payload as { pitcherId?: string }).pitcherId === pitcherId,
  ).length;
}

/**
 * Returns the required rest days for a given pitch count under a specific rule.
 * Uses the restDayThresholds map: keys are minimum pitch thresholds.
 */
export function getRequiredRestDays(pitchCount: number, rule: PitchComplianceRule): number {
  const thresholds = Object.entries(rule.restDayThresholds)
    .map(([k, v]) => ({ minPitches: parseInt(k, 10), restDays: v }))
    .sort((a, b) => b.minPitches - a.minPitches); // descending

  for (const threshold of thresholds) {
    if (pitchCount >= threshold.minPitches) {
      return threshold.restDays;
    }
  }
  return 0;
}

/**
 * Calculates the date (ISO date string) when the pitcher is next eligible to pitch
 * based on the game date and required rest days.
 */
export function getEligibleDate(gameDateIso: string, restDays: number): string {
  const date = new Date(gameDateIso);
  date.setDate(date.getDate() + restDays + 1);
  return date.toISOString().split('T')[0];
}

/**
 * Returns full compliance status for a pitcher given their current pitch count,
 * the applicable rule, and the game date.
 */
export function getPitchComplianceStatus(
  playerId: string,
  pitchCount: number,
  rule: PitchComplianceRule,
  gameDateIso: string,
): PitchComplianceStatus {
  const maxAllowed = rule.maxPitchesPerDay;
  const percentUsed = pitchCount / maxAllowed;
  const requiredRestDays = getRequiredRestDays(pitchCount, rule);
  const eligibleDate = getEligibleDate(gameDateIso, requiredRestDays);

  return {
    playerId,
    currentCount: pitchCount,
    maxAllowed,
    percentUsed,
    isAtWarning: percentUsed >= PITCH_COUNT_WARNING_THRESHOLD && percentUsed < PITCH_COUNT_DANGER_THRESHOLD,
    isAtLimit: percentUsed >= PITCH_COUNT_DANGER_THRESHOLD && pitchCount <= maxAllowed,
    isOverLimit: pitchCount > maxAllowed,
    requiredRestDays,
    eligibleDate,
  };
}
