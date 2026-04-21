'use client';

import type { JSX } from 'react';
import {
  AGE_LEVEL_LABELS,
  DrillFilters,
  EQUIPMENT_LABELS,
  FIELD_SPACE_LABELS,
  PracticeAgeLevel,
  PracticeEquipment,
  PracticeFieldSpace,
  PracticeSkillCategory,
  SKILL_CATEGORY_LABELS,
} from '@baseball/shared';

interface Props {
  filters: DrillFilters;
  onChange: (next: DrillFilters) => void;
}

function toggle<T>(arr: readonly T[] | undefined, value: T): T[] {
  const list = arr ? [...arr] : [];
  const idx = list.indexOf(value);
  if (idx >= 0) list.splice(idx, 1);
  else list.push(value);
  return list;
}

function Checkbox<T extends string>({
  label,
  value,
  checked,
  onToggle,
}: {
  label: string;
  value: T;
  checked: boolean;
  onToggle: (v: T) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-gray-700 py-1 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={() => onToggle(value)}
        className="rounded border-gray-300 text-brand-700 focus:ring-brand-500"
      />
      {label}
    </label>
  );
}

export function DrillFiltersPanel({ filters, onChange }: Props): JSX.Element {
  const hasAnyFilter =
    (filters.skillCategories?.length ?? 0) > 0 ||
    (filters.ageLevels?.length ?? 0) > 0 ||
    (filters.equipment?.length ?? 0) > 0 ||
    (filters.fieldSpaces?.length ?? 0) > 0 ||
    // 'all' is the default source — don't count it as an active filter so
    // the Clear button stays hidden on a fresh page.
    (filters.visibility !== undefined && filters.visibility !== 'all') ||
    filters.durationMax !== undefined ||
    !!filters.search;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 text-sm">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-semibold text-gray-900">Filters</h2>
        {hasAnyFilter && (
          <button
            type="button"
            onClick={() => onChange({})}
            className="text-xs text-brand-700 hover:underline"
          >
            Clear
          </button>
        )}
      </div>

      <section className="border-t border-gray-100 pt-3 mt-3">
        <h3 className="text-xs uppercase tracking-wide font-semibold text-gray-500 mb-1">
          Skill
        </h3>
        {Object.values(PracticeSkillCategory).map((sc) => (
          <Checkbox
            key={sc}
            label={SKILL_CATEGORY_LABELS[sc]}
            value={sc}
            checked={filters.skillCategories?.includes(sc) ?? false}
            onToggle={(v) =>
              onChange({ ...filters, skillCategories: toggle(filters.skillCategories, v) })
            }
          />
        ))}
      </section>

      <section className="border-t border-gray-100 pt-3 mt-3">
        <h3 className="text-xs uppercase tracking-wide font-semibold text-gray-500 mb-1">
          Age level
        </h3>
        {Object.values(PracticeAgeLevel)
          .filter((a) => a !== PracticeAgeLevel.ALL)
          .map((a) => (
            <Checkbox
              key={a}
              label={AGE_LEVEL_LABELS[a]}
              value={a}
              checked={filters.ageLevels?.includes(a) ?? false}
              onToggle={(v) =>
                onChange({ ...filters, ageLevels: toggle(filters.ageLevels, v) })
              }
            />
          ))}
      </section>

      <section className="border-t border-gray-100 pt-3 mt-3">
        <h3 className="text-xs uppercase tracking-wide font-semibold text-gray-500 mb-1">
          Equipment
        </h3>
        {Object.values(PracticeEquipment).map((eq) => (
          <Checkbox
            key={eq}
            label={EQUIPMENT_LABELS[eq]}
            value={eq}
            checked={filters.equipment?.includes(eq) ?? false}
            onToggle={(v) =>
              onChange({ ...filters, equipment: toggle(filters.equipment, v) })
            }
          />
        ))}
      </section>

      <section className="border-t border-gray-100 pt-3 mt-3">
        <h3 className="text-xs uppercase tracking-wide font-semibold text-gray-500 mb-1">
          Field space
        </h3>
        {Object.values(PracticeFieldSpace).map((fs) => (
          <Checkbox
            key={fs}
            label={FIELD_SPACE_LABELS[fs]}
            value={fs}
            checked={filters.fieldSpaces?.includes(fs) ?? false}
            onToggle={(v) =>
              onChange({ ...filters, fieldSpaces: toggle(filters.fieldSpaces, v) })
            }
          />
        ))}
      </section>

      <section className="border-t border-gray-100 pt-3 mt-3">
        <h3 className="text-xs uppercase tracking-wide font-semibold text-gray-500 mb-1">
          Source
        </h3>
        <label className="flex items-center gap-2 py-1 cursor-pointer">
          <input
            type="radio"
            name="visibility"
            checked={!filters.visibility || filters.visibility === 'all'}
            onChange={() => onChange({ ...filters, visibility: 'all' })}
          />
          All
        </label>
        <label className="flex items-center gap-2 py-1 cursor-pointer">
          <input
            type="radio"
            name="visibility"
            checked={filters.visibility === 'system'}
            onChange={() => onChange({ ...filters, visibility: 'system' })}
          />
          Curated
        </label>
        <label className="flex items-center gap-2 py-1 cursor-pointer">
          <input
            type="radio"
            name="visibility"
            checked={filters.visibility === 'team'}
            onChange={() => onChange({ ...filters, visibility: 'team' })}
          />
          Team-added
        </label>
      </section>
    </div>
  );
}
