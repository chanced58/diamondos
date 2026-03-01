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

export const PITCH_COUNT_WARNING_THRESHOLD = 0.75;  // 75% of limit
export const PITCH_COUNT_DANGER_THRESHOLD = 0.90;   // 90% of limit
