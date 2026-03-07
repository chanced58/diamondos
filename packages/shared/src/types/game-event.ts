export enum EventType {
  // Game flow
  GAME_START = 'game_start',
  GAME_END = 'game_end',
  INNING_CHANGE = 'inning_change',

  // Pitching
  PITCH_THROWN = 'pitch_thrown',
  PICKOFF_ATTEMPT = 'pickoff_attempt',

  // Batting outcomes
  HIT = 'hit',
  OUT = 'out',
  WALK = 'walk',
  HIT_BY_PITCH = 'hit_by_pitch',
  STRIKEOUT = 'strikeout',
  SACRIFICE_BUNT = 'sacrifice_bunt',
  SACRIFICE_FLY = 'sacrifice_fly',
  FIELD_ERROR = 'field_error',
  DOUBLE_PLAY = 'double_play',

  // Baserunning
  STOLEN_BASE = 'stolen_base',
  CAUGHT_STEALING = 'caught_stealing',
  BASERUNNER_ADVANCE = 'baserunner_advance',
  BASERUNNER_OUT = 'baserunner_out',
  SCORE = 'score',

  // Lineup changes
  SUBSTITUTION = 'substitution',
  PITCHING_CHANGE = 'pitching_change',
}

export enum PitchType {
  FASTBALL = 'fastball',
  CURVEBALL = 'curveball',
  SLIDER = 'slider',
  CHANGEUP = 'changeup',
  SINKER = 'sinker',
  CUTTER = 'cutter',
  SPLITTER = 'splitter',
  KNUCKLEBALL = 'knuckleball',
  OTHER = 'other',
}

export enum PitchOutcome {
  CALLED_STRIKE = 'called_strike',
  SWINGING_STRIKE = 'swinging_strike',
  BALL = 'ball',
  FOUL = 'foul',
  FOUL_TIP = 'foul_tip',
  IN_PLAY = 'in_play',
  HIT_BY_PITCH = 'hit_by_pitch',
  INTENTIONAL_BALL = 'intentional_ball',
}

export enum HitType {
  SINGLE = 'single',
  DOUBLE = 'double',
  TRIPLE = 'triple',
  HOME_RUN = 'home_run',
  GROUND_BALL = 'ground_ball',
  FLY_BALL = 'fly_ball',
  LINE_DRIVE = 'line_drive',
  POP_UP = 'pop_up',
}

/** Batted-ball trajectory — independent of hit/out outcome */
export enum HitTrajectory {
  GROUND_BALL = 'ground_ball',
  LINE_DRIVE  = 'line_drive',
  FLY_BALL    = 'fly_ball',
}

// Discriminated union payloads by event type
export interface PitchThrownPayload {
  pitcherId: string;
  batterId: string;
  pitchType?: PitchType;
  outcome: PitchOutcome;
  velocity?: number;
  // Strike zone location (1-9 grid, 0 = ball)
  zoneLocation?: number;
  isWildPitch?: boolean;
  isPassedBall?: boolean;
}

export interface HitPayload {
  batterId: string;
  pitcherId: string;
  hitType: HitType;
  trajectory?: HitTrajectory;
  // Spray chart coordinates: 0-1 normalized, 0,0 = home plate
  sprayX?: number;
  sprayY?: number;
  rbis?: number;
}

export interface OutPayload {
  batterId: string;
  pitcherId: string;
  outType: 'groundout' | 'flyout' | 'lineout' | 'popout' | 'strikeout' | 'other';
  trajectory?: HitTrajectory;
  fieldedBy?: string; // position abbreviation
  /** Defensive play sequence as position numbers, e.g. [6, 3] for SS-to-1B. Max 5 steps. */
  fieldingSequence?: number[];
}

export interface SubstitutionPayload {
  inPlayerId: string;
  outPlayerId: string;
  newPosition?: string;
  battingOrderPosition?: number;
}

export interface PitchingChangePayload {
  newPitcherId: string;
  outgoingPitcherId: string;
}

export interface ScorePayload {
  scoringPlayerId: string;
  rbis: number;
}

/** Payload for STOLEN_BASE, BASERUNNER_ADVANCE, and CAUGHT_STEALING events */
export interface BaserunnerMovePayload {
  runnerId: string;
  fromBase: 1 | 2 | 3;
  toBase: 2 | 3 | 4;  // 4 = home plate / scored
}

export type GameEventPayload =
  | PitchThrownPayload
  | HitPayload
  | OutPayload
  | SubstitutionPayload
  | PitchingChangePayload
  | ScorePayload
  | Record<string, unknown>;

export interface GameEvent {
  id: string;
  gameId: string;
  sequenceNumber: number;
  eventType: EventType;
  inning: number;
  isTopOfInning: boolean;
  payload: GameEventPayload;
  occurredAt: string;
  createdBy: string;
  deviceId: string;
  syncedAt?: string;
}
