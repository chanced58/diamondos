'use client';
import type { JSX } from 'react';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { activatePlayerProAction, deactivatePlayerProAction } from './actions';

export interface PlayerAdminRowData {
  userId: string;
  handle: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  isPublic: boolean;
  isPro: boolean;
  createdAt: string;
}

export function PlayerAdminRow({ row }: { row: PlayerAdminRowData }): JSX.Element {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [optimisticPro, setOptimisticPro] = useState(row.isPro);

  function toggle() {
    const next = !optimisticPro;
    setOptimisticPro(next);
    setError(null);
    startTransition(() => {
      const p = next
        ? activatePlayerProAction(row.userId)
        : deactivatePlayerProAction(row.userId);
      p.then((result) => {
        if ('error' in result) {
          setOptimisticPro(!next);
          setError(result.error);
        }
      });
    });
  }

  const name = [row.firstName, row.lastName].filter(Boolean).join(' ') || '—';

  return (
    <tr className="border-b border-gray-100">
      <td className="px-4 py-3">
        <div>
          <p className="text-sm font-medium text-gray-900">{name}</p>
          <p className="text-xs text-gray-500">{row.email}</p>
        </div>
      </td>
      <td className="px-4 py-3">
        <Link
          href={`/p/${row.handle}`}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-brand-700 hover:underline"
        >
          /p/{row.handle}
        </Link>
      </td>
      <td className="px-4 py-3">
        {row.isPublic ? (
          <span className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">
            Public
          </span>
        ) : (
          <span className="text-xs bg-gray-50 text-gray-500 border border-gray-200 px-2 py-0.5 rounded-full">
            Private
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        {optimisticPro ? (
          <span className="text-xs bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full font-semibold">
            Pro
          </span>
        ) : (
          <span className="text-xs bg-gray-50 text-gray-500 border border-gray-200 px-2 py-0.5 rounded-full">
            Free
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <button
          onClick={toggle}
          disabled={isPending}
          className={`text-sm font-semibold px-3 py-1 rounded-lg disabled:opacity-50 ${
            optimisticPro
              ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              : 'bg-brand-700 text-white hover:bg-brand-800'
          }`}
        >
          {isPending ? '…' : optimisticPro ? 'Deactivate' : 'Activate Pro'}
        </button>
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      </td>
    </tr>
  );
}
