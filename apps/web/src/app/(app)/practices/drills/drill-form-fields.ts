import type { CreateDrillInput } from '@baseball/shared';

/**
 * The drill form's fields as `createDrillSchema` input, for the New and Edit
 * drill actions. Blank text and numbers are left out; tags are comma-separated.
 * The service validates the result.
 */
export function drillFormFields(formData: FormData): Partial<Record<keyof CreateDrillInput, unknown>> {
  return {
    name: stringOrUndef(formData.get('name')) ?? '',
    description: stringOrUndef(formData.get('description')),
    defaultDurationMinutes: numberOrUndef(formData.get('defaultDurationMinutes')),
    skillCategories: getAll(formData, 'skillCategories'),
    positions: getAll(formData, 'positions'),
    ageLevels: getAll(formData, 'ageLevels'),
    equipment: getAll(formData, 'equipment'),
    fieldSpaces: getAll(formData, 'fieldSpaces'),
    minPlayers: numberOrUndef(formData.get('minPlayers')),
    maxPlayers: numberOrUndef(formData.get('maxPlayers')),
    coachingPoints: stringOrUndef(formData.get('coachingPoints')),
    tags: (stringOrUndef(formData.get('tags')) ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    diagramUrl: stringOrUndef(formData.get('diagramUrl')),
    videoUrl: stringOrUndef(formData.get('videoUrl')),
  };
}

function getAll(formData: FormData, key: string): string[] {
  return formData.getAll(key).filter((v): v is string => typeof v === 'string');
}

function stringOrUndef(v: FormDataEntryValue | null): string | undefined {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined;
}

function numberOrUndef(v: FormDataEntryValue | null): number | undefined {
  if (typeof v !== 'string' || v.trim().length === 0) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
