'use client';
import { useTransition } from 'react';
import type { JSX } from 'react';
import { endInjuryFlagAction } from './actions';

type FlagRow = {
  id: string;
  injury_slug: string;
  effective_from: string;
  effective_to: string | null;
  notes: string | null;
};

type CatalogRow = {
  slug: string;
  name: string;
  body_part: string;
};

export function InjuryFlagList({
  teamId,
  playerId,
  flags,
  catalogBySlug,
  variant,
}: {
  teamId: string;
  playerId: string;
  flags: FlagRow[];
  catalogBySlug: Map<string, CatalogRow>;
  variant: 'active' | 'past';
}): JSX.Element {
  const [isPending, startTransition] = useTransition();

  function handleEnd(flagId: string) {
    const fd = new FormData();
    fd.append('teamId', teamId);
    fd.append('playerId', playerId);
    fd.append('flagId', flagId);
    fd.append('endDate', new Date().toISOString().slice(0, 10));
    startTransition(() => {
      void endInjuryFlagAction(null, fd);
    });
  }

  return (
    <div className={`bg-white border rounded-xl overflow-hidden ${variant === 'active' ? 'border-amber-200' : 'border-gray-200'}`}>
      <table className="w-full text-sm">
        <thead className={variant === 'active' ? 'bg-amber-50 border-b border-amber-200' : 'bg-gray-50 border-b border-gray-200'}>
          <tr>
            <th className="text-left font-medium text-gray-700 px-4 py-2.5">Injury</th>
            <th className="text-left font-medium text-gray-700 px-4 py-2.5">Body part</th>
            <th className="text-left font-medium text-gray-700 px-4 py-2.5">From</th>
            <th className="text-left font-medium text-gray-700 px-4 py-2.5">To</th>
            <th className="text-left font-medium text-gray-700 px-4 py-2.5">Notes</th>
            {variant === 'active' && <th className="text-right font-medium text-gray-700 px-4 py-2.5">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {flags.map((f) => {
            const c = catalogBySlug.get(f.injury_slug);
            return (
              <tr key={f.id} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-2.5 font-medium text-gray-900">{c?.name ?? f.injury_slug}</td>
                <td className="px-4 py-2.5 text-gray-600">{c?.body_part.replace('_', ' ') ?? '—'}</td>
                <td className="px-4 py-2.5 tabular-nums">{f.effective_from}</td>
                <td className="px-4 py-2.5 tabular-nums">{f.effective_to ?? '—'}</td>
                <td className="px-4 py-2.5 text-gray-600">{f.notes ?? '—'}</td>
                {variant === 'active' && (
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleEnd(f.id)}
                      className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50"
                    >
                      End today
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
