'use client';

import type { JSX } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

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
    const value = e.target.value;
    const tab = searchParams.get('tab') ?? 'pitching';
    const tier = searchParams.get('tier');
    let url = `/compliance?tab=${tab}`;
    if (value) url += `&season=${value}`;
    if (tier) url += `&tier=${tier}`;
    router.push(url);
  }

  if (seasons.length === 0) return null;

  return (
    <select
      value={currentSeasonId ?? ''}
      onChange={handleChange}
      className="border border-gray-300 rounded-lg px-2 py-1 text-sm bg-white text-gray-700"
    >
      <option value="">All Games</option>
      {seasons.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}
