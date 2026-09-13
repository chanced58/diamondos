import { EventType } from '../types/game-event';

/**
 * The field drawing both clients share: web's SprayChartPicker hard-codes
 * these numbers, and mobile's FieldDiagram draws from them, so a tap on
 * either lands in the same spray space.
 */
export const SPRAY_FIELD = {
  width: 240,
  height: 200,
  homeX: 120,
  homeY: 185,
  radius: 150,
} as const;

/** Where a ball in play went, and who first touched it (null: nobody, e.g. over the wall). */
export interface BattedBall {
  sprayX: number;
  sprayY: number;
  firstFielder: number | null;
}

/** OutPayload.fieldingSequence allows at most five positions. */
export const MAX_FIELDING_SEQUENCE = 5;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * A point in the 240×200 field drawing → normalized spray coordinates:
 * sprayX 0 = left, 0.5 = centre, 1 = right; sprayY 0 = home plate, 1 = the
 * deep centre-field wall. Identical to web's SprayChartPicker.handleClick.
 */
export function sprayFromFieldPoint(x: number, y: number): { sprayX: number; sprayY: number } {
  return {
    sprayX: clamp01((x - SPRAY_FIELD.homeX) / SPRAY_FIELD.radius + 0.5),
    sprayY: clamp01((SPRAY_FIELD.homeY - y) / SPRAY_FIELD.radius),
  };
}

/** The inverse of sprayFromFieldPoint, for drawing a recorded location. */
export function fieldPointFromSpray(sprayX: number, sprayY: number): { x: number; y: number } {
  return {
    x: (sprayX - 0.5) * SPRAY_FIELD.radius + SPRAY_FIELD.homeX,
    y: SPRAY_FIELD.homeY - sprayY * SPRAY_FIELD.radius,
  };
}

/**
 * Where each position stands at normal depth, in spray coordinates. Only used
 * to guess the likeliest first fielder for a tap — the scorer confirms it.
 */
export const FIELDER_SPRAY_POSITIONS: Record<number, { sprayX: number; sprayY: number }> = {
  1: { sprayX: 0.5, sprayY: 0.36 },
  2: { sprayX: 0.5, sprayY: 0.02 },
  3: { sprayX: 0.76, sprayY: 0.4 },
  4: { sprayX: 0.64, sprayY: 0.58 },
  5: { sprayX: 0.24, sprayY: 0.4 },
  6: { sprayX: 0.36, sprayY: 0.58 },
  7: { sprayX: 0.22, sprayY: 0.85 },
  8: { sprayX: 0.5, sprayY: 0.92 },
  9: { sprayX: 0.78, sprayY: 0.85 },
};

/** The position whose normal spot is closest to where the ball went. */
export function nearestFielder(sprayX: number, sprayY: number): number {
  let best = 1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let position = 1; position <= 9; position++) {
    const spot = FIELDER_SPRAY_POSITIONS[position];
    const distance = Math.hypot(spot.sprayX - sprayX, spot.sprayY - sprayY);
    if (distance < bestDistance) {
      best = position;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * The throw step's "tap the next fielder". Capped at five, and a fielder
 * cannot throw to himself, so a double tap on the same position is ignored.
 */
export function appendThrow(sequence: readonly number[], position: number): number[] {
  if (sequence.length >= MAX_FIELDING_SEQUENCE) return [...sequence];
  if (sequence[sequence.length - 1] === position) return [...sequence];
  return [...sequence, position];
}

/** The throw step's Undo. The first fielder came from the field pop-up and stays. */
export function undoThrow(sequence: readonly number[]): number[] {
  return sequence.length <= 1 ? [...sequence] : sequence.slice(0, -1);
}

/**
 * The outcomes fielding-stats credits putouts and assists from via
 * fieldingSequence — the only ones where the throws after the first fielder
 * matter. Recording just the shortstop on a 6-3 groundout would credit him a
 * putout he did not make.
 */
const THROW_STEP_EVENTS: readonly EventType[] = [
  EventType.OUT,
  EventType.SACRIFICE_FLY,
  EventType.SACRIFICE_BUNT,
  EventType.DOUBLE_PLAY,
  EventType.TRIPLE_PLAY,
];

export function requiresThrowStep(eventType: EventType): boolean {
  return THROW_STEP_EVENTS.includes(eventType);
}
