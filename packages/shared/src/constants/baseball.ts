export const MAX_ROSTER_SIZE = 25;
export const MAX_INNINGS = 9;
export const OUTS_PER_INNING = 3;
export const BALLS_FOR_WALK = 4;
export const STRIKES_FOR_STRIKEOUT = 3;

export const POSITION_ABBREVIATIONS: Record<string, string> = {
  pitcher: 'P',
  catcher: 'C',
  first_base: '1B',
  second_base: '2B',
  third_base: '3B',
  shortstop: 'SS',
  infield: 'IF',
  left_field: 'LF',
  center_field: 'CF',
  right_field: 'RF',
  outfield: 'OF',
  designated_hitter: 'DH',
  utility: 'UT',
};

/**
 * Standard baseball fielding position numbers.
 * Used for recording defensive play sequences (e.g., 6-4-3 double play).
 */
export const FIELDING_POSITION_NUMBERS: { number: number; label: string; abbr: string }[] = [
  { number: 1, label: 'Pitcher',       abbr: 'P' },
  { number: 2, label: 'Catcher',       abbr: 'C' },
  { number: 3, label: 'First Base',    abbr: '1B' },
  { number: 4, label: 'Second Base',   abbr: '2B' },
  { number: 5, label: 'Third Base',    abbr: '3B' },
  { number: 6, label: 'Shortstop',     abbr: 'SS' },
  { number: 7, label: 'Left Field',    abbr: 'LF' },
  { number: 8, label: 'Center Field',  abbr: 'CF' },
  { number: 9, label: 'Right Field',   abbr: 'RF' },
];

/**
 * Converts a fielding sequence array (e.g., [6, 4, 3]) to display string "6-4-3".
 */
export function formatFieldingSequence(seq: number[]): string {
  return seq.join('-');
}

export const PITCH_COUNT_WARNING_THRESHOLD = 0.75;  // 75% of limit
export const PITCH_COUNT_DANGER_THRESHOLD = 0.90;   // 90% of limit
