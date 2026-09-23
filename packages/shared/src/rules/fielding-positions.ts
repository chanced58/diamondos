import { PlayerPosition } from '../types/player';

export interface FieldingPositionConflict {
  position: PlayerPosition;
  battingOrders: number[];
}

export interface FieldingPositionValidity {
  valid: boolean;
  conflicts: FieldingPositionConflict[];
}

/**
 * Positions that name one spot on the field, so only one player in the
 * batting order can hold each at a time. Fielding putouts and assists are
 * credited by looking up which player owns a position at the moment of the
 * play — if two batters share a position that lookup is ambiguous and the
 * credit cannot be attributed to either.
 */
const EXCLUSIVE_POSITIONS = new Set<PlayerPosition>([
  PlayerPosition.PITCHER,
  PlayerPosition.CATCHER,
  PlayerPosition.FIRST_BASE,
  PlayerPosition.SECOND_BASE,
  PlayerPosition.THIRD_BASE,
  PlayerPosition.SHORTSTOP,
  PlayerPosition.LEFT_FIELD,
  PlayerPosition.CENTER_FIELD,
  PlayerPosition.RIGHT_FIELD,
  PlayerPosition.DESIGNATED_HITTER,
]);

/**
 * A lineup may assign the same fielding position to at most one batter.
 * `INFIELD` / `OUTFIELD` / `UTILITY` are generic roster designations rather
 * than a unique spot on the field, so they are exempt and may repeat. A
 * `null` position is always allowed — extra-hitter and expanded-lineup slots
 * bat without fielding a position at all.
 *
 * Only entries with a non-null `battingOrder` participate. Bench pitchers
 * are deliberately inserted with `battingOrder: null` and
 * `position: PITCHER` so pitch counts keep tracking them even while a DH
 * bats in their lineup slot — that row shares a position with the starting
 * pitcher on purpose and must never be reported as a conflict.
 */
export function validateFieldingPositions(
  entries: { battingOrder: number | null; position: PlayerPosition | null }[],
): FieldingPositionValidity {
  const battingOrdersByPosition = new Map<PlayerPosition, number[]>();

  for (const entry of entries) {
    if (entry.battingOrder === null) continue;
    if (entry.position === null) continue;
    if (!EXCLUSIVE_POSITIONS.has(entry.position)) continue;

    const existing = battingOrdersByPosition.get(entry.position);
    if (existing) {
      existing.push(entry.battingOrder);
    } else {
      battingOrdersByPosition.set(entry.position, [entry.battingOrder]);
    }
  }

  const conflicts: FieldingPositionConflict[] = [];
  for (const [position, battingOrders] of battingOrdersByPosition) {
    if (battingOrders.length < 2) continue;
    conflicts.push({ position, battingOrders: [...battingOrders].sort((a, b) => a - b) });
  }

  return { valid: conflicts.length === 0, conflicts };
}
