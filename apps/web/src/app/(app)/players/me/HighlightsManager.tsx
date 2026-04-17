'use client';
import type { JSX } from 'react';
import { useState, useTransition } from 'react';
import { addHighlightAction, deleteHighlightAction } from './actions';
import type { PlayerHighlightVideo, VideoProvider } from '@baseball/shared';

interface Props {
  highlights: PlayerHighlightVideo[];
  isPro: boolean;
}

export function HighlightsManager({ highlights, isPro }: Props): JSX.Element {
  const [error, setError] = useState<string | null>(null);
  const [isAdding, startAdd] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function handleAdd(formData: FormData) {
    setError(null);
    startAdd(() => {
      addHighlightAction(formData).then((result) => {
        if ('error' in result) {
          setError(result.error);
        } else {
          const form = document.getElementById('highlight-form') as HTMLFormElement | null;
          form?.reset();
        }
      });
    });
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    const result = await deleteHighlightAction(id);
    if ('error' in result) setError(result.error);
    setDeletingId(null);
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-base font-semibold text-gray-900">Highlight videos</h2>
        {!isPro && (
          <span className="text-xs text-gray-500 bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-full">
            Pro required
          </span>
        )}
      </div>

      {highlights.length === 0 ? (
        <p className="text-sm text-gray-400 mb-4">No highlight videos yet.</p>
      ) : (
        <ul className="space-y-2 mb-5">
          {highlights.map((h) => (
            <li key={h.id} className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-lg px-4 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{h.title}</p>
                <p className="text-xs text-gray-500 truncate">
                  <span className="inline-block px-1.5 py-0.5 bg-gray-100 rounded text-[10px] mr-2 uppercase">{h.provider}</span>
                  {h.url}
                </p>
              </div>
              <button
                onClick={() => handleDelete(h.id)}
                disabled={deletingId === h.id}
                className="text-xs text-red-600 hover:underline disabled:opacity-50"
              >
                {deletingId === h.id ? '…' : 'Delete'}
              </button>
            </li>
          ))}
        </ul>
      )}

      {isPro && (
        <form id="highlight-form" action={handleAdd} className="space-y-3 pt-4 border-t border-gray-100">
          <div className="grid grid-cols-[1fr,8rem] gap-3">
            <input
              name="title"
              placeholder="Title (e.g. Senior year vs. Central)"
              required
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <select
              name="provider"
              defaultValue=""
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">Auto</option>
              {(['youtube', 'hudl', 'vimeo', 'other'] as VideoProvider[]).map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <input
            name="url"
            type="url"
            placeholder="https://youtube.com/watch?v=…"
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={isAdding}
            className="bg-brand-700 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-brand-800 disabled:opacity-50"
          >
            {isAdding ? 'Adding…' : 'Add highlight'}
          </button>
        </form>
      )}
    </div>
  );
}
