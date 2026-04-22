'use client';

import { useMemo, useState, type FormEvent, type JSX } from 'react';
import { useRouter } from 'next/navigation';
import {
  BLOCK_TYPE_LABELS,
  FIELD_SPACE_LABELS,
  PracticeFieldSpace,
} from '@baseball/shared';
import {
  createPracticeFromAiPlanAction,
  generateAiPracticeAction,
  type GenerateSuccess,
} from './actions';

interface Props {
  teamId: string;
}

const DEFAULT_FIELD_SPACES: PracticeFieldSpace[] = [
  PracticeFieldSpace.INFIELD,
  PracticeFieldSpace.OUTFIELD,
  PracticeFieldSpace.CAGE_1,
  PracticeFieldSpace.BULLPEN_1,
];

export function NLPracticeForm({ teamId }: Props): JSX.Element {
  const router = useRouter();
  const [prompt, setPrompt] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(90);
  const [playerCount, setPlayerCount] = useState(14);
  const [fieldSpaces, setFieldSpaces] = useState<PracticeFieldSpace[]>(
    DEFAULT_FIELD_SPACES,
  );
  const [generated, setGenerated] = useState<GenerateSuccess | null>(null);
  const [scheduledAt, setScheduledAt] = useState(() => defaultScheduledAt());
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalPlanned = useMemo(
    () =>
      generated?.plan.blocks.reduce(
        (n, b) => n + b.plannedDurationMinutes,
        0,
      ) ?? 0,
    [generated],
  );

  async function runGenerate(e?: FormEvent<HTMLFormElement>) {
    e?.preventDefault();
    if (isGenerating) return;
    setError(null);
    setIsGenerating(true);
    try {
      const result = await generateAiPracticeAction({
        teamId,
        coachPrompt: prompt,
        durationMinutes,
        playerCount,
        availableFieldSpaces: fieldSpaces,
      });
      if (typeof result === 'string') {
        setError(result);
        setGenerated(null);
        return;
      }
      setGenerated(result);
    } finally {
      setIsGenerating(false);
    }
  }

  async function runSave() {
    if (!generated || isSaving) return;
    setError(null);
    setIsSaving(true);
    try {
      const result = await createPracticeFromAiPlanAction({
        teamId,
        scheduledAt: new Date(scheduledAt).toISOString(),
        durationMinutes,
        plan: generated.plan,
      });
      if (typeof result === 'string') {
        setError(result);
        return;
      }
      router.push(`/practices/${result.practiceId}`);
      router.refresh();
    } finally {
      setIsSaving(false);
    }
  }

  function toggleFieldSpace(fs: PracticeFieldSpace) {
    setFieldSpaces((curr) =>
      curr.includes(fs) ? curr.filter((x) => x !== fs) : [...curr, fs],
    );
  }

  return (
    <div className="space-y-6">
      <form onSubmit={runGenerate} className="space-y-5">
        <label className="block">
          <span className="text-sm font-medium text-gray-700">
            What should this practice focus on?
          </span>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            required
            placeholder='e.g. "Two-strike approach and 1st-and-3rd defense. Keep pitchers on light throwing only."'
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-brand-500 focus:ring-brand-500 text-sm"
          />
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Duration (min)</span>
            <input
              type="number"
              min={15}
              max={240}
              step={5}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(parseInt(e.target.value, 10) || 0)}
              required
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-brand-500 focus:ring-brand-500 text-sm"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Players</span>
            <input
              type="number"
              min={1}
              max={50}
              value={playerCount}
              onChange={(e) => setPlayerCount(parseInt(e.target.value, 10) || 0)}
              required
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-brand-500 focus:ring-brand-500 text-sm"
            />
          </label>
        </div>

        <fieldset>
          <legend className="text-sm font-medium text-gray-700 mb-2">
            Available field spaces
          </legend>
          <div className="flex flex-wrap gap-2">
            {(Object.values(PracticeFieldSpace) as PracticeFieldSpace[]).map((fs) => {
              const on = fieldSpaces.includes(fs);
              return (
                <button
                  type="button"
                  key={fs}
                  onClick={() => toggleFieldSpace(fs)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    on
                      ? 'bg-brand-100 border-brand-400 text-brand-900'
                      : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400'
                  }`}
                >
                  {FIELD_SPACE_LABELS[fs]}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={isGenerating}
            className="bg-brand-700 text-white font-semibold px-5 py-2 rounded-lg hover:bg-brand-800 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {isGenerating ? 'Generating…' : generated ? 'Regenerate' : 'Generate plan'}
          </button>
          {generated && (
            <button
              type="button"
              onClick={() => {
                setGenerated(null);
                setError(null);
              }}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Clear plan
            </button>
          )}
        </div>
      </form>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {generated && (
        <section className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <h2 className="text-sm font-semibold text-amber-900 mb-1">Focus</h2>
            <p className="text-sm text-amber-900/90">{generated.plan.focusSummary}</p>
            {generated.unknownDrillIds.length > 0 && (
              <p className="mt-2 text-xs text-amber-800/80">
                {generated.unknownDrillIds.length} drill reference(s) were unrecognized and dropped to &quot;no drill&quot; blocks.
              </p>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-900">Generated blocks</h2>
              <span className="text-xs text-gray-500 tabular-nums">
                {totalPlanned} / {durationMinutes} min planned
              </span>
            </div>
            <ol className="space-y-3">
              {generated.plan.blocks.map((b, i) => {
                const drillName = b.drillId ? generated.drillsById[b.drillId] : null;
                return (
                  <li key={i} className="flex items-start gap-3 text-sm">
                    <span className="font-mono text-gray-400 w-12 shrink-0 pt-0.5">
                      {b.plannedDurationMinutes}m
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="font-medium text-gray-900">{b.title}</span>
                        <span className="text-[10px] uppercase tracking-wide text-gray-400">
                          {BLOCK_TYPE_LABELS[b.blockType]}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{b.rationale}</p>
                      {drillName && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          Drill: {drillName}
                        </p>
                      )}
                      {b.drillId && !drillName && (
                        <p className="text-xs text-red-500 mt-0.5">
                          Drill reference unknown — block will save without a drill.
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
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
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={runSave}
              disabled={isSaving}
              className="bg-brand-700 text-white font-semibold px-5 py-2 rounded-lg hover:bg-brand-800 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {isSaving ? 'Saving…' : 'Save as practice'}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Cancel
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function defaultScheduledAt(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(15, 0, 0, 0);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
