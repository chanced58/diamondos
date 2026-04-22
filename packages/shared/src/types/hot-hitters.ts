/**
 * Hot-hitter analysis types (Tier 6 F4 — lineup prep from BP data).
 */

export interface HotHitterEvidence {
  /** Reps in the lookback window. */
  totalReps: number;
  hitHard: number;
  lineDrives: number;
  weakContact: number;
  swingAndMisses: number;
  /** Count of coach-tagged 'hot' reps. */
  coachTaggedHot: number;
  /** Count of coach-tagged 'cold' reps. */
  coachTaggedCold: number;
}

export interface HotHitter {
  playerId: string;
  /** 0–1 composite score. Higher = hotter. */
  score: number;
  /** Ordered rank (1 = hottest). */
  rank: number;
  evidence: HotHitterEvidence;
}

export interface LineupSwapSuggestion {
  fromBattingOrder: number;
  toBattingOrder: number;
  /** Player currently in the from slot — the proposed demotion. */
  demotePlayerId: string;
  /** Player from the hot-hitter list — the proposed promotion. */
  promotePlayerId: string;
  reason: string;
}
