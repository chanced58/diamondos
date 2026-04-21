'use client';

import { useMemo, useState, type JSX } from 'react';
import {
  PracticeDrill,
  SKILL_CATEGORY_LABELS,
  filterDrills,
} from '@baseball/shared';

interface Props {
  drills: PracticeDrill[];
  onPick: (drill: PracticeDrill) => void;
  onClose: () => void;
}

export function DrillPicker({ drills, onPick, onClose }: Props): JSX.Element {
  const [search, setSearch] = useState('');
  const filtered = useMemo(
    () => filterDrills(drills, { search: search || undefined }).slice(0, 100),
    [drills, search],
  );

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900 mb-2">Pick a drill</h2>
          <input
            autoFocus
            type="search"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <ul className="overflow-y-auto divide-y divide-gray-100 flex-1">
          {filtered.length === 0 && (
            <li className="p-4 text-center text-gray-400 text-sm">No drills match.</li>
          )}
          {filtered.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => onPick(d)}
                className="w-full text-left px-4 py-3 hover:bg-brand-50 focus:bg-brand-50 outline-none"
              >
                <div className="font-medium text-gray-900">{d.name}</div>
                <div className="text-xs text-gray-500 flex gap-2 mt-0.5">
                  {d.skillCategories.slice(0, 3).map((sc) => (
                    <span key={sc}>{SKILL_CATEGORY_LABELS[sc]}</span>
                  ))}
                  {d.defaultDurationMinutes !== undefined && (
                    <span>· {d.defaultDurationMinutes}m</span>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
        <div className="p-3 border-t border-gray-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
