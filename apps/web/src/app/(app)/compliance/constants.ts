/** Event types relevant for stats derivation (batting, pitching, fielding). */
export const RELEVANT_EVENT_TYPES = [
  'pitch_thrown',
  'hit',
  'out',
  'strikeout',
  'walk',
  'hit_by_pitch',
  'score',
  'pitching_change',
  'inning_change',
  'game_start',
  'double_play',
  'sacrifice_bunt',
  'sacrifice_fly',
  'field_error',
  'stolen_base',
  'caught_stealing',
] as const;
