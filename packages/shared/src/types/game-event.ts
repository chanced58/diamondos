export enum EventType {
  // Game flow
  GAME_START = 'game_start',
  GAME_END = 'game_end',
  INNING_CHANGE = 'inning_change',

  // Pitching
  PITCH_THROWN = 'pitch_thrown',
  PICKOFF_ATTEMPT = 'pickoff_attempt',
  BALK = 'balk',

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
  TRIPLE_PLAY = 'triple_play',

  // Baserunning
  STOLEN_BASE = 'stolen_base',
  CAUGHT_STEALING = 'caught_stealing',
  BASERUNNER_ADVANCE = 'baserunner_advance',
  BASERUNNER_OUT = 'baserunner_out',
  RUNDOWN = 'rundown',
  SCORE = 'score',

  // Lineup changes
  SUBSTITUTION = 'substitution',
  PITCHING_CHANGE = 'pitching_change',

  // Corrections
  PITCH_REVERTED = 'pitch_reverted',
}

/** Why a baserunner advanced beyond their initial base */
export enum AdvanceReason {
  OVERTHROW  = 'overthrow',
  ERROR      = 'error',
  WILD_PITCH = 'wild_pitch',
  PASSED_BALL = 'passed_ball',
  BALK       = 'balk',
  VOLUNTARY  = 'voluntary',
  ON_PLAY    = 'on_play',
}

/** The type of in-game substitution */
export enum SubstitutionType {
  PINCH_HITTER    = 'pinch_hitter',
  PINCH_RUNNER    = 'pinch_runner',
  DEFENSIVE       = 'defensive',
  POSITION_CHANGE = 'position_change',
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
//
// Player ID conventions:
//   pitcherId / batterId         — references players.id  (the platform team's players)
//   opponentPitcherId / opponentBatterId — references opponent_players.id
//
// Exactly one of (pitcherId, opponentPitcherId) and one of (batterId, opponentBatterId)
// should be set per event based on which half-inning is active.
// Both platform and opponent fields are optional so the type enforces no implicit assumptions.

export interface PitchThrownPayload {
  pitcherId?: string;
  batterId?: string;
  /** Set when an opponent_player is pitching instead of a platform player. */
  opponentPitcherId?: string;
  /** Set when an opponent_player is batting instead of a platform player. */
  opponentBatterId?: string;
  pitchType?: PitchType;
  outcome: PitchOutcome;
  velocity?: number;
  // Strike zone location (1-9 grid, 0 = ball)
  zoneLocation?: number;
  isWildPitch?: boolean;
  isPassedBall?: boolean;
}

export interface HitPayload {
  batterId?: string;
  pitcherId?: string;
  /** Set when an opponent_player is batting. */
  opponentBatterId?: string;
  /** Set when an opponent_player is pitching. */
  opponentPitcherId?: string;
  hitType: HitType;
  trajectory?: HitTrajectory;
  // Spray chart coordinates: 0-1 normalized, 0,0 = home plate
  sprayX?: number;
  sprayY?: number;
  rbis?: number;
}

export interface OutPayload {
  batterId?: string;
  pitcherId?: string;
  /** Set when an opponent_player is batting. */
  opponentBatterId?: string;
  /** Set when an opponent_player is pitching. */
  opponentPitcherId?: string;
  outType: 'groundout' | 'flyout' | 'lineout' | 'popout' | 'strikeout' | 'other';
  trajectory?: HitTrajectory;
  fieldedBy?: string; // position abbreviation
  /** Defensive play sequence as position numbers, e.g. [6, 3] for SS-to-1B. Max 5 steps. */
  fieldingSequence?: number[];
}

export interface SubstitutionPayload {
  inPlayerId: string;
  outPlayerId: string;
  /** Set when the substitution involves opponent_players. */
  isOpponentSubstitution?: boolean;
  substitutionType?: SubstitutionType;
  newPosition?: string;
  battingOrderPosition?: number;
  /** For pinch runners: which base the incoming runner is placed on (1 | 2 | 3). */
  runnerBase?: 1 | 2 | 3;
}

export interface PitchingChangePayload {
  newPitcherId: string;
  outgoingPitcherId: string;
  /** Set when the pitching change involves opponent_players. */
  isOpponentChange?: boolean;
}

export interface ScorePayload {
  scoringPlayerId: string;
  /** Set when the scoring player is an opponent_player. */
  isOpponentScore?: boolean;
  rbis: number;
}

/** Payload for STOLEN_BASE, BASERUNNER_ADVANCE, and CAUGHT_STEALING events */
export interface BaserunnerMovePayload {
  runnerId: string;
  /** Set when the runner is an opponent_player. */
  isOpponentRunner?: boolean;
  fromBase: 1 | 2 | 3;
  toBase: 2 | 3 | 4;  // 4 = home plate / scored
  /** Why the runner advanced (for BASERUNNER_ADVANCE events). */
  reason?: AdvanceReason;
  /** Fielder position number responsible for the error (1-9), when reason is error or overthrow. */
  errorBy?: number;
  /** ID of the associated pitch/hit/play event (used when reason is on_play). */
  relatedEventId?: string;
  /** Defensive play sequence as position numbers, e.g. [2, 6] for C-to-SS on a caught stealing. */
  fieldingSequence?: number[];
}

/** Payload for PICKOFF_ATTEMPT events */
export type PickoffPayload = {
  runnerId: string;
  /** Set when the runner is an opponent_player. */
  isOpponentRunner?: boolean;
  base: 1 | 2 | 3;
  pitcherId: string;
  /** Defensive play sequence as position numbers, e.g. [1, 3] for P-to-1B. */
  fieldingSequence?: number[];
} & (
  | { outcome: 'safe' }
  | { outcome: 'out' }
);

/** Payload for RUNDOWN events — discriminated union enforces safeAtBase when outcome is 'safe' */
export type RundownPayload = {
  runnerId: string;
  /** Set when the runner is an opponent_player. */
  isOpponentRunner?: boolean;
  startBase: 1 | 2 | 3;
  /** Ordered list of fielder position numbers involved in the rundown throws (max 10). */
  throwSequence: number[];
} & (
  | { outcome: 'out'; safeAtBase?: never }
  | { outcome: 'safe'; safeAtBase: 1 | 2 | 3 }
);

export type GameEventPayload =
  | PitchThrownPayload
  | HitPayload
  | OutPayload
  | SubstitutionPayload
  | PitchingChangePayload
  | ScorePayload
  | BaserunnerMovePayload
  | PickoffPayload
  | RundownPayload
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
