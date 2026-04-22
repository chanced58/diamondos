import {
  PracticeRepCoachTag,
  PracticeRepOutcomeCategory,
  type PracticeRep,
} from '../types/practice-rep';
import type { HotHitter, HotHitterEvidence } from '../types/hot-hitters';

/**
 * Score weights for the hot-hitter composite. Tuned on intuition for MVP —
 * expose via a `weights` param once we have tuning signal.
 *
 * The scoring is layered:
 *  1. outcomeCategory bucket (positive/neutral/negative) — ensures every
 *     recorded rep contributes, including walks, ground_outs, fly_outs, etc.
 *  2. specific outcome slug bonuses for the most telling plays
 *     (hit_hard > generic positive, swing_miss < generic negative).
 *  3. coach-tag bonuses layered on top.
 */
const SCORE_WEIGHTS = {
  categoryPositive: 1,
  categoryNegative: -1,
  hitHardBonus: 2,
  lineDriveBonus: 1,
  weakContactBonus: 0.5,   // added to the negative category base
  swingAndMissBonus: -0.5, // added to the negative category base
  coachHot: 4,
  coachCold: -3,
} as const;

const OUTCOME_HIT_HARD = 'hit_hard';
const OUTCOME_LINE_DRIVE = 'line_drive';
const OUTCOME_WEAK_CONTACT = 'weak_contact';
const OUTCOME_SWING_MISS = 'swing_miss';

const MIN_REPS_FOR_RANKING = 5;

/**
 * Ranks hitters by recent practice-rep performance. Only hitters with at
 * least MIN_REPS_FOR_RANKING in the lookback window are scored — too few
 * reps produce noisy signal.
 *
 * Pure function. `reps` should already be filtered to the lookback window
 * and to the team's roster (RLS handles that at query time).
 */
export function rankHotHitters(
  reps: PracticeRep[],
  opts?: { now?: Date; lookbackDays?: number },
): HotHitter[] {
  const now = opts?.now ?? new Date();
  const lookbackDays = opts?.lookbackDays ?? 3;
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - lookbackDays);
  const cutoffIso = cutoff.toISOString();

  const byPlayer = new Map<string, PracticeRep[]>();
  for (const rep of reps) {
    if (!rep.playerId) continue;
    if (rep.recordedAt < cutoffIso) continue;
    const bucket = byPlayer.get(rep.playerId);
    if (bucket) bucket.push(rep);
    else byPlayer.set(rep.playerId, [rep]);
  }

  const scored: Array<{ playerId: string; score: number; evidence: HotHitterEvidence }> = [];
  for (const [playerId, playerReps] of byPlayer) {
    if (playerReps.length < MIN_REPS_FOR_RANKING) continue;
    const evidence = summarize(playerReps);
    const score = normalize(scoreReps(playerReps, evidence), evidence.totalReps);
    scored.push({ playerId, score, evidence });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s, i) => ({
    playerId: s.playerId,
    score: s.score,
    rank: i + 1,
    evidence: s.evidence,
  }));
}

/**
 * Composite score = categorical base (every rep contributes by its
 * outcomeCategory bucket) + specific-outcome bonuses + coach-tag bonuses.
 */
function scoreReps(reps: PracticeRep[], evidence: HotHitterEvidence): number {
  let raw = 0;
  for (const r of reps) {
    if (r.outcomeCategory === PracticeRepOutcomeCategory.POSITIVE) {
      raw += SCORE_WEIGHTS.categoryPositive;
    } else if (r.outcomeCategory === PracticeRepOutcomeCategory.NEGATIVE) {
      raw += SCORE_WEIGHTS.categoryNegative;
    }
    if (r.outcome === OUTCOME_HIT_HARD) raw += SCORE_WEIGHTS.hitHardBonus;
    if (r.outcome === OUTCOME_LINE_DRIVE) raw += SCORE_WEIGHTS.lineDriveBonus;
    if (r.outcome === OUTCOME_WEAK_CONTACT) raw += SCORE_WEIGHTS.weakContactBonus;
    if (r.outcome === OUTCOME_SWING_MISS) raw += SCORE_WEIGHTS.swingAndMissBonus;
  }
  raw += evidence.coachTaggedHot * SCORE_WEIGHTS.coachHot;
  raw += evidence.coachTaggedCold * SCORE_WEIGHTS.coachCold;
  return raw;
}

function summarize(reps: PracticeRep[]): HotHitterEvidence {
  let hitHard = 0;
  let lineDrives = 0;
  let weakContact = 0;
  let swingAndMisses = 0;
  let coachTaggedHot = 0;
  let coachTaggedCold = 0;

  for (const r of reps) {
    if (r.outcome === OUTCOME_HIT_HARD) hitHard++;
    if (r.outcome === OUTCOME_LINE_DRIVE) lineDrives++;
    if (r.outcome === OUTCOME_WEAK_CONTACT) weakContact++;
    if (r.outcome === OUTCOME_SWING_MISS) swingAndMisses++;
    if (r.coachTag === PracticeRepCoachTag.HOT) coachTaggedHot++;
    if (r.coachTag === PracticeRepCoachTag.COLD) coachTaggedCold++;
  }

  return {
    totalReps: reps.length,
    hitHard,
    lineDrives,
    weakContact,
    swingAndMisses,
    coachTaggedHot,
    coachTaggedCold,
  };
}

/**
 * Map raw score to a 0–1 bounded value. Scores are rep-count-normalized and
 * then squashed through a smooth sigmoid-ish curve centered at 0.
 */
function normalize(raw: number, totalReps: number): number {
  const perRep = raw / Math.max(1, totalReps);
  return 1 / (1 + Math.exp(-perRep)); // logistic, returns (0, 1)
}

/**
 * Returns players whose recent-rep profile skews negative — used to suggest
 * lineup demotions. Same lookback + min-reps gate as rankHotHitters.
 */
export function identifyColdHitters(
  reps: PracticeRep[],
  opts?: { now?: Date; lookbackDays?: number },
): HotHitter[] {
  const now = opts?.now ?? new Date();
  const lookbackDays = opts?.lookbackDays ?? 3;
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - lookbackDays);
  const cutoffIso = cutoff.toISOString();

  const byPlayer = new Map<string, PracticeRep[]>();
  for (const rep of reps) {
    if (!rep.playerId) continue;
    if (rep.recordedAt < cutoffIso) continue;
    const bucket = byPlayer.get(rep.playerId);
    if (bucket) bucket.push(rep);
    else byPlayer.set(rep.playerId, [rep]);
  }

  const scored: Array<{ playerId: string; score: number; evidence: HotHitterEvidence }> = [];
  for (const [playerId, playerReps] of byPlayer) {
    if (playerReps.length < MIN_REPS_FOR_RANKING) continue;
    const evidence = summarize(playerReps);
    // Use outcomeCategory counts so every rep (including walks and generic
    // outs) contributes, then weight coach tags 2x.
    let negative = 0;
    let positive = 0;
    for (const r of playerReps) {
      if (r.outcomeCategory === PracticeRepOutcomeCategory.NEGATIVE) negative += 1;
      else if (r.outcomeCategory === PracticeRepOutcomeCategory.POSITIVE) positive += 1;
    }
    negative += evidence.coachTaggedCold * 2;
    positive += evidence.coachTaggedHot * 2;
    const coldness = (negative - positive) / evidence.totalReps;
    if (coldness <= 0) continue;
    scored.push({ playerId, score: coldness, evidence });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s, i) => ({
    playerId: s.playerId,
    score: s.score,
    rank: i + 1,
    evidence: s.evidence,
  }));
}

/**
 * Counts reps by outcome category — used by consumers that want bucket totals
 * without re-walking the array.
 */
export function tallyOutcomeCategories(
  reps: PracticeRep[],
): Record<PracticeRepOutcomeCategory, number> {
  const out = {
    [PracticeRepOutcomeCategory.POSITIVE]: 0,
    [PracticeRepOutcomeCategory.NEUTRAL]: 0,
    [PracticeRepOutcomeCategory.NEGATIVE]: 0,
  };
  for (const r of reps) out[r.outcomeCategory]++;
  return out;
}
