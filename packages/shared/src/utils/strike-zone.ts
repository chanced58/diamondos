/**
 * 5x5 pitch-location grid, pitcher's view. Inner 3x3 = zones 1-9 (the
 * strike zone); outer ring = zones 10-25 (ball/miss locations around it).
 * Row-major, matches web ScoringBoard.tsx's StrikeZoneGrid layout.
 */
export const ZONE_MAP: readonly (readonly number[])[] = [
  [10, 11, 12, 13, 14],
  [15, 1, 2, 3, 16],
  [17, 4, 5, 6, 18],
  [19, 7, 8, 9, 20],
  [21, 22, 23, 24, 25],
];

export const INNER_ZONES: ReadonlySet<number> = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]);

export function isInnerZone(zone: number): boolean {
  return INNER_ZONES.has(zone);
}

/** Flattened row-major zone list — e.g. for mapping over 25 grid cells. */
export function flatZones(): number[] {
  return ZONE_MAP.flat();
}

/** Row/col (each 0-4) for a given zone number, or null if not 1-25. */
export function rowColForZone(zone: number): { row: number; col: number } | null {
  for (let row = 0; row < ZONE_MAP.length; row++) {
    const col = ZONE_MAP[row].indexOf(zone);
    if (col !== -1) return { row, col };
  }
  return null;
}
