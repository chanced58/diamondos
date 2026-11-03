import type { ThemePreference } from '@baseball/shared';

/** Appearance choices in display order, shared by the Appearance screen and the More row. */
export const APPEARANCE_OPTIONS: ReadonlyArray<{ value: ThemePreference; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'dugout', label: 'Dugout' },
];

export function appearanceLabel(preference: ThemePreference): string {
  return APPEARANCE_OPTIONS.find((option) => option.value === preference)?.label ?? 'System';
}
