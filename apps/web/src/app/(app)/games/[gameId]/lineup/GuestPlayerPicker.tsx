'use client';

import type { JSX } from 'react';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  addExistingGuestToLineupAction,
  addNewGuestToLineupAction,
  searchGuestCandidatesAction,
} from './guest-actions';

interface GuestPlayerPickerProps {
  gameId: string;
  defaultCountTowardStats: boolean;
}

type Candidate = {
  id: string;
  firstName: string;
  lastName: string;
  jerseyNumber: number | null;
  sourceLabel: string;
};

export function GuestPlayerPicker({
  gameId,
  defaultCountTowardStats,
}: GuestPlayerPickerProps): JSX.Element {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'search' | 'new'>('search');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Search-mode state
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Candidate[]>([]);
  const [searching, setSearching] = useState(false);

  // New-guest state
  const [newFirst, setNewFirst] = useState('');
  const [newLast, setNewLast] = useState('');
  const [newJersey, setNewJersey] = useState('');

  // Shared
  const [countTowardStats, setCountTowardStats] = useState(defaultCountTowardStats);

  async function runSearch() {
    setSearching(true);
    setErrorMsg(null);
    try {
      const res = await searchGuestCandidatesAction({ gameId, query });
      if ('error' in res) {
        setErrorMsg(res.error);
        setResults([]);
      } else {
        setResults(res.candidates);
      }
    } finally {
      setSearching(false);
    }
  }

  function reset() {
    setOpen(false);
    setMode('search');
    setQuery('');
    setResults([]);
    setNewFirst('');
    setNewLast('');
    setNewJersey('');
    setErrorMsg(null);
    setCountTowardStats(defaultCountTowardStats);
  }

  function pickExisting(candidate: Candidate) {
    startTransition(() => {
      void (async () => {
        setErrorMsg(null);
        const res = await addExistingGuestToLineupAction({
          gameId,
          playerId: candidate.id,
          countTowardStats,
        });
        if ('error' in res) {
          setErrorMsg(res.error);
          return;
        }
        router.refresh();
        reset();
      })();
    });
  }

  function addNew(e: React.FormEvent) {
    e.preventDefault();
    startTransition(() => {
      void (async () => {
        setErrorMsg(null);
        const jersey = newJersey.trim() === '' ? null : Number.parseInt(newJersey, 10);
        const res = await addNewGuestToLineupAction({
          gameId,
          firstName: newFirst,
          lastName: newLast,
          jerseyNumber: Number.isFinite(jersey ?? NaN) ? jersey : null,
          countTowardStats,
        });
        if ('error' in res) {
          setErrorMsg(res.error);
          return;
        }
        router.refresh();
        reset();
      })();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-medium border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
      >
        + Add Guest Player
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Add guest player"
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Add Guest Player</h2>
          <button
            type="button"
            onClick={reset}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="px-6 pt-4">
          <div className="flex gap-2 border-b border-gray-100">
            <button
              type="button"
              onClick={() => setMode('search')}
              className={`text-sm font-medium px-3 pb-2 border-b-2 ${
                mode === 'search'
                  ? 'border-brand-700 text-brand-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              From League History
            </button>
            <button
              type="button"
              onClick={() => setMode('new')}
              className={`text-sm font-medium px-3 pb-2 border-b-2 ${
                mode === 'new'
                  ? 'border-brand-700 text-brand-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              New Guest
            </button>
          </div>
        </div>

        <div className="px-6 py-4 overflow-y-auto flex-1">
          {errorMsg && (
            <div className="mb-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
              {errorMsg}
            </div>
          )}

          {mode === 'search' && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name (e.g. Smith)"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      runSearch();
                    }
                  }}
                  className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <button
                  type="button"
                  onClick={runSearch}
                  disabled={searching}
                  className="text-sm font-medium bg-gray-100 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-200 disabled:opacity-50"
                >
                  {searching ? 'Searching…' : 'Search'}
                </button>
              </div>

              {results.length === 0 ? (
                <p className="text-xs text-gray-400">
                  Search by name to find players from this league&apos;s history or
                  any team in the system.
                </p>
              ) : (
                <ul className="border border-gray-100 rounded-lg divide-y divide-gray-100">
                  {results.map((c) => (
                    <li
                      key={c.id}
                      className="px-3 py-2 flex items-center justify-between hover:bg-gray-50"
                    >
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {c.lastName}, {c.firstName}
                          {c.jerseyNumber != null && (
                            <span className="ml-2 text-xs text-gray-400">
                              #{c.jerseyNumber}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-400">{c.sourceLabel}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => pickExisting(c)}
                        disabled={isPending}
                        className="text-xs font-medium text-brand-700 hover:text-brand-900 disabled:opacity-50"
                      >
                        Add as guest
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {mode === 'new' && (
            <form onSubmit={addNew} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    First name
                  </label>
                  <input
                    type="text"
                    value={newFirst}
                    onChange={(e) => setNewFirst(e.target.value)}
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Last name
                  </label>
                  <input
                    type="text"
                    value={newLast}
                    onChange={(e) => setNewLast(e.target.value)}
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Jersey # (optional)
                </label>
                <input
                  type="number"
                  min={0}
                  max={99}
                  value={newJersey}
                  onChange={(e) => setNewJersey(e.target.value)}
                  className="w-32 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <button
                type="submit"
                disabled={isPending || !newFirst.trim() || !newLast.trim()}
                className="text-sm font-medium bg-brand-700 text-white px-4 py-2 rounded-lg hover:bg-brand-800 disabled:opacity-50"
              >
                {isPending ? 'Adding…' : 'Add Guest'}
              </button>
            </form>
          )}
        </div>

        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={countTowardStats}
              onChange={(e) => setCountTowardStats(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-brand-700 focus:ring-brand-500"
            />
            <span>Count this appearance toward the player&apos;s stats</span>
          </label>
        </div>
      </div>
    </div>
  );
}
