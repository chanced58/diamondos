import { EventType, PitchOutcome, PitchType } from '../types/game-event';
import type {
  GameEvent,
  OutPayload,
  PitchThrownPayload,
} from '../types/game-event';
import {
  WeaknessCode,
  WeaknessSeverity,
  type WeaknessSignal,
} from '../types/weakness';

/**
 * Thresholds for each weakness rule. Hardcoded for MVP; extract to a team
 * baseline table once we have enough sample data to tune per-team.
 */
export const WEAKNESS_THRESHOLDS = {
  /** Off-speed K count that trips the signal, plus ratio vs total Ks. */
  kVsOffspeedMin: 3,
  kVsOffspeedRatio: 0.5,

  /** Two-strike K rate that trips the signal (Ks / PAs that reached 2 strikes). */
  twoStrikeRate: 0.55,
  twoStrikeMinPAs: 4,

  /** RISP contact+walk rate below this counts as a failure. */
  rispBelowRate: 0.2,
  rispMinPAs: 4,

  /** Defensive errors in a single game. */
  errorsInGame: 2,

  /** Walks issued by our pitching staff in a single game. */
  walksIssued: 5,

  /** Left-on-base total for the team in a single game. */
  leftOnBase: 8,
} as const;

/**
 * Pitch types treated as "off-speed / breaking" for the k_vs_offspeed rule.
 */
const OFFSPEED_PITCH_TYPES: ReadonlySet<PitchType> = new Set([
  PitchType.CURVEBALL,
  PitchType.SLIDER,
  PitchType.CHANGEUP,
  PitchType.SPLITTER,
  PitchType.KNUCKLEBALL,
]);

function severityFromRatio(ratio: number, lowCut = 0.33, highCut = 0.66): WeaknessSeverity {
  if (ratio >= highCut) return WeaknessSeverity.HIGH;
  if (ratio >= lowCut) return WeaknessSeverity.MEDIUM;
  return WeaknessSeverity.LOW;
}

interface DetectContext {
  /** ISO ids of our team's players (used to classify batter-side vs pitcher-side events). */
  ourPlayerIds: Set<string>;
}

/**
 * Detects weaknesses from a single completed game's events.
 *
 * Rule-based and deterministic — each weakness has a severity score derived
 * from how far the observed metric overshoots its threshold. The caller
 * decides ordering (typically by `score` desc).
 *
 * `ourPlayerIds` is the set of platform-team player ids — used to decide
 * whether a given event represents our team batting (we're batting → PITCH
 * events carry opponentPitcherId) or our team fielding (we're pitching →
 * PITCH events carry our pitcherId). The detector relies on this to avoid
 * conflating our batters' Ks with our pitchers' Ks.
 */
export function detectWeaknesses(
  events: GameEvent[],
  ctx: DetectContext,
): WeaknessSignal[] {
  const signals: WeaknessSignal[] = [];

  const kVsOffspeed = detectKVsOffspeed(events, ctx);
  if (kVsOffspeed) signals.push(kVsOffspeed);

  const twoStrike = detectTwoStrikeApproach(events, ctx);
  if (twoStrike) signals.push(twoStrike);

  const risp = detectRispFailure(events, ctx);
  if (risp) signals.push(risp);

  const errors = detectDefensiveErrors(events, ctx);
  if (errors) signals.push(errors);

  const walks = detectWalksIssued(events, ctx);
  if (walks) signals.push(walks);

  const lob = detectLeftOnBase(events, ctx);
  if (lob) signals.push(lob);

  return signals.sort((a, b) => b.score - a.score);
}

// ─── Rule helpers ────────────────────────────────────────────────────────────

/**
 * An event represents "our batter" if the batterId is one of our players,
 * OR if there's an opponentPitcherId set (we're batting vs their pitcher).
 * This handles the case where the platform only sees one side.
 */
function isOurBatterEvent(
  payload: { batterId?: string; opponentPitcherId?: string },
  ourPlayerIds: Set<string>,
): boolean {
  if (payload.batterId && ourPlayerIds.has(payload.batterId)) return true;
  if (payload.opponentPitcherId) return true;
  return false;
}

/**
 * An event represents "our pitcher" if the pitcherId is one of our players,
 * OR if there's an opponentBatterId set (we're pitching vs their batter).
 */
function isOurPitcherEvent(
  payload: { pitcherId?: string; opponentBatterId?: string },
  ourPlayerIds: Set<string>,
): boolean {
  if (payload.pitcherId && ourPlayerIds.has(payload.pitcherId)) return true;
  if (payload.opponentBatterId) return true;
  return false;
}

function detectKVsOffspeed(
  events: GameEvent[],
  ctx: DetectContext,
): WeaknessSignal | null {
  const strikeouts = events.filter(
    (e) => e.eventType === EventType.STRIKEOUT && isOurBatterEvent(e.payload as never, ctx.ourPlayerIds),
  );
  if (strikeouts.length === 0) return null;

  // For each K, find the immediately preceding pitch event in the same inning.
  const sorted = [...events].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  let offspeedKs = 0;
  const eventIds: string[] = [];

  for (const k of strikeouts) {
    const kIdx = sorted.findIndex((e) => e.id === k.id);
    if (kIdx < 0) continue;
    for (let i = kIdx - 1; i >= 0; i--) {
      const prev = sorted[i];
      if (prev.inning !== k.inning || prev.isTopOfInning !== k.isTopOfInning) break;
      if (prev.eventType !== EventType.PITCH_THROWN) continue;
      const pitch = prev.payload as PitchThrownPayload;
      if (pitch.pitchType && OFFSPEED_PITCH_TYPES.has(pitch.pitchType)) {
        offspeedKs++;
        eventIds.push(k.id);
      }
      break;
    }
  }

  const ratio = offspeedKs / strikeouts.length;
  if (offspeedKs < WEAKNESS_THRESHOLDS.kVsOffspeedMin) return null;
  if (ratio < WEAKNESS_THRESHOLDS.kVsOffspeedRatio) return null;

  const overshoot = ratio - WEAKNESS_THRESHOLDS.kVsOffspeedRatio;
  return {
    code: WeaknessCode.K_VS_OFFSPEED,
    label: 'Strikeouts on off-speed',
    description:
      `${offspeedKs} of ${strikeouts.length} strikeouts came on off-speed / breaking balls — ` +
      'indicates a timing or pitch-recognition gap the lineup can address in BP.',
    severity: severityFromRatio(overshoot / (1 - WEAKNESS_THRESHOLDS.kVsOffspeedRatio)),
    score: ratio,
    evidence: {
      metric: `${offspeedKs} of ${strikeouts.length} Ks on off-speed`,
      value: offspeedKs,
      threshold: WEAKNESS_THRESHOLDS.kVsOffspeedMin,
      eventIds,
    },
    suggestedDeficitSlugs: [], // hydrated from weakness_deficit_map at query time
  };
}

function detectTwoStrikeApproach(
  events: GameEvent[],
  ctx: DetectContext,
): WeaknessSignal | null {
  // Walk events in sequence, grouping by inning/half to identify plate appearances
  // that reached 2 strikes. End a PA on: STRIKEOUT, HIT, WALK, HIT_BY_PITCH, OUT,
  // DROPPED_THIRD_STRIKE, SACRIFICE_BUNT, SACRIFICE_FLY, FIELD_ERROR, CATCHER_INTERFERENCE.
  const PA_END: ReadonlySet<EventType> = new Set([
    EventType.STRIKEOUT,
    EventType.HIT,
    EventType.WALK,
    EventType.HIT_BY_PITCH,
    EventType.OUT,
    EventType.DROPPED_THIRD_STRIKE,
    EventType.SACRIFICE_BUNT,
    EventType.SACRIFICE_FLY,
    EventType.FIELD_ERROR,
    EventType.CATCHER_INTERFERENCE,
  ]);

  const sorted = [...events].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  let strikesInCurrentPA = 0;
  let paIsOurs = false;
  let twoStrikePAs = 0;
  let twoStrikeKs = 0;
  const eventIds: string[] = [];

  const resetPA = () => {
    strikesInCurrentPA = 0;
    paIsOurs = false;
  };

  for (const e of sorted) {
    if (e.eventType === EventType.PITCH_THROWN) {
      const payload = e.payload as PitchThrownPayload;
      paIsOurs = isOurBatterEvent(payload, ctx.ourPlayerIds);
      const out = payload.outcome;
      if (
        out === PitchOutcome.CALLED_STRIKE ||
        out === PitchOutcome.SWINGING_STRIKE ||
        (out === PitchOutcome.FOUL && strikesInCurrentPA < 2) ||
        out === PitchOutcome.FOUL_TIP
      ) {
        strikesInCurrentPA++;
      }
      continue;
    }
    if (PA_END.has(e.eventType)) {
      const ours = paIsOurs || isOurBatterEvent(e.payload as never, ctx.ourPlayerIds);
      if (ours && strikesInCurrentPA >= 2) {
        twoStrikePAs++;
        if (e.eventType === EventType.STRIKEOUT) {
          twoStrikeKs++;
          eventIds.push(e.id);
        }
      }
      resetPA();
    }
  }

  if (twoStrikePAs < WEAKNESS_THRESHOLDS.twoStrikeMinPAs) return null;
  const rate = twoStrikeKs / twoStrikePAs;
  if (rate < WEAKNESS_THRESHOLDS.twoStrikeRate) return null;

  return {
    code: WeaknessCode.TWO_STRIKE_APPROACH,
    label: 'Two-strike approach',
    description:
      `Struck out in ${twoStrikeKs} of ${twoStrikePAs} two-strike at-bats ` +
      `(${(rate * 100).toFixed(0)}%). Hitters are not battling deep in counts.`,
    severity: severityFromRatio((rate - WEAKNESS_THRESHOLDS.twoStrikeRate) / (1 - WEAKNESS_THRESHOLDS.twoStrikeRate)),
    score: rate,
    evidence: {
      metric: `${twoStrikeKs}-for-${twoStrikePAs} in 2-strike counts`,
      value: rate,
      threshold: WEAKNESS_THRESHOLDS.twoStrikeRate,
      eventIds,
    },
    suggestedDeficitSlugs: [],
  };
}

function detectRispFailure(
  events: GameEvent[],
  ctx: DetectContext,
): WeaknessSignal | null {
  // Approximation: track runners on base via STOLEN_BASE/BASERUNNER_ADVANCE/HIT/OUT.
  // For MVP we use a simpler proxy: count our-team PAs that followed a SCORE or
  // ADVANCE-to-2nd/3rd event in the same half-inning with <2 outs. Full inning
  // simulation is out of scope for the detector — delegate to game-state.ts
  // consumers that need precise RISP tracking.
  //
  // For MVP the detector fires when the team had ≥ rispMinPAs plate appearances
  // in RISP contexts AND the hit+walk rate was below threshold.
  //
  // Lightweight heuristic: consider a PA to be "in RISP" if a SCORE event or
  // a BASERUNNER_ADVANCE with toBase >= 3 occurred in the same half-inning
  // before the PA ended.
  const PA_END: ReadonlySet<EventType> = new Set([
    EventType.STRIKEOUT,
    EventType.HIT,
    EventType.WALK,
    EventType.HIT_BY_PITCH,
    EventType.OUT,
    EventType.DROPPED_THIRD_STRIKE,
    EventType.SACRIFICE_BUNT,
    EventType.SACRIFICE_FLY,
    EventType.FIELD_ERROR,
    EventType.CATCHER_INTERFERENCE,
  ]);

  const sorted = [...events].sort((a, b) => a.sequenceNumber - b.sequenceNumber);

  let rispPAs = 0;
  let rispProductive = 0;
  let currentInning = -1;
  let currentHalfIsTop = true;
  let runnerOnSecondOrThird = false;

  for (const e of sorted) {
    // Reset per half-inning
    if (e.inning !== currentInning || e.isTopOfInning !== currentHalfIsTop) {
      currentInning = e.inning;
      currentHalfIsTop = e.isTopOfInning;
      runnerOnSecondOrThird = false;
    }

    if (
      e.eventType === EventType.BASERUNNER_ADVANCE ||
      e.eventType === EventType.STOLEN_BASE
    ) {
      const payload = e.payload as { toBase?: number };
      if ((payload.toBase ?? 0) >= 2) runnerOnSecondOrThird = true;
    }

    // PA_END must be evaluated BEFORE the HIT branch mutates baserunner state,
    // otherwise a leadoff double counts itself as a RISP PA (the PA ended
    // with no runner in scoring position; it PUTS a runner there).
    if (PA_END.has(e.eventType)) {
      const ours = isOurBatterEvent(e.payload as never, ctx.ourPlayerIds);
      if (ours && runnerOnSecondOrThird) {
        rispPAs++;
        if (e.eventType === EventType.HIT || e.eventType === EventType.WALK || e.eventType === EventType.HIT_BY_PITCH) {
          rispProductive++;
        }
      }
    }

    if (e.eventType === EventType.HIT) {
      // A hit could put a runner on 2B — rough heuristic: doubles/triples.
      // Evaluated AFTER the PA_END check so the current PA isn't affected.
      const p = e.payload as { hitType?: string };
      if (p.hitType === 'double' || p.hitType === 'triple') runnerOnSecondOrThird = true;
    }
  }

  if (rispPAs < WEAKNESS_THRESHOLDS.rispMinPAs) return null;
  const rate = rispProductive / rispPAs;
  if (rate >= WEAKNESS_THRESHOLDS.rispBelowRate) return null;

  return {
    code: WeaknessCode.RISP_FAILURE,
    label: 'RISP failure',
    description:
      `${rispProductive} hits/walks in ${rispPAs} at-bats with runners in scoring position ` +
      `(${(rate * 100).toFixed(0)}%). Clutch contact is lagging.`,
    severity: severityFromRatio((WEAKNESS_THRESHOLDS.rispBelowRate - rate) / WEAKNESS_THRESHOLDS.rispBelowRate),
    score: 1 - rate,
    evidence: {
      metric: `${rispProductive}-for-${rispPAs} with RISP`,
      value: rate,
      threshold: WEAKNESS_THRESHOLDS.rispBelowRate,
    },
    suggestedDeficitSlugs: [],
  };
}

function detectDefensiveErrors(
  events: GameEvent[],
  ctx: DetectContext,
): WeaknessSignal | null {
  // Defensive errors are ours only when we're fielding, i.e. when our
  // pitcher (equivalently the opposing batter) is involved. A FIELD_ERROR
  // or "reached-on-error" OUT during our at-bat is the OPPONENT's error —
  // not a weakness of ours.
  const errorEvents = events.filter(
    (e) => e.eventType === EventType.FIELD_ERROR &&
      isOurPitcherEvent(e.payload as never, ctx.ourPlayerIds),
  );
  const reachedOnError = events.filter((e) => {
    if (e.eventType !== EventType.OUT) return false;
    const payload = e.payload as OutPayload & { error?: boolean };
    if (payload.error !== true) return false;
    return isOurPitcherEvent(payload as never, ctx.ourPlayerIds);
  });

  const total = errorEvents.length + reachedOnError.length;
  if (total < WEAKNESS_THRESHOLDS.errorsInGame) return null;

  const eventIds = [...errorEvents, ...reachedOnError].map((e) => e.id);
  const overshoot = total - WEAKNESS_THRESHOLDS.errorsInGame;
  return {
    code: WeaknessCode.DEFENSIVE_ERRORS,
    label: 'Defensive errors',
    description:
      `${total} defensive errors this game. Focus PFP and transfer drills before the next outing.`,
    severity: overshoot >= 2 ? WeaknessSeverity.HIGH : overshoot >= 1 ? WeaknessSeverity.MEDIUM : WeaknessSeverity.LOW,
    score: Math.min(1, total / 5),
    evidence: {
      metric: `${total} errors`,
      value: total,
      threshold: WEAKNESS_THRESHOLDS.errorsInGame,
      eventIds,
    },
    suggestedDeficitSlugs: [],
  };
}

function detectWalksIssued(
  events: GameEvent[],
  ctx: DetectContext,
): WeaknessSignal | null {
  const walks = events.filter(
    (e) => e.eventType === EventType.WALK && isOurPitcherEvent(e.payload as never, ctx.ourPlayerIds),
  );
  if (walks.length < WEAKNESS_THRESHOLDS.walksIssued) return null;

  const overshoot = walks.length - WEAKNESS_THRESHOLDS.walksIssued;
  return {
    code: WeaknessCode.WALKS_ISSUED,
    label: 'Walks issued',
    description:
      `Staff issued ${walks.length} walks. Command work (glove-side / arm-side edges) should be a focus.`,
    severity: overshoot >= 3 ? WeaknessSeverity.HIGH : overshoot >= 1 ? WeaknessSeverity.MEDIUM : WeaknessSeverity.LOW,
    score: Math.min(1, walks.length / 10),
    evidence: {
      metric: `${walks.length} walks issued`,
      value: walks.length,
      threshold: WEAKNESS_THRESHOLDS.walksIssued,
      eventIds: walks.map((w) => w.id),
    },
    suggestedDeficitSlugs: [],
  };
}

function detectLeftOnBase(
  events: GameEvent[],
  ctx: DetectContext,
): WeaknessSignal | null {
  // LOB for our team ≈ runners who reached base minus runners who scored, at
  // the end of each half-inning where we were batting.
  const sorted = [...events].sort((a, b) => a.sequenceNumber - b.sequenceNumber);

  let runnersOnAtHalfEnd = 0;
  let runnersOnThisHalf = 0;
  let scoringThisHalf = 0;
  let currentInning = -1;
  let currentHalfIsTop = true;
  let halfIsOurs = false;

  const closeHalf = () => {
    if (halfIsOurs) {
      runnersOnAtHalfEnd += Math.max(0, runnersOnThisHalf - scoringThisHalf);
    }
    runnersOnThisHalf = 0;
    scoringThisHalf = 0;
    halfIsOurs = false;
  };

  for (const e of sorted) {
    if (e.inning !== currentInning || e.isTopOfInning !== currentHalfIsTop) {
      closeHalf();
      currentInning = e.inning;
      currentHalfIsTop = e.isTopOfInning;
    }
    if (e.eventType === EventType.HIT && isOurBatterEvent(e.payload as never, ctx.ourPlayerIds)) {
      runnersOnThisHalf++;
      halfIsOurs = true;
    }
    if (e.eventType === EventType.WALK && isOurBatterEvent(e.payload as never, ctx.ourPlayerIds)) {
      runnersOnThisHalf++;
      halfIsOurs = true;
    }
    if (e.eventType === EventType.HIT_BY_PITCH && isOurBatterEvent(e.payload as never, ctx.ourPlayerIds)) {
      runnersOnThisHalf++;
      halfIsOurs = true;
    }
    if (e.eventType === EventType.SCORE) {
      const payload = e.payload as { isOpponentScore?: boolean };
      if (!payload.isOpponentScore) scoringThisHalf++;
    }
  }
  closeHalf();

  if (runnersOnAtHalfEnd < WEAKNESS_THRESHOLDS.leftOnBase) return null;

  const overshoot = runnersOnAtHalfEnd - WEAKNESS_THRESHOLDS.leftOnBase;
  return {
    code: WeaknessCode.LEFT_ON_BASE,
    label: 'Left on base',
    description:
      `Left ${runnersOnAtHalfEnd} runners on base. Situational hitting and two-strike approach ` +
      'with runners on should be the prep focus.',
    severity: overshoot >= 4 ? WeaknessSeverity.HIGH : overshoot >= 2 ? WeaknessSeverity.MEDIUM : WeaknessSeverity.LOW,
    score: Math.min(1, runnersOnAtHalfEnd / 15),
    evidence: {
      metric: `${runnersOnAtHalfEnd} LOB`,
      value: runnersOnAtHalfEnd,
      threshold: WEAKNESS_THRESHOLDS.leftOnBase,
    },
    suggestedDeficitSlugs: [],
  };
}
