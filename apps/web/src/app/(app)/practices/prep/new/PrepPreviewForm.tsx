'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { SuggestedBlock } from '@baseball/shared';
import { createPrepPracticeAction } from './actions';

interface Props {
  teamId: string;
  linkedGameId: string;
  scheduledAt: string;
  durationMinutes: number;
  focusSummary: string;
  blocks: SuggestedBlock[];
  drillsById: Record<string, string>;
  weaknessLabels: string[];
  tendencyLabels: string[];
}

export function PrepPreviewForm(props: Props): JSX.Element {
  const router = useRouter();
  const [scheduledAt, setScheduledAt] = useState(toLocalInput(props.scheduledAt));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(() => {
      void (async () => {
        const result = await createPrepPracticeAction({
          teamId: props.teamId,
          linkedGameId: props.linkedGameId,
          scheduledAt: new Date(scheduledAt).toISOString(),
          durationMinutes: props.durationMinutes,
          prepFocusSummary: props.focusSummary,
          blocks: props.blocks,
        });
        if (typeof result === 'string') {
          setError(result);
          return;
        }
        router.push(`/practices/${result.practiceId}`);
        router.refresh();
      })();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Suggested blocks</h2>
        <ol className="space-y-2">
          {props.blocks.map((b) => (
            <li key={b.position} className="flex items-start gap-3 text-sm">
              <span className="font-mono text-gray-400 w-12 shrink-0 pt-0.5">{b.plannedDurationMinutes}m</span>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900">{b.title}</div>
                <div className="text-xs text-gray-500">{b.rationale}</div>
                {b.drillId && props.drillsById[b.drillId] && (
                  <div className="text-xs text-gray-400 mt-0.5">Drill: {props.drillsById[b.drillId]}</div>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Practice date + time</span>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            required
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-brand-500 focus:ring-brand-500 text-sm"
          />
        </label>
        <div className="text-xs text-gray-500">
          Total planned: {props.blocks.reduce((n, b) => n + b.plannedDurationMinutes, 0)} minutes
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg px-4 py-3">{error}</div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="bg-brand-700 text-white font-semibold px-5 py-2 rounded-lg hover:bg-brand-800 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
          {isPending ? 'Creating…' : 'Create prep practice'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="text-sm text-gray-600 hover:text-gray-900"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
