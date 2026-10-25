import {
  createDrillSchema,
  type CreateTeamDrillInput,
  type PracticeDrill,
  type PracticeEquipment,
  type PracticeFieldSpace,
  type PracticeSkillCategory,
} from '@baseball/shared';

/**
 * The drill form (new and edit) and its translation to the shared drill
 * fields. An edit replaces every field, so what the phone form doesn't show
 * (positions, age levels, media links) is carried over from the drill as it was.
 */

type DrillFields = CreateTeamDrillInput['drill'];

export interface DrillFormValues {
  name: string;
  description: string;
  /** Minutes, as typed. */
  duration: string;
  skillCategories: PracticeSkillCategory[];
  fieldSpaces: PracticeFieldSpace[];
  equipment: PracticeEquipment[];
  /** As typed. */
  minPlayers: string;
  maxPlayers: string;
  coachingPoints: string;
  /** Comma-separated, as on the web. */
  tags: string;
}

/** A new drill: everything blank. */
export function emptyDrillFormValues(): DrillFormValues {
  return {
    name: '',
    description: '',
    duration: '',
    skillCategories: [],
    fieldSpaces: [],
    equipment: [],
    minPlayers: '',
    maxPlayers: '',
    coachingPoints: '',
    tags: '',
  };
}

/** The form filled from a saved drill, for editing. */
export function drillFormValuesFrom(drill: PracticeDrill): DrillFormValues {
  return {
    name: drill.name,
    description: drill.description ?? '',
    duration: drill.defaultDurationMinutes?.toString() ?? '',
    skillCategories: [...drill.skillCategories],
    fieldSpaces: [...drill.fieldSpaces],
    equipment: [...drill.equipment],
    minPlayers: drill.minPlayers?.toString() ?? '',
    maxPlayers: drill.maxPlayers?.toString() ?? '',
    coachingPoints: drill.coachingPoints ?? '',
    tags: drill.tags.join(', '),
  };
}

/** The drill fields for the form's values; on an edit, `existing` supplies the fields the form doesn't show. */
export function drillFields(values: DrillFormValues, existing?: PracticeDrill): DrillFields {
  return {
    name: values.name.trim(),
    description: textOrUndefined(values.description),
    defaultDurationMinutes: numberOrUndefined(values.duration),
    skillCategories: values.skillCategories,
    fieldSpaces: values.fieldSpaces,
    equipment: values.equipment,
    minPlayers: numberOrUndefined(values.minPlayers),
    maxPlayers: numberOrUndefined(values.maxPlayers),
    coachingPoints: textOrUndefined(values.coachingPoints),
    tags: values.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
    positions: existing?.positions,
    ageLevels: existing?.ageLevels,
    diagramUrl: webLinkOrUndefined(existing?.diagramUrl),
    videoUrl: webLinkOrUndefined(existing?.videoUrl),
  };
}

/**
 * A saved media link worth carrying over: older drills may hold a non-web link
 * the server now refuses, and the phone can't show or fix it, so it is cleared.
 */
function webLinkOrUndefined(url: string | undefined): string | undefined {
  return url && /^https?:\/\//i.test(url) ? url : undefined;
}

/** The first problem the server would report, or null. */
export function validateDrillForm(values: DrillFormValues): string | null {
  for (const [field, label] of [
    ['duration', 'Duration'],
    ['minPlayers', 'Min players'],
    ['maxPlayers', 'Max players'],
  ] as const) {
    const typed = values[field].trim();
    if (typed && !/^\d+$/.test(typed)) return `${label} must be a whole number.`;
  }
  const parsed = createDrillSchema.safeParse(drillFields(values));
  if (parsed.success) return null;
  const issue = parsed.error.issues[0];
  switch (issue?.path[0]) {
    case 'name':
      return values.name.trim() ? 'Name must be 120 characters or fewer.' : 'Name is required.';
    case 'defaultDurationMinutes':
      return 'Duration must be between 1 and 240 minutes.';
    case 'minPlayers':
    case 'maxPlayers':
      return issue.message === 'maxPlayers must be >= minPlayers'
        ? 'Max players must be at least min players.'
        : 'Players must be between 1 and 50.';
    case 'tags':
      return 'Use up to 20 tags of at most 30 characters each.';
    default:
      return issue?.message ?? 'Check the drill details.';
  }
}

/** Toggles one value in a multi-select list. */
export function toggled<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

/** The list with the item at `index` moved one place up (-1) or down (+1); unchanged at either end. */
export function moved<T>(list: readonly T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) return [...list];
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** The trimmed text, or undefined when blank. */
function textOrUndefined(typed: string): string | undefined {
  return typed.trim() || undefined;
}

/** The typed whole number, or undefined when blank (validation has checked the digits). */
function numberOrUndefined(typed: string): number | undefined {
  const trimmed = typed.trim();
  return trimmed ? Number(trimmed) : undefined;
}
