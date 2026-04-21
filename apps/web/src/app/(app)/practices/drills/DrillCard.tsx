import type { JSX } from 'react';
import {
  PracticeDrill,
  PracticeDrillVisibility,
  SKILL_CATEGORY_LABELS,
  FIELD_SPACE_LABELS,
} from '@baseball/shared';

interface Props {
  drill: PracticeDrill;
}

export function DrillCard({ drill }: Props): JSX.Element {
  const isSystem = drill.visibility === PracticeDrillVisibility.SYSTEM;
  return (
    <div className="bg-white rounded-xl border border-gray-200 hover:border-brand-400 hover:shadow-sm transition-all p-4 h-full flex flex-col">
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-semibold text-gray-900 leading-tight">{drill.name}</h3>
        {isSystem ? (
          <span className="text-[10px] uppercase tracking-wide font-semibold text-brand-700 bg-brand-50 px-2 py-0.5 rounded-full whitespace-nowrap">
            Curated
          </span>
        ) : (
          <span className="text-[10px] uppercase tracking-wide font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full whitespace-nowrap">
            Team
          </span>
        )}
      </div>

      {drill.description && (
        <p className="text-sm text-gray-600 mb-3 line-clamp-3">{drill.description}</p>
      )}

      <div className="flex flex-wrap gap-1 mb-3">
        {drill.skillCategories.map((sc) => (
          <span
            key={sc}
            className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700"
          >
            {SKILL_CATEGORY_LABELS[sc] ?? sc}
          </span>
        ))}
      </div>

      <div className="mt-auto text-xs text-gray-500 flex flex-wrap gap-x-3 gap-y-1">
        {drill.defaultDurationMinutes !== undefined && (
          <span>⏱ {drill.defaultDurationMinutes} min</span>
        )}
        {drill.minPlayers !== undefined && (
          <span>
            👥 {drill.minPlayers}
            {drill.maxPlayers !== undefined && drill.maxPlayers !== drill.minPlayers
              ? `–${drill.maxPlayers}`
              : ''}
          </span>
        )}
        {drill.fieldSpaces.length > 0 && (
          <span className="truncate" title={drill.fieldSpaces.join(', ')}>
            🏟 {drill.fieldSpaces.map((fs) => FIELD_SPACE_LABELS[fs] ?? fs).join(', ')}
          </span>
        )}
      </div>
    </div>
  );
}
