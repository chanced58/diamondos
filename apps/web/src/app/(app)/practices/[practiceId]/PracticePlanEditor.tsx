'use client';
import type { JSX } from 'react';

import { useFormState, useFormStatus } from 'react-dom';
import { savePracticePlanAction } from './actions';

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-sm bg-brand-700 text-white font-semibold px-4 py-2 rounded-lg hover:bg-brand-800 disabled:opacity-50 transition-colors"
    >
      {pending ? 'Saving…' : 'Save Plan'}
    </button>
  );
}

export function PracticePlanEditor({
  practiceId,
  initialPlan,
}: {
  practiceId: string;
  initialPlan: string;
}): JSX.Element | null {
  const [result, action] = useFormState(savePracticePlanAction, null);

  return (
    <div className="mb-8">
      <h2 className="text-base font-semibold text-gray-800 mb-3">Practice Plan</h2>
      <form action={action} className="space-y-3">
        <input type="hidden" name="practiceId" value={practiceId} />
        <textarea
          name="plan"
          defaultValue={initialPlan}
          rows={6}
          placeholder="Write your practice plan here — drills, themes, schedule, objectives…"
          className="w-full text-sm rounded-xl border border-gray-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-brand-400 resize-y"
        />
        <div className="flex items-center gap-3">
          <SaveButton />
          {result === 'saved' && (
            <span className="text-sm text-green-600">Saved ✓</span>
          )}
          {result && result !== 'saved' && (
            <span className="text-sm text-red-600">{result}</span>
          )}
        </div>
      </form>
    </div>
  );
}
