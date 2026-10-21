import {
  applyPitchRevertedTyped,
  buildGameHistoryTree,
  EventType,
  HitTrajectory,
  HitType,
  PitchOutcome,
  type GameEvent,
  type GameHistoryResponse,
  type GameHistoryTree,
} from '@baseball/shared';

/** The play-by-play tree, built exactly as the web history page builds it. */
export function historyTree(history: GameHistoryResponse): GameHistoryTree {
  const events = history.events as unknown as GameEvent[];
  return buildGameHistoryTree(applyPitchRevertedTyped(events), new Map(Object.entries(history.playerNames)));
}

/**
 * Which correction the phone offers for an event: pick a new pitch outcome,
 * pick a new plate-appearance result, change a run's RBIs, or delete only.
 * Runner moves and substitutions edit on the web (or delete here).
 */
export type CorrectionKind = 'pitch' | 'result' | 'score' | 'delete';

const RESULT_EVENT_TYPES: ReadonlySet<string> = new Set([
  EventType.HIT,
  EventType.OUT,
  EventType.WALK,
  EventType.STRIKEOUT,
  EventType.HIT_BY_PITCH,
  EventType.FIELD_ERROR,
]);

export function correctionKind(event: GameEvent): CorrectionKind {
  if (event.eventType === EventType.PITCH_THROWN) return 'pitch';
  if (event.eventType === EventType.SCORE) return 'score';
  if (RESULT_EVENT_TYPES.has(event.eventType)) return 'result';
  return 'delete';
}

/** Events the history can't correct at all: the game's own start and end. */
export function isCorrectable(event: GameEvent): boolean {
  return event.eventType !== EventType.GAME_START && event.eventType !== EventType.GAME_END;
}

export interface Replacement {
  eventType: EventType;
  payload: Record<string, unknown>;
}

/** The batter and pitcher of the original event, keeping which side each played for. */
function batterAndPitcher(original: GameEvent): Record<string, unknown> {
  const payload = original.payload as Record<string, unknown>;
  const ids: Record<string, unknown> = {};
  for (const key of ['batterId', 'opponentBatterId', 'pitcherId', 'opponentPitcherId'] as const) {
    if (typeof payload[key] === 'string' && payload[key]) ids[key] = payload[key];
  }
  return ids;
}

export const PITCH_CHOICES = [
  { label: 'Ball', outcome: PitchOutcome.BALL },
  { label: 'Called strike', outcome: PitchOutcome.CALLED_STRIKE },
  { label: 'Swinging strike', outcome: PitchOutcome.SWINGING_STRIKE },
  { label: 'Foul', outcome: PitchOutcome.FOUL },
  { label: 'Foul tip', outcome: PitchOutcome.FOUL_TIP },
  { label: 'Hit by pitch', outcome: PitchOutcome.HIT_BY_PITCH },
] as const;

export function pitchReplacement(original: GameEvent, outcome: PitchOutcome): Replacement {
  return { eventType: EventType.PITCH_THROWN, payload: { ...batterAndPitcher(original), outcome } };
}

export type ResultChoice =
  | 'single' | 'double' | 'triple' | 'home_run'
  | 'walk' | 'strikeout' | 'hit_by_pitch'
  | 'groundout' | 'flyout' | 'lineout' | 'popout'
  | 'error';

export const RESULT_CHOICES: { value: ResultChoice; label: string }[] = [
  { value: 'single', label: 'Single' },
  { value: 'double', label: 'Double' },
  { value: 'triple', label: 'Triple' },
  { value: 'home_run', label: 'Home run' },
  { value: 'walk', label: 'Walk' },
  { value: 'strikeout', label: 'Strikeout' },
  { value: 'hit_by_pitch', label: 'Hit by pitch' },
  { value: 'groundout', label: 'Groundout' },
  { value: 'flyout', label: 'Flyout' },
  { value: 'lineout', label: 'Lineout' },
  { value: 'popout', label: 'Popout' },
  { value: 'error', label: 'Reached on error' },
];

const HIT_TYPES: Partial<Record<ResultChoice, HitType>> = {
  single: HitType.SINGLE,
  double: HitType.DOUBLE,
  triple: HitType.TRIPLE,
  home_run: HitType.HOME_RUN,
};

const OUT_TRAJECTORY: Partial<Record<ResultChoice, HitTrajectory>> = {
  groundout: HitTrajectory.GROUND_BALL,
  flyout: HitTrajectory.FLY_BALL,
  lineout: HitTrajectory.LINE_DRIVE,
};

/** Fielders by position number, for charging an error. */
export const FIELDERS = [
  { number: 1, label: 'P' }, { number: 2, label: 'C' }, { number: 3, label: '1B' },
  { number: 4, label: '2B' }, { number: 5, label: '3B' }, { number: 6, label: 'SS' },
  { number: 7, label: 'LF' }, { number: 8, label: 'CF' }, { number: 9, label: 'RF' },
] as const;

/**
 * A plate-appearance result as the web's replace panel writes it: the
 * original batter and pitcher plus the result's own fields. `errorBy` is the
 * fielder charged when the result is an error.
 */
export function resultReplacement(original: GameEvent, choice: ResultChoice, errorBy?: number): Replacement {
  const ids = batterAndPitcher(original);
  const hitType = HIT_TYPES[choice];
  if (hitType) return { eventType: EventType.HIT, payload: { ...ids, hitType } };

  switch (choice) {
    case 'walk':
      return { eventType: EventType.WALK, payload: ids };
    case 'strikeout':
      return { eventType: EventType.STRIKEOUT, payload: ids };
    case 'hit_by_pitch':
      return { eventType: EventType.HIT_BY_PITCH, payload: ids };
    case 'error':
      return { eventType: EventType.FIELD_ERROR, payload: { ...ids, ...(errorBy ? { errorBy } : {}) } };
    default: {
      const trajectory = OUT_TRAJECTORY[choice];
      return {
        eventType: EventType.OUT,
        payload: { ...ids, outType: choice, ...(trajectory ? { trajectory } : {}) },
      };
    }
  }
}

/** A run with a new RBI count (OBR 9.04(b) override); everything else on the run stays. */
export function scoreReplacement(original: GameEvent, rbis: number): Replacement {
  const payload = { ...(original.payload as Record<string, unknown>) };
  delete payload.insertAfterSequence;
  return { eventType: EventType.SCORE, payload: { ...payload, rbis } };
}
