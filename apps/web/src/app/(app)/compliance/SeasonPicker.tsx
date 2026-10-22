'use client';

import type { JSX } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ALL_SEASONS } from '@baseball/shared';

type Season = {
  id: string;
  name: string;
};

export function SeasonPicker({
  seasons,
  currentSeasonId,
}: {
  seasons: Season[];
  currentSeasonId: string | null;
}): JSX.Element | null {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString());
    // Always explicit: no `season` param means the active season, so "All
    // Games" needs its own value to stay selected.
    params.set('season', e.target.value);
    router.push(`/compliance?${params.toString()}`);
  }

  if (seasons.length === 0) return null;

  return (
    <select
      value={currentSeasonId ?? ALL_SEASONS}
      onChange={handleChange}
      className="border border-gray-300 rounded-lg px-2 py-1 text-sm bg-white text-gray-700"
    >
      <option value={ALL_SEASONS}>All Games</option>
      {seasons.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}
