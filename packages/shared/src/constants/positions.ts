/**
 * Canonical lineup-position mappings between UI abbreviations and the
 * `player_position` database enum. Lifted from the web lineup builder so the
 * mobile lineup screen shares the exact same semantics.
 *
 * Note: `POSITION_ABBREVIATIONS` in `baseball.ts` is a display-only map
 * (uses 'UT' for utility); these maps are the round-trip pair used when
 * reading/writing `game_lineups.starting_position`.
 */

/** Positions assignable in a lineup builder, in conventional order. */
export const LINEUP_POSITIONS = [
  'P',
  'C',
  '1B',
  '2B',
  '3B',
  'SS',
  'LF',
  'CF',
  'RF',
  'DH',
] as const;

export type LineupPositionAbbr = (typeof LINEUP_POSITIONS)[number];

/** Map UI abbreviations to the player_position database enum values. */
export const POSITION_TO_DB: Record<string, string> = {
  P: 'pitcher',
  C: 'catcher',
  '1B': 'first_base',
  '2B': 'second_base',
  '3B': 'third_base',
  SS: 'shortstop',
  LF: 'left_field',
  CF: 'center_field',
  RF: 'right_field',
  DH: 'designated_hitter',
};

/**
 * Map database enum values back to UI abbreviations. Includes the roster-only
 * enum values (infield/outfield/utility) that never appear in LINEUP_POSITIONS
 * but can arrive via a player's primary position.
 */
export const DB_TO_POSITION: Record<string, string> = {
  pitcher: 'P',
  catcher: 'C',
  first_base: '1B',
  second_base: '2B',
  third_base: '3B',
  shortstop: 'SS',
  left_field: 'LF',
  center_field: 'CF',
  right_field: 'RF',
  designated_hitter: 'DH',
  infield: 'IF',
  outfield: 'OF',
  utility: 'UTIL',
};
