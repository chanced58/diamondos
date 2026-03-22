'use client';

import type { JSX } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

type StatTier = 'youth' | 'high_school' | 'college';

const TIERS: { value: StatTier; label: string }[] = [
  { value: 'youth', label: 'Basic' },
  { value: 'high_school', label: 'Standard' },
  { value: 'college', label: 'Advanced' },
];

export function TierToggle({
  currentTier,
}: {
  currentTier: StatTier;
}): JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleClick(tier: StatTier) {
    const tab = searchParams.get('tab') ?? 'pitching';
    const season = searchParams.get('season');
    let url = `/compliance?tab=${tab}`;
    if (season) url += `&season=${season}`;
    url += `&tier=${tier}`;
    router.push(url);
  }

  return (
    <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
      {TIERS.map((t) => (
        <button
          key={t.value}
          onClick={() => handleClick(t.value)}
          className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
            currentTier === t.value
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
