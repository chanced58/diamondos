import { DrillFilters, PracticeDrill } from '../types/practice-drill';

function haystack(drill: PracticeDrill): string {
  return [
    drill.name,
    drill.description ?? '',
    drill.coachingPoints ?? '',
    drill.tags.join(' '),
    drill.source ?? '',
  ]
    .join(' ')
    .toLowerCase();
}

function arrayIntersects<T>(a: readonly T[], b: readonly T[]): boolean {
  if (!a.length || !b.length) return false;
  const set = new Set(a);
  for (const v of b) if (set.has(v)) return true;
  return false;
}

/**
 * AND across filter keys; OR (array-intersect) within a key. Duration cap
 * applies when the drill has a defaultDurationMinutes set (drills without one
 * are always included — they're considered "flexible").
 */
export function filterDrills(
  drills: PracticeDrill[],
  filters: DrillFilters,
): PracticeDrill[] {
  const search = filters.search?.trim().toLowerCase();
  return drills.filter((d) => {
    if (filters.visibility && filters.visibility !== 'all') {
      if (d.visibility !== filters.visibility) return false;
    }
    if (filters.skillCategories?.length) {
      if (!arrayIntersects(d.skillCategories, filters.skillCategories)) return false;
    }
    if (filters.positions?.length) {
      // Drills with empty positions[] are considered "any position" — include.
      if (d.positions.length > 0 && !arrayIntersects(d.positions, filters.positions)) {
        return false;
      }
    }
    if (filters.ageLevels?.length) {
      // Always match if drill advertises 'all'.
      const matchesAll = d.ageLevels.some((a) => a === 'all');
      if (!matchesAll && !arrayIntersects(d.ageLevels, filters.ageLevels)) {
        return false;
      }
    }
    if (filters.equipment?.length) {
      if (!arrayIntersects(d.equipment, filters.equipment)) return false;
    }
    if (filters.fieldSpaces?.length) {
      if (!arrayIntersects(d.fieldSpaces, filters.fieldSpaces)) return false;
    }
    if (filters.minPlayers !== undefined) {
      if (d.maxPlayers !== undefined && d.maxPlayers < filters.minPlayers) return false;
    }
    if (filters.maxPlayers !== undefined) {
      if (d.minPlayers !== undefined && d.minPlayers > filters.maxPlayers) return false;
    }
    if (filters.durationMax !== undefined) {
      if (
        d.defaultDurationMinutes !== undefined &&
        d.defaultDurationMinutes > filters.durationMax
      ) {
        return false;
      }
    }
    if (search) {
      if (!haystack(d).includes(search)) return false;
    }
    return true;
  });
}

export type DrillSort = 'name' | 'duration' | 'recent';

export function sortDrills(drills: PracticeDrill[], sort: DrillSort): PracticeDrill[] {
  const copy = [...drills];
  switch (sort) {
    case 'name':
      return copy.sort((a, b) => a.name.localeCompare(b.name));
    case 'duration':
      return copy.sort((a, b) => {
        const ad = a.defaultDurationMinutes ?? Number.POSITIVE_INFINITY;
        const bd = b.defaultDurationMinutes ?? Number.POSITIVE_INFINITY;
        return ad - bd;
      });
    case 'recent':
      return copy.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
}
