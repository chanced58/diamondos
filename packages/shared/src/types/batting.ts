export interface BattingStats {
  playerId: string;
  playerName: string;
  gamesAppeared: number;

  // Counting stats
  plateAppearances: number;
  atBats: number;         // PA − BB − HBP − SF − SH
  runs: number;
  hits: number;
  doubles: number;
  triples: number;
  homeRuns: number;
  rbi: number;
  walks: number;
  strikeouts: number;
  hitByPitch: number;
  sacrificeFlies: number;
  sacrificeHits: number;  // sacrifice bunts

  // Traditional rate stats
  /** H / AB; NaN when AB === 0 */
  avg: number;
  /** (H + BB + HBP) / (AB + BB + HBP + SF); NaN when denominator === 0 */
  obp: number;
  /** (1B + 2×2B + 3×3B + 4×HR) / AB; NaN when AB === 0 */
  slg: number;
  /** OBP + SLG */
  ops: number;

  // Advanced / sabermetric stats
  /** Isolated power: SLG − AVG */
  iso: number;
  /** Batting average on balls in play: (H − HR) / (AB − K − HR + SF); NaN when denominator === 0 */
  babip: number;
  /** Strikeout rate: K / PA */
  kPct: number;
  /** Walk rate: BB / PA */
  bbPct: number;
  /**
   * Weighted on-base average (FanGraphs 2023 linear weights):
   * (0.69×BB + 0.72×HBP + 0.89×1B + 1.27×2B + 1.62×3B + 2.10×HR) / (AB + BB + SF + HBP)
   */
  woba: number;

  // Hard Hit Ball stats
  /** Total batted balls (hits + non-strikeout outs + errors + DPs + SFs + SHs) */
  battedBalls: number;
  /**
   * Hard Hit Balls: line drives + home runs + fly balls to deep outfield (sprayY > 0.733).
   * The 0.733 threshold maps to the short-OF/deep-OF boundary on the spray chart (d=110, R=150).
   */
  hardHitBalls: number;
  /** HHB rate: hardHitBalls / battedBalls; NaN when battedBalls === 0 */
  hardHitPct: number;
}
