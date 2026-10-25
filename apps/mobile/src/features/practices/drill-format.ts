import {
  PracticeDrillVisibility,
  SKILL_CATEGORY_LABELS,
  filterDrills,
  sortDrills,
  type PracticeDrill,
  type PracticeSkillCategory,
} from '@baseball/shared';

/** Which drills the library shows: all, the curated ones, or the team's own. */
export type DrillSource = 'all' | 'system' | 'team';

export interface DrillBrowseFilters {
  search: string;
  source: DrillSource;
  /** Any of these; none means every category. */
  skillCategories: PracticeSkillCategory[];
}

/** The drills matching the filters, by name — the web library's filter, shared. */
export function browseDrills(drills: PracticeDrill[], filters: DrillBrowseFilters): PracticeDrill[] {
  return sortDrills(
    filterDrills(drills, { search: filters.search, visibility: filters.source, skillCategories: filters.skillCategories }),
    'name',
  );
}

/** The drill's categories and length, e.g. "Hitting, Fielding · 15 min". */
export function drillSubtitle(drill: PracticeDrill): string {
  const categories = drill.skillCategories.map((category) => SKILL_CATEGORY_LABELS[category]).join(', ');
  return drill.defaultDurationMinutes ? `${categories} · ${drill.defaultDurationMinutes} min` : categories;
}

/** "4–12 players", "4+ players", "Up to 12 players", or null when the drill doesn't say. */
export function drillPlayers(drill: Pick<PracticeDrill, 'minPlayers' | 'maxPlayers'>): string | null {
  const { minPlayers, maxPlayers } = drill;
  if (minPlayers !== undefined && maxPlayers !== undefined) {
    return minPlayers === maxPlayers ? `${minPlayers} players` : `${minPlayers}–${maxPlayers} players`;
  }
  if (minPlayers !== undefined) return `${minPlayers}+ players`;
  if (maxPlayers !== undefined) return `Up to ${maxPlayers} players`;
  return null;
}

/** Whether the drill is one of the team's own rather than curated. */
export function isTeamDrill(drill: Pick<PracticeDrill, 'visibility'>): boolean {
  return drill.visibility === PracticeDrillVisibility.TEAM;
}
