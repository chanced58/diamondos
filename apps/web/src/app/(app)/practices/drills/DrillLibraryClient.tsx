'use client';

import { useMemo, useState, type JSX } from 'react';
import Link from 'next/link';
import {
  DrillFilters,
  PracticeDrill,
  filterDrills,
  sortDrills,
  type DrillSort,
} from '@baseball/shared';
import { DrillCard } from './DrillCard';
import { DrillFiltersPanel } from './DrillFilters';

interface Props {
  drills: PracticeDrill[];
  canEdit: boolean;
  teamId: string;
}

export function DrillLibraryClient({ drills, canEdit, teamId: _teamId }: Props): JSX.Element {
  const [filters, setFilters] = useState<DrillFilters>({});
  const [sort, setSort] = useState<DrillSort>('name');

  const visible = useMemo(() => {
    const filtered = filterDrills(drills, filters);
    return sortDrills(filtered, sort);
  }, [drills, filters, sort]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px,1fr] gap-6">
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <DrillFiltersPanel filters={filters} onChange={setFilters} />
      </aside>

      <div>
        <div className="flex items-center justify-between mb-4">
          <input
            type="search"
            placeholder="Search drills..."
            value={filters.search ?? ''}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            className="w-full max-w-sm bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          <label className="text-sm text-gray-500 flex items-center gap-2 ml-4 whitespace-nowrap">
            Sort
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as DrillSort)}
              className="bg-white border border-gray-300 rounded-lg px-2 py-1 text-sm"
            >
              <option value="name">Name</option>
              <option value="duration">Duration</option>
              <option value="recent">Recently updated</option>
            </select>
          </label>
        </div>

        {visible.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-gray-300 px-6 py-16 text-center text-gray-400">
            <p className="text-lg mb-1">No drills match those filters.</p>
            <p className="text-sm">Clear filters or create your own drill.</p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {visible.map((d) => (
              <li key={d.id}>
                <Link href={`/practices/drills/${d.id}`} className="block h-full">
                  <DrillCard drill={d} canEdit={canEdit} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
