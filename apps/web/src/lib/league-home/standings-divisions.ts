/** A standings row carries the division it belongs to (null = unassigned). */
export interface DivisionAssignable {
  division_id: string | null;
}

export interface LeagueDivisionRef {
  id: string;
  name: string;
}

export interface StandingsDivisionGroup<T> {
  id: string;
  name: string;
  rows: T[];
}

/**
 * Group standings rows into per-division tables for the public league page.
 *
 * One group per division that has at least one row, ordered alphabetically by
 * division name. Rows keep their incoming order within a group (the loader sorts
 * by win% first). Rows with no division are excluded — they appear only in the
 * overall league table.
 */
export function groupStandingsByDivision<T extends DivisionAssignable>(
  rows: T[],
  divisions: LeagueDivisionRef[],
): Array<StandingsDivisionGroup<T>> {
  return [...divisions]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((d) => ({ id: d.id, name: d.name, rows: rows.filter((r) => r.division_id === d.id) }))
    .filter((g) => g.rows.length > 0);
}
