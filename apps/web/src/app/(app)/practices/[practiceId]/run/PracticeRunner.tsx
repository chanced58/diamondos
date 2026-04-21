'use client';

import { useEffect, useMemo, useState, type JSX } from 'react';
import { useRouter } from 'next/navigation';
import {
  BLOCK_TYPE_LABELS,
  PracticeBlockStatus,
  PracticeRunStatus,
  PracticeWithBlocks,
  computeBlockRemaining,
  formatCountdown,
} from '@baseball/shared';
import {
  completeBlockAction,
  completePracticeAction,
  skipBlockAction,
  startBlockAction,
  startPracticeAction,
} from './actions';

interface Props {
  practice: PracticeWithBlocks;
}

export function PracticeRunner({ practice }: Props): JSX.Element {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const orderedBlocks = useMemo(
    () => [...practice.blocks].sort((a, b) => a.position - b.position),
    [practice.blocks],
  );

  const activeBlock = orderedBlocks.find(
    (b) => b.status === PracticeBlockStatus.ACTIVE,
  );
  const firstPending = orderedBlocks.find(
    (b) => b.status === PracticeBlockStatus.PENDING,
  );
  const currentBlock = activeBlock ?? firstPending;

  const timer = currentBlock
    ? computeBlockRemaining(
        {
          startedAt: currentBlock.startedAt,
          plannedDurationMinutes: currentBlock.plannedDurationMinutes,
        },
        now,
      )
    : null;

  const color =
    !timer || timer.overrunSeconds > 0
      ? 'text-red-600'
      : timer.remainingSeconds > timer.plannedSeconds * 0.5
        ? 'text-emerald-600'
        : timer.remainingSeconds > timer.plannedSeconds * 0.1
          ? 'text-amber-500'
          : 'text-red-600';

  function run(fn: () => Promise<void>) {
    setPending(true);
    fn().finally(() => setPending(false));
  }

  function handleStartPractice() {
    run(async () => {
      const res = await startPracticeAction({ practiceId: practice.id });
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  function handleStartBlock() {
    if (!currentBlock) return;
    run(async () => {
      const res = await startBlockAction({
        practiceId: practice.id,
        blockId: currentBlock.id,
      });
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  function handleCompleteBlock() {
    if (!activeBlock) return;
    const actual = activeBlock.startedAt
      ? Math.max(1, Math.round((now.getTime() - new Date(activeBlock.startedAt).getTime()) / 60_000))
      : activeBlock.plannedDurationMinutes;
    run(async () => {
      const res = await completeBlockAction({
        practiceId: practice.id,
        blockId: activeBlock.id,
        actualDurationMinutes: actual,
      });
      if (res.error) setError(res.error);
      else {
        const next = orderedBlocks.find(
          (b) => b.position > activeBlock.position && b.status === PracticeBlockStatus.PENDING,
        );
        if (next) {
          const startRes = await startBlockAction({
            practiceId: practice.id,
            blockId: next.id,
          });
          if (startRes.error) setError(startRes.error);
        }
        router.refresh();
      }
    });
  }

  function handleSkipBlock() {
    if (!activeBlock) return;
    run(async () => {
      const res = await skipBlockAction({ practiceId: practice.id, blockId: activeBlock.id });
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  function handleCompletePractice() {
    if (!confirm('End practice?')) return;
    run(async () => {
      const res = await completePracticeAction({ practiceId: practice.id });
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  const allDone = orderedBlocks.every(
    (b) =>
      b.status === PracticeBlockStatus.COMPLETED ||
      b.status === PracticeBlockStatus.SKIPPED,
  );

  if (practice.runStatus === PracticeRunStatus.COMPLETED) {
    return (
      <div className="max-w-2xl mx-auto p-6 text-center">
        <div className="bg-white rounded-xl border border-gray-200 p-10">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Practice complete ✓</h2>
          <p className="text-gray-500">Ended at{' '}
            {practice.completedAt
              ? new Date(practice.completedAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : '—'}
          </p>
        </div>
      </div>
    );
  }

  if (practice.runStatus === PracticeRunStatus.NOT_STARTED) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <h2 className="text-xl font-bold text-gray-900 mb-1">Ready to run</h2>
          <p className="text-gray-500 mb-6">
            {orderedBlocks.length} block{orderedBlocks.length === 1 ? '' : 's'} ·{' '}
            {practice.totalPlannedMinutes} min total
          </p>
          <button
            type="button"
            onClick={handleStartPractice}
            disabled={pending || orderedBlocks.length === 0}
            className="bg-emerald-600 text-white text-lg font-semibold px-8 py-3 rounded-xl hover:bg-emerald-700 disabled:opacity-60"
          >
            ▶ Start practice
          </button>
          {orderedBlocks.length === 0 && (
            <p className="text-red-600 text-sm mt-3">Add at least one block first.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
      <main>
        {currentBlock ? (
          <section className="bg-white rounded-2xl border border-gray-200 p-6 md:p-10">
            <div className="text-sm uppercase tracking-wide text-gray-500 mb-1">
              {BLOCK_TYPE_LABELS[currentBlock.blockType]}
              {activeBlock ? ' · Active' : ' · Up next'}
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-6">
              {currentBlock.title}
            </h2>
            {timer && (
              <div className="text-center py-4">
                <div className={`text-6xl md:text-8xl font-mono font-bold ${color}`}>
                  {timer.overrunSeconds > 0
                    ? `+${formatCountdown(timer.overrunSeconds)}`
                    : formatCountdown(timer.remainingSeconds)}
                </div>
                <p className="text-sm text-gray-500 mt-2">
                  {timer.overrunSeconds > 0
                    ? `Overrun · planned ${currentBlock.plannedDurationMinutes} min`
                    : `of ${currentBlock.plannedDurationMinutes} min`}
                </p>
              </div>
            )}

            {currentBlock.notes && (
              <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3 mt-4 whitespace-pre-wrap">
                {currentBlock.notes}
              </p>
            )}

            <div className="flex items-center justify-center gap-2 mt-6 flex-wrap">
              {!activeBlock ? (
                <button
                  type="button"
                  onClick={handleStartBlock}
                  disabled={pending}
                  className="bg-emerald-600 text-white font-semibold px-6 py-3 rounded-xl hover:bg-emerald-700 disabled:opacity-60"
                >
                  Start this block
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleCompleteBlock}
                    disabled={pending}
                    className="bg-brand-700 text-white font-semibold px-6 py-3 rounded-xl hover:bg-brand-800 disabled:opacity-60"
                  >
                    ✓ Complete block
                  </button>
                  <button
                    type="button"
                    onClick={handleSkipBlock}
                    disabled={pending}
                    className="bg-white border border-gray-300 font-semibold px-4 py-3 rounded-xl hover:bg-gray-50"
                  >
                    Skip
                  </button>
                </>
              )}
            </div>
          </section>
        ) : (
          <section className="bg-white rounded-2xl border border-gray-200 p-6 text-center">
            <p className="text-gray-500">All blocks completed.</p>
          </section>
        )}

        <div className="flex justify-center mt-6">
          <button
            type="button"
            onClick={handleCompletePractice}
            disabled={pending}
            className="text-sm text-red-600 hover:underline"
          >
            End practice {allDone ? '' : 'early'}
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mt-4">
            {error}
          </div>
        )}
      </main>

      <aside className="bg-white rounded-xl border border-gray-200 p-4 space-y-2 self-start">
        <h3 className="text-xs uppercase tracking-wide font-semibold text-gray-500 mb-2">
          Practice plan
        </h3>
        <ul className="space-y-1">
          {orderedBlocks.map((b) => {
            const isCurrent = currentBlock?.id === b.id;
            const done = b.status === PracticeBlockStatus.COMPLETED;
            const skipped = b.status === PracticeBlockStatus.SKIPPED;
            return (
              <li
                key={b.id}
                className={`text-sm px-2 py-1.5 rounded-lg ${
                  isCurrent
                    ? 'bg-brand-50 border border-brand-200 font-semibold text-brand-900'
                    : done
                      ? 'text-gray-400 line-through'
                      : skipped
                        ? 'text-gray-400 italic'
                        : 'text-gray-700'
                }`}
              >
                {done ? '✓ ' : skipped ? '⤼ ' : ''}
                {b.title}
                <span className="text-xs text-gray-400 ml-2">{b.plannedDurationMinutes}m</span>
              </li>
            );
          })}
        </ul>
      </aside>
    </div>
  );
}
