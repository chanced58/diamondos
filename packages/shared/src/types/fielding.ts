/**
 * Per-player fielding statistics derived from game events.
 *
 * Attribution comes from event `fieldingSequence` / `errorBy` payloads, which
 * store position numbers (1=P, 2=C, 3=1B, 4=2B, 5=3B, 6=SS, 7=LF, 8=CF, 9=RF).
 * The deriver maps position → playerId using the starting defensive alignment
 * plus in-game SUBSTITUTION and PITCHING_CHANGE events.
 */
export interface FieldingStats {
  playerId: string;
  playerName: string;
  gamesAppeared: number;
  /** Chances the player successfully recorded an out via catch or tag. */
  putouts: number;
  /** Chances the player contributed to an out by throwing to a teammate. */
  assists: number;
  /** Fielding errors charged to the player. */
  errors: number;
  /** (PO + A) / (PO + A + E); NaN when denominator === 0. */
  fieldingPct: number;
}
