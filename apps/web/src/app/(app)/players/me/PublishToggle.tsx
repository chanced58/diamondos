'use client';
import type { JSX } from 'react';
import { useState, useTransition } from 'react';
import { togglePublicAction } from './actions';

interface Props {
  isPublic: boolean;
  isPro: boolean;
  handle: string | null;
  publicUrl: string | null;
}

export function PublishToggle({ isPublic, isPro, handle, publicUrl }: Props): JSX.Element {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState(isPublic);

  function toggle() {
    const next = !optimistic;
    setOptimistic(next);
    setError(null);
    startTransition(() => {
      togglePublicAction(next).then((result) => {
        if ('error' in result) {
          setOptimistic(!next);
          setError(result.error);
        }
      });
    });
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Visibility</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {optimistic
              ? 'Your profile is public — anyone with the link can view it.'
              : 'Your profile is private.'}
          </p>
          {optimistic && publicUrl && (
            <p className="text-xs text-gray-400 mt-2">
              Shareable link:{' '}
              <a href={publicUrl} className="text-brand-700 hover:underline" target="_blank" rel="noreferrer">
                {publicUrl}
              </a>
            </p>
          )}
        </div>
        {isPro ? (
          <button
            onClick={toggle}
            disabled={isPending || !handle}
            className={`shrink-0 px-4 py-2 rounded-lg text-sm font-semibold ${
              optimistic
                ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                : 'bg-brand-700 text-white hover:bg-brand-800'
            } disabled:opacity-50`}
          >
            {isPending ? '…' : optimistic ? 'Make private' : 'Publish publicly'}
          </button>
        ) : (
          <span className="shrink-0 text-xs text-gray-500 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-lg">
            Pro required
          </span>
        )}
      </div>
      {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
    </div>
  );
}
