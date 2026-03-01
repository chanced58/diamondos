export interface CountStat {
  /** Plate appearances ending at this count (balls-in-play + strikeouts; excludes walks and HBPs) */
  atBats: number;
  hits: number;
  /** hits / atBats; may be NaN when atBats === 0 — display as "---" */
  average: number;
}

export interface PitchingStats {
  playerId: string;
  playerName: string;
  gamesAppeared: number;

  /** Raw outs recorded while pitching. Display as Math.floor(n/3) + '.' + (n % 3) */
  inningsPitchedOuts: number;

  totalPitches: number;
  strikes: number;
  balls: number;
  /** strikes / totalPitches */
  strikePercentage: number;

  /** Pitches that were strikes on the very first pitch of an at-bat */
  firstPitchStrikes: number;
  /** firstPitchStrikes / totalPAs */
  firstPitchStrikePercentage: number;

  /** Plate appearances where the ball count reached 3 at any point */
  threeBallCountPAs: number;
  totalPAs: number;
  /** threeBallCountPAs / totalPAs */
  threeBallCountPercentage: number;

  hitsAllowed: number;
  runsAllowed: number;
  walksAllowed: number;
  strikeouts: number;
  hitBatters: number;
  wildPitches: number;

  /** (runsAllowed * 7) / inningsPitched; Infinity when inningsPitched === 0 */
  era: number;
  /** (walksAllowed + hitsAllowed) / inningsPitched */
  whip: number;
  strikeoutsPerSeven: number;
  walksPerSeven: number;

  /**
   * Batting average against at each count.
   * Keys are "balls-strikes", e.g. "0-0", "1-2", "3-2".
   * All 12 valid counts are always present.
   */
  baByCount: Record<string, CountStat>;
}
