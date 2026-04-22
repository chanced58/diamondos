import type { PitchComplianceRule } from '../types/compliance';
import type { Player } from '../types/player';
import {
  PitcherAvailabilityStatus,
  type PitcherAvailability,
} from '../types/pitcher-availability';
import { getEligibleDate, getRequiredRestDays } from './pitch-count';

/**
 * Recent pitch-count rows relevant to availability — one per (player, game).
 * Only fields the availability computation reads are required. The caller
 * fetches these from `pitch_counts` via query helper.
 */
export interface PitchCountRecord {
  playerId: string;
  /** ISO date (YYYY-MM-DD) the game occurred. */
  gameDate: string;
  pitchCount: number;
}

const LIMITED_WINDOW_DAYS = 7;

/**
 * Threshold of pitches-in-last-7-days below which a pitcher is "available
 * even if they threw yesterday" (e.g., a reliever at 10 pitches can work
 * back-to-back under most rule sets). Set by the max-per-day rule minus a
 * buffer for in-game accumulation.
 */
function computeDailyLimit(rule: PitchComplianceRule): number {
  return rule.maxPitchesPerDay;
}

/**
 * Computes per-pitcher availability for a target date.
 *
 * Logic:
 *  - For each pitcher, find their most recent pitching appearance.
 *  - Apply the compliance rule's restDayThresholds to get a rest-day requirement.
 *  - Compare the eligible date (last-game-date + rest + 1) to the target date.
 *    - eligibleDate > target → status=UNAVAILABLE with nextAvailableDate
 *    - eligibleDate ≤ target and pitchesLast7d at/near limit → status=LIMITED
 *    - otherwise → status=AVAILABLE
 */
export function computePitcherAvailability(
  pitchers: Player[],
  recentCounts: PitchCountRecord[],
  rule: PitchComplianceRule,
  asOfDate: Date,
): PitcherAvailability[] {
  const asOfIso = asOfDate.toISOString().split('T')[0];
  const windowStart = new Date(asOfDate);
  windowStart.setDate(windowStart.getDate() - LIMITED_WINDOW_DAYS);

  const countsByPitcher = groupBy(recentCounts, (c) => c.playerId);
  const dailyLimit = computeDailyLimit(rule);

  return pitchers.map((pitcher) => {
    const history = (countsByPitcher.get(pitcher.id) ?? []).sort((a, b) =>
      b.gameDate.localeCompare(a.gameDate),
    );

    if (history.length === 0) {
      return {
        playerId: pitcher.id,
        status: PitcherAvailabilityStatus.AVAILABLE,
        nextAvailableDate: null,
        pitchesLast7d: 0,
        reason: 'No recent pitching history — fully rested.',
      };
    }

    const mostRecent = history[0];

    // "Last pitched" is just the most recent appearance. "Eligible date" is
    // the LATEST of (game + rest days) across every recent appearance — a
    // heavy earlier outing can block availability beyond the most-recent
    // outing's rest window. Treat them separately.
    let maxEligibleDate = asOfIso;
    let blockingEntry = mostRecent;
    let blockingRest = 0;
    for (const entry of history) {
      const rest = getRequiredRestDays(entry.pitchCount, rule);
      const eligible = getEligibleDate(entry.gameDate, rest);
      if (eligible > maxEligibleDate) {
        maxEligibleDate = eligible;
        blockingEntry = entry;
        blockingRest = rest;
      }
    }

    const pitchesLast7d = history
      .filter((h) => new Date(h.gameDate) >= windowStart)
      .reduce((sum, h) => sum + h.pitchCount, 0);

    if (maxEligibleDate > asOfIso) {
      return {
        playerId: pitcher.id,
        status: PitcherAvailabilityStatus.UNAVAILABLE,
        nextAvailableDate: maxEligibleDate,
        pitchesLast7d,
        lastPitchedAt: mostRecent.gameDate,
        reason:
          `Threw ${blockingEntry.pitchCount} on ${blockingEntry.gameDate} — ` +
          `needs ${blockingRest} rest day${blockingRest === 1 ? '' : 's'}. Clears ${maxEligibleDate}.`,
      };
    }

    // Available today, but check remaining headroom for "limited" flag.
    const remaining = Math.max(0, dailyLimit - pitchesLast7d);
    if (pitchesLast7d >= dailyLimit * 0.6) {
      return {
        playerId: pitcher.id,
        status: PitcherAvailabilityStatus.LIMITED,
        nextAvailableDate: null,
        pitchesLast7d,
        lastPitchedAt: mostRecent.gameDate,
        remainingPitches: remaining,
        reason:
          `Thrown ${pitchesLast7d} pitches in last 7 days. Available but limit to ~${remaining} more.`,
      };
    }

    return {
      playerId: pitcher.id,
      status: PitcherAvailabilityStatus.AVAILABLE,
      nextAvailableDate: null,
      pitchesLast7d,
      lastPitchedAt: mostRecent.gameDate,
      reason:
        pitchesLast7d === 0
          ? 'Rested and ready.'
          : `Light recent usage (${pitchesLast7d} pitches in 7d). Available.`,
    };
  });
}

function groupBy<T, K>(arr: T[], keyFn: (t: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of arr) {
    const key = keyFn(item);
    const bucket = map.get(key);
    if (bucket) bucket.push(item);
    else map.set(key, [item]);
  }
  return map;
}
