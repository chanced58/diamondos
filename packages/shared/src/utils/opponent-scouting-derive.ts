import { EventType, PitchType } from '../types/game-event';
import type { GameEvent, PitchThrownPayload } from '../types/game-event';
import type { OpponentPlayer } from '../types/opponent';
import { BatsThrows, PlayerPosition } from '../types/player';
import {
  OpponentScoutingCategory,
  type DerivedScoutingTag,
} from '../types/scouting-tag';

/**
 * Minimum samples required before emitting each tag type. Guards against
 * noisy conclusions from tiny early-season samples.
 */
export const SCOUTING_DERIVE_MIN_SAMPLES = {
  pitchMix: 20,
  /** Minimum rostered pitchers required before emitting a handedness tag —
   *  avoids firing on 1–2-pitcher samples. */
  handedness: 3,
  batterProfile: 15,
} as const;

/**
 * Derives structured scouting tags from our team's past events against a
 * specific opponent plus the opponent's roster.
 *
 * Inputs are assumed to be pre-filtered to events from prior games vs this
 * opponent (the caller handles the Supabase query). Pure function — no I/O.
 */
export function deriveOpponentTendencies(
  eventsVsOpponent: GameEvent[],
  opponentPlayers: OpponentPlayer[],
): DerivedScoutingTag[] {
  return [
    ...derivePitchMix(eventsVsOpponent, opponentPlayers),
    ...derivePitcherHandedness(opponentPlayers),
  ];
}

function derivePitchMix(
  events: GameEvent[],
  _opponentPlayers: OpponentPlayer[],
): DerivedScoutingTag[] {
  // Past-games events include pitches from BOTH sides. Limit to pitches
  // thrown by the opponent — identified by payload.opponentPitcherId.
  // When only pitcherId is set, the pitcher is one of OUR players — skip.
  // (The caller already scopes events to games vs this opponent, so any
  // opponentPitcherId in the payload is that opponent's pitcher.)
  const pitches = events.filter((e) => {
    if (e.eventType !== EventType.PITCH_THROWN) return false;
    const payload = e.payload as PitchThrownPayload;
    if (payload.opponentPitcherId) return true;
    return false;
  });
  const typed = pitches.filter((e) => (e.payload as PitchThrownPayload).pitchType);
  if (typed.length < SCOUTING_DERIVE_MIN_SAMPLES.pitchMix) return [];

  const counts = new Map<PitchType, number>();
  for (const p of typed) {
    const type = (p.payload as PitchThrownPayload).pitchType;
    if (!type) continue;
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }

  const tags: DerivedScoutingTag[] = [];
  for (const [pitchType, count] of counts) {
    const share = count / typed.length;
    if (share < 0.15) continue; // ignore pitch types that are < 15% of the mix
    tags.push({
      category: OpponentScoutingCategory.PITCH_MIX,
      tagValue: pitchType,
      note: `${(share * 100).toFixed(0)}% of tracked pitches were ${pitchType} (${count} of ${typed.length}).`,
      confidence: clamp01(share + Math.min(0.2, typed.length / 200)),
      evidence: {
        sampleSize: typed.length,
        count,
        share,
        gameIds: uniq(pitches.map((e) => e.gameId)),
      },
    });
  }
  return tags.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
}

function derivePitcherHandedness(opponentPlayers: OpponentPlayer[]): DerivedScoutingTag[] {
  const pitchers = opponentPlayers.filter(
    (p) => p.primaryPosition === PlayerPosition.PITCHER && p.isActive,
  );
  if (pitchers.length === 0) return [];

  const leftCount = pitchers.filter((p) => p.throws === BatsThrows.LEFT).length;
  const rightCount = pitchers.filter((p) => p.throws === BatsThrows.RIGHT).length;
  const total = leftCount + rightCount;
  if (total < SCOUTING_DERIVE_MIN_SAMPLES.handedness) return [];

  const leftShare = leftCount / total;
  const tags: DerivedScoutingTag[] = [];

  if (leftShare >= 0.3) {
    tags.push({
      category: OpponentScoutingCategory.PITCHER_HANDEDNESS,
      tagValue: 'lefty_heavy',
      note: `${leftCount} of ${total} rostered pitchers throw left-handed — prep vs LHP.`,
      confidence: 1, // roster data, not probabilistic
      evidence: {
        leftCount,
        rightCount,
        leftShare,
        pitcherIds: pitchers.map((p) => p.id),
      },
    });
  } else if (leftShare <= 0.1) {
    tags.push({
      category: OpponentScoutingCategory.PITCHER_HANDEDNESS,
      tagValue: 'righty_only',
      note: `${rightCount} of ${total} rostered pitchers throw right-handed.`,
      confidence: 1,
      evidence: {
        leftCount,
        rightCount,
        leftShare,
        pitcherIds: pitchers.map((p) => p.id),
      },
    });
  }

  return tags;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}
