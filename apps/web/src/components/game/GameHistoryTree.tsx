'use client';

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type {
  GameHistoryTree as GameHistoryTreeType,
  InningNode,
  HalfInningNode,
  AtBatNode,
  InterstitialNode,
  PitchNode,
  HistoryEventNode,
  EventCategory,
} from '@baseball/shared';
import { replaceEventAction, insertCorrectionEventAction, insertCorrectionEventsBatchAction, voidEventAction, replayAtBatAction } from '@/app/(app)/games/[gameId]/actions';
import type { GameEvent } from '@baseball/shared';

export type PlayerEntry = { id: string; name: string };

// ── Category Colors ─────────────────────────────────────────────────────────

const CATEGORY_PILL: Record<EventCategory, string> = {
  positive: 'bg-green-50 text-green-700 border border-green-200',
  negative: 'bg-red-50 text-red-700 border border-red-200',
  neutral: 'bg-gray-100 text-gray-600 border border-gray-200',
  info: 'bg-blue-50 text-blue-700 border border-blue-200',
};

const CATEGORY_TEXT: Record<EventCategory, string> = {
  positive: 'text-green-700',
  negative: 'text-red-700',
  neutral: 'text-gray-600',
  info: 'text-blue-600',
};

// ── Chevron Icon ────────────────────────────────────────────────────────────

function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

// ── Fielding position constants ─────────────────────────────────────────────

const POSITIONS = [
  { positionNumber: 1, label: 'P' }, { positionNumber: 2, label: 'C' }, { positionNumber: 3, label: '1B' },
  { positionNumber: 4, label: '2B' }, { positionNumber: 5, label: '3B' }, { positionNumber: 6, label: 'SS' },
  { positionNumber: 7, label: 'LF' }, { positionNumber: 8, label: 'CF' }, { positionNumber: 9, label: 'RF' },
];

const TRAJECTORY_TO_OUT_TYPE: Record<string, string> = {
  ground_ball: 'groundout',
  line_drive: 'lineout',
  fly_ball: 'flyout',
};

// ── Replace Event Panel ────────────────────────────────────────────────────

function ReplaceEventPanel({
  originalEvent,
  gameId,
  onDone,
}: {
  originalEvent: GameEvent;
  gameId: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<'type' | 'in-play-result' | 'trajectory' | 'fielding' | 'error-fielder'>('type');
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingResult, setPendingResult] = useState<string | null>(null);
  const [trajectory, setTrajectory] = useState<string | null>(null);
  const [fieldingSeq, setFieldingSeq] = useState<number[]>([]);

  // Extract batter/pitcher from original event payload
  const origPayload = originalEvent.payload as Record<string, unknown>;
  const batterId = (origPayload.batterId ?? origPayload.opponentBatterId ?? '') as string;
  const pitcherId = (origPayload.pitcherId ?? origPayload.opponentPitcherId ?? '') as string;
  const isOpponentBatter = !!origPayload.opponentBatterId;
  const isOpponentPitcher = !!origPayload.opponentPitcherId;

  async function submitReplacement(eventType: string, payload: Record<string, unknown>) {
    if (isPending) return;
    setIsPending(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set('gameId', gameId);
      formData.set('eventId', originalEvent.id);
      formData.set('eventType', eventType);
      formData.set('payload', JSON.stringify(payload));
      const err = await replaceEventAction(null, formData);
      if (err) { setError(err); return; }
      onDone();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to replace event.');
    } finally {
      setIsPending(false);
    }
  }

  /** Insert a new event AFTER the original (without voiding it). Used for "In Play" results. */
  async function insertAfterOriginal(eventType: string, payload: Record<string, unknown>) {
    if (isPending) return;
    setIsPending(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set('gameId', gameId);
      formData.set('eventType', eventType);
      formData.set('inning', String(originalEvent.inning));
      formData.set('isTopOfInning', String(originalEvent.isTopOfInning));
      formData.set('payload', JSON.stringify({
        ...payload,
        insertAfterSequence: originalEvent.sequenceNumber,
      }));
      const err = await insertCorrectionEventAction(null, formData);
      if (err) { setError(err); return; }
      onDone();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add result.');
    } finally {
      setIsPending(false);
    }
  }

  async function handleDelete() {
    if (isPending) return;
    if (!confirm('Delete this event?')) return;
    setIsPending(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set('gameId', gameId);
      formData.set('eventId', originalEvent.id);
      const err = await voidEventAction(null, formData);
      if (err) { setError(err); return; }
      onDone();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete event.');
    } finally {
      setIsPending(false);
    }
  }

  function buildBatterPitcher(): Record<string, unknown> {
    const batterPitcherIds: Record<string, unknown> = {};
    if (isOpponentBatter) batterPitcherIds.opponentBatterId = batterId;
    else if (batterId) batterPitcherIds.batterId = batterId;
    if (isOpponentPitcher) batterPitcherIds.opponentPitcherId = pitcherId;
    else if (pitcherId) batterPitcherIds.pitcherId = pitcherId;
    return batterPitcherIds;
  }

  // Determine whether to replace the original event or insert after it
  const isPitchEvent = originalEvent.eventType === 'pitch_thrown';
  const isInPlayFlow = isPitchEvent && (step === 'in-play-result' || (step !== 'type' && pendingResult !== null));
  const submit = isInPlayFlow ? insertAfterOriginal : submitReplacement;

  // Runner / between-pitch events use a dedicated edit form. The runner's
  // identity (runnerId) stays fixed; only base / reason / outcome /
  // fielding-sequence fields are editable. If the coach got the runner
  // wrong they delete and re-add.
  if (RUNNER_EVENT_TYPES.has(originalEvent.eventType)) {
    return (
      <RunnerEventEditForm
        originalEvent={originalEvent}
        isPending={isPending}
        error={error}
        onSubmit={(eventType, payload) => submitReplacement(eventType, payload)}
        onDelete={handleDelete}
        onCancel={onDone}
      />
    );
  }

  // Events whose only edit is delete (or a single numeric field). Balk,
  // pitching change, and catcher interference carry no per-event fields
  // worth correcting — if the coach needs to change the event, the
  // right workflow is delete + re-add.
  if (
    originalEvent.eventType === 'balk' ||
    originalEvent.eventType === 'pitching_change' ||
    originalEvent.eventType === 'catcher_interference'
  ) {
    return (
      <SimpleDeleteForm
        eventType={originalEvent.eventType}
        isPending={isPending}
        error={error}
        onDelete={handleDelete}
        onCancel={onDone}
      />
    );
  }

  // Score events only have an editable RBI count (OBR 9.04(b) override).
  if (originalEvent.eventType === 'score') {
    return (
      <ScoreEventEditForm
        originalEvent={originalEvent}
        isPending={isPending}
        error={error}
        onSubmit={(payload) => submitReplacement('score', payload)}
        onDelete={handleDelete}
        onCancel={onDone}
      />
    );
  }

  // Substitution lets the coach correct the substitution category
  // (pinch hitter / runner / defensive / position change); incoming
  // and outgoing player IDs stay fixed.
  if (originalEvent.eventType === 'substitution') {
    return (
      <SubstitutionEventEditForm
        originalEvent={originalEvent}
        isPending={isPending}
        error={error}
        onSubmit={(payload) => submitReplacement('substitution', payload)}
        onDelete={handleDelete}
        onCancel={onDone}
      />
    );
  }

  function handleDirectResult(eventType: string, extra: Record<string, unknown> = {}) {
    submit(eventType, { ...buildBatterPitcher(), ...extra });
  }

  function handleHitResult(hitType: string, selectedTrajectory?: string) {
    submit('hit', { ...buildBatterPitcher(), hitType, trajectory: selectedTrajectory ?? trajectory ?? undefined });
  }

  function handleOutResult(eventType: string) {
    const outType = TRAJECTORY_TO_OUT_TYPE[trajectory ?? ''] ?? 'groundout';
    submit(eventType, {
      ...buildBatterPitcher(),
      outType,
      trajectory: trajectory ?? undefined,
      fieldingSequence: fieldingSeq.length > 0 ? fieldingSeq : undefined,
    });
  }

  function handleErrorWithFielder(errorBy: number) {
    submit('field_error', {
      ...buildBatterPitcher(),
      errorBy,
      trajectory: trajectory ?? undefined,
    });
  }

  // Pitch replacement
  if (isPitchEvent && step === 'type') {
    // Show pitch outcome picker first; "In Play" transitions to the result flow
    return (
      <div className="mt-2 p-3 bg-white rounded-lg border border-brand-200 shadow-sm space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Replace pitch outcome</p>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Ball', outcome: 'ball' },
            { label: 'Called Strike', outcome: 'called_strike' },
            { label: 'Swinging Strike', outcome: 'swinging_strike' },
          ].map(({ label, outcome }) => (
            <button
              key={outcome}
              type="button"
              disabled={isPending}
              onClick={() => handleDirectResult('pitch_thrown', { outcome })}
              className="py-2 text-sm font-medium rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40 transition-colors"
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'Foul', outcome: 'foul' },
            { label: 'Foul Tip', outcome: 'foul_tip' },
          ].map(({ label, outcome }) => (
            <button
              key={outcome}
              type="button"
              disabled={isPending}
              onClick={() => handleDirectResult('pitch_thrown', { outcome })}
              className="py-2 text-sm font-medium rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40 transition-colors"
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={() => handleDirectResult('pitch_thrown', { outcome: 'hit_by_pitch' })}
            className="py-2 text-sm font-medium rounded-lg border border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100 disabled:opacity-40 transition-colors"
          >
            HBP
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => setStep('in-play-result')}
            className="py-2 text-sm font-medium rounded-lg border border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100 disabled:opacity-40 transition-colors"
          >
            In Play →
          </button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex items-center gap-3">
          <button type="button" onClick={onDone} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
          <button type="button" disabled={isPending} onClick={handleDelete} className="text-xs text-red-500 hover:text-red-700">Delete</button>
        </div>
      </div>
    );
  }

  // "In Play" result picker — shown after selecting In Play on a pitch
  if (step === 'in-play-result') {
    return (
      <div className="mt-2 p-3 bg-white rounded-lg border border-brand-200 shadow-sm space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">In play — what happened?</p>
        <div className="grid grid-cols-4 gap-2">
          {([
            { label: 'Single', value: 'single' },
            { label: 'Double', value: 'double' },
            { label: 'Triple', value: 'triple' },
            { label: 'HR', value: 'home_run' },
          ] as const).map(({ label, value }) => (
            <button key={value} type="button" disabled={isPending}
              onClick={() => { setPendingResult(value); setStep('trajectory'); }}
              className="py-2 text-sm font-medium rounded-lg border border-gray-300 bg-gray-50 hover:bg-gray-100 disabled:opacity-40 transition-colors"
            >{label}</button>
          ))}
        </div>
        <div className="grid grid-cols-4 gap-2">
          {([
            { label: 'Out', value: 'out' },
            { label: 'DP', value: 'double_play' },
            { label: 'TP', value: 'triple_play' },
            { label: 'FC', value: 'field_choice' },
          ] as const).map(({ label, value }) => (
            <button key={value} type="button" disabled={isPending}
              onClick={() => { setPendingResult(value); setStep('trajectory'); }}
              className="py-2 text-sm font-medium rounded-lg border border-gray-300 bg-gray-50 hover:bg-gray-100 disabled:opacity-40 transition-colors"
            >{label}</button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-2">
          <button type="button" disabled={isPending}
            onClick={() => { setPendingResult('error'); setStep('trajectory'); }}
            className="py-2 text-sm font-medium rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-40 transition-colors"
          >Error</button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button type="button" onClick={() => setStep('type')} className="text-xs text-gray-400 hover:text-gray-600">← Back to pitch outcome</button>
      </div>
    );
  }

  // Terminal event replacement — step-based flow
  if (step === 'error-fielder') {
    return (
      <div className="mt-2 p-3 bg-white rounded-lg border border-brand-200 shadow-sm space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Who made the error?</p>
        <div className="grid grid-cols-3 gap-2">
          {POSITIONS.map(({ positionNumber, label }) => (
            <button
              key={positionNumber}
              type="button"
              disabled={isPending}
              onClick={() => handleErrorWithFielder(positionNumber)}
              className="py-2 text-sm font-medium rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-40 transition-colors"
            >
              {label}
            </button>
          ))}
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button type="button" onClick={() => setStep('trajectory')} className="text-xs text-gray-400 hover:text-gray-600">← Back</button>
      </div>
    );
  }

  if (step === 'fielding') {
    return (
      <div className="mt-2 p-3 bg-white rounded-lg border border-brand-200 shadow-sm space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Fielding play order</p>
        {fieldingSeq.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-gray-900 tracking-wider">
              {fieldingSeq.map((num) => POSITIONS.find((p) => p.positionNumber === num)?.label ?? String(num)).join('-')}
            </span>
            <button type="button" onClick={() => setFieldingSeq((s) => s.slice(0, -1))} className="text-xs text-gray-400 hover:text-gray-600 underline">Undo</button>
          </div>
        )}
        <div className="grid grid-cols-3 gap-2">
          {POSITIONS.map(({ positionNumber, label }) => (
            <button
              key={positionNumber}
              type="button"
              disabled={fieldingSeq.length >= 8}
              onClick={() => setFieldingSeq((s) => [...s, positionNumber])}
              className="py-2 text-sm font-medium rounded-lg border border-gray-300 bg-gray-50 hover:bg-gray-100 disabled:opacity-40 transition-colors"
            >
              {positionNumber} — {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {(() => {
            const eventType = pendingResult === 'double_play' ? 'double_play' : pendingResult === 'triple_play' ? 'triple_play' : 'out';
            const buttonLabel = pendingResult === 'double_play' ? 'DP' : pendingResult === 'triple_play' ? 'TP' : pendingResult === 'field_choice' ? 'FC' : 'Out';
            return (
              <>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handleOutResult(eventType)}
                  className="flex-1 py-2 text-sm font-semibold rounded-lg bg-brand-700 text-white hover:bg-brand-800 disabled:opacity-40 transition-colors"
                >
                  Record {buttonLabel}
                </button>
                <button type="button" onClick={() => handleOutResult(eventType)} className="text-xs text-gray-400 hover:text-gray-600 underline">Skip</button>
              </>
            );
          })()}
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button type="button" onClick={() => { setStep('trajectory'); setFieldingSeq([]); }} className="text-xs text-gray-400 hover:text-gray-600">← Back</button>
      </div>
    );
  }

  if (step === 'trajectory' && pendingResult) {
    return (
      <div className="mt-2 p-3 bg-white rounded-lg border border-brand-200 shadow-sm space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">How was it hit?</p>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Ground Ball', value: 'ground_ball' },
            { label: 'Line Drive', value: 'line_drive' },
            { label: 'Fly Ball', value: 'fly_ball' },
          ].map(({ label, value }) => (
            <button
              key={value}
              type="button"
              disabled={isPending}
              onClick={() => {
                setTrajectory(value);
                if (pendingResult === 'error') {
                  setStep('error-fielder');
                } else if (['out', 'double_play', 'triple_play', 'field_choice'].includes(pendingResult)) {
                  setStep('fielding');
                } else {
                  handleHitResult(pendingResult, value);
                }
              }}
              className="py-2 text-sm font-medium rounded-lg border border-gray-300 bg-gray-50 hover:bg-gray-100 disabled:opacity-40 transition-colors"
            >
              {label}
            </button>
          ))}
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button type="button" onClick={() => { setStep(isPitchEvent ? 'in-play-result' : 'type'); setPendingResult(null); }} className="text-xs text-gray-400 hover:text-gray-600">← Back</button>
      </div>
    );
  }

  // Step 1: Result type picker (for non-pitch terminal events)
  return (
    <div className="mt-2 p-3 bg-white rounded-lg border border-brand-200 shadow-sm space-y-3">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Replace with&hellip;</p>
      <div className="grid grid-cols-4 gap-2">
        {([
          { label: 'Single', value: 'single' },
          { label: 'Double', value: 'double' },
          { label: 'Triple', value: 'triple' },
          { label: 'HR', value: 'home_run' },
        ] as const).map(({ label, value }) => (
          <button
            key={value}
            type="button"
            disabled={isPending}
            onClick={() => { setPendingResult(value); setStep('trajectory'); }}
            className="py-2 text-sm font-medium rounded-lg border border-gray-300 bg-gray-50 hover:bg-gray-100 disabled:opacity-40 transition-colors"
          >
            {label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-2">
        {([
          { label: 'Out', value: 'out' },
          { label: 'DP', value: 'double_play' },
          { label: 'TP', value: 'triple_play' },
          { label: 'FC', value: 'field_choice' },
        ] as const).map(({ label, value }) => (
          <button
            key={value}
            type="button"
            disabled={isPending}
            onClick={() => { setPendingResult(value); setStep('trajectory'); }}
            className="py-2 text-sm font-medium rounded-lg border border-gray-300 bg-gray-50 hover:bg-gray-100 disabled:opacity-40 transition-colors"
          >
            {label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() => { setPendingResult('error'); setStep('trajectory'); }}
          className="py-2 text-sm font-medium rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-40 transition-colors"
        >
          Error
        </button>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {([
          { label: 'Walk', eventType: 'walk' },
          { label: 'HBP', eventType: 'hit_by_pitch' },
          { label: 'Strikeout', eventType: 'strikeout' },
          { label: 'Sac Fly', eventType: 'sacrifice_fly' },
          { label: 'Sac Bunt', eventType: 'sacrifice_bunt' },
        ] as const).map(({ label, eventType }) => (
          <button
            key={eventType}
            type="button"
            disabled={isPending}
            onClick={() => handleDirectResult(eventType)}
            className="py-2 text-sm font-medium rounded-lg border border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100 disabled:opacity-40 transition-colors"
          >
            {label}
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex items-center gap-3">
        <button type="button" onClick={onDone} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
        <button type="button" disabled={isPending} onClick={handleDelete} className="text-xs text-red-500 hover:text-red-700">Delete</button>
      </div>
    </div>
  );
}

// ── Runner Event Edit Form ─────────────────────────────────────────────────
//
// Rendered inside ReplaceEventPanel for stolen_base / caught_stealing /
// baserunner_advance / baserunner_out / pickoff_attempt / rundown.
// The runner's identity (runnerId) is carried over from the original
// payload unchanged; this form only exposes the base / reason / outcome
// fields the coach can correct.
function RunnerEventEditForm({
  originalEvent,
  isPending,
  error,
  onSubmit,
  onDelete,
  onCancel,
}: {
  originalEvent: GameEvent;
  isPending: boolean;
  error: string | null;
  onSubmit: (eventType: string, payload: Record<string, unknown>) => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const etype = originalEvent.eventType;
  const p = originalEvent.payload as Record<string, unknown>;
  const runnerId = (p.runnerId as string | undefined) ?? '';
  const isOpponentRunner = p.isOpponentRunner === true;
  const pitcherId = (p.pitcherId as string | undefined) ?? '';

  // Preserve fields that this form does not expose for editing.
  const runnerIdFields: Record<string, unknown> = { runnerId };
  if (isOpponentRunner) runnerIdFields.isOpponentRunner = true;

  const [fromBase, setFromBase] = useState<number>((p.fromBase as number | undefined) ?? 1);
  const [reason, setReason] = useState<string>((p.reason as string | undefined) ?? '');
  const [errorBy, setErrorBy] = useState<number | null>((p.errorBy as number | undefined) ?? null);
  const [pickoffBase, setPickoffBase] = useState<number>((p.base as number | undefined) ?? 1);
  const [pickoffOutcome, setPickoffOutcome] = useState<string>((p.outcome as string | undefined) ?? 'safe');
  const [rundownOutcome, setRundownOutcome] = useState<string>((p.outcome as string | undefined) ?? 'out');
  const [rundownSafeBase, setRundownSafeBase] = useState<number>((p.safeAtBase as number | undefined) ?? 1);

  function submitSteal(retireType: 'stolen_base' | 'caught_stealing') {
    const toBase = fromBase + 1;
    onSubmit(retireType, { ...runnerIdFields, fromBase, toBase });
  }

  function submitAdvance() {
    const toBase = fromBase + 1;
    const payload: Record<string, unknown> = { ...runnerIdFields, fromBase, toBase };
    if (reason) payload.reason = reason;
    if ((reason === 'error' || reason === 'overthrow') && errorBy !== null) {
      payload.errorBy = errorBy;
    }
    onSubmit('baserunner_advance', payload);
  }

  function submitBaserunnerOut() {
    onSubmit('baserunner_out', { ...runnerIdFields, fromBase });
  }

  function submitPickoff() {
    const payload: Record<string, unknown> = {
      ...runnerIdFields,
      base: pickoffBase,
      outcome: pickoffOutcome,
    };
    if (pitcherId) payload.pitcherId = pitcherId;
    onSubmit('pickoff_attempt', payload);
  }

  function submitRundown() {
    const throwSequence = (p.throwSequence as number[] | undefined) ?? [];
    const payload: Record<string, unknown> = {
      ...runnerIdFields,
      startBase: (p.startBase as number | undefined) ?? fromBase,
      throwSequence,
      outcome: rundownOutcome,
    };
    if (rundownOutcome === 'safe') payload.safeAtBase = rundownSafeBase;
    onSubmit('rundown', payload);
  }

  return (
    <div className="mt-2 p-3 bg-white rounded-lg border border-brand-200 shadow-sm space-y-3">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
        Edit {etype.replace(/_/g, ' ')}
      </p>

      {(etype === 'stolen_base' || etype === 'caught_stealing' || etype === 'baserunner_advance' || etype === 'baserunner_out') && (
        <BasePicker label="From base" value={fromBase} onChange={setFromBase} />
      )}

      {etype === 'baserunner_advance' && (
        <>
          <div>
            <p className="text-xs text-gray-500 mb-1">Reason</p>
            <div className="grid grid-cols-4 gap-1.5">
              {ADVANCE_REASONS.map(({ label, value }) => (
                <button
                  key={value}
                  type="button"
                  disabled={isPending}
                  onClick={() => setReason(value)}
                  className={`py-1.5 text-xs font-medium rounded-md border transition-colors ${
                    reason === value
                      ? 'border-brand-500 bg-brand-50 text-brand-800'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >{label}</button>
              ))}
            </div>
          </div>
          {(reason === 'error' || reason === 'overthrow') && (
            <div>
              <p className="text-xs text-gray-500 mb-1">Charged to fielder</p>
              <div className="grid grid-cols-9 gap-1.5">
                {POSITIONS.map(({ positionNumber, label }) => (
                  <button
                    key={positionNumber}
                    type="button"
                    disabled={isPending}
                    onClick={() => setErrorBy(positionNumber)}
                    className={`py-1 text-xs font-medium rounded-md border transition-colors ${
                      errorBy === positionNumber
                        ? 'border-red-500 bg-red-50 text-red-800'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >{label}</button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {etype === 'pickoff_attempt' && (
        <>
          <BasePicker label="Picked off at" value={pickoffBase} onChange={setPickoffBase} />
          <div>
            <p className="text-xs text-gray-500 mb-1">Outcome</p>
            <div className="grid grid-cols-2 gap-2">
              {(['safe', 'out'] as const).map((o) => (
                <button
                  key={o}
                  type="button"
                  disabled={isPending}
                  onClick={() => setPickoffOutcome(o)}
                  className={`py-2 text-sm font-medium rounded-md border transition-colors ${
                    pickoffOutcome === o
                      ? 'border-brand-500 bg-brand-50 text-brand-800'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >{o === 'out' ? 'Out' : 'Safe'}</button>
              ))}
            </div>
          </div>
        </>
      )}

      {etype === 'rundown' && (
        <>
          <div>
            <p className="text-xs text-gray-500 mb-1">Outcome</p>
            <div className="grid grid-cols-2 gap-2">
              {(['out', 'safe'] as const).map((o) => (
                <button
                  key={o}
                  type="button"
                  disabled={isPending}
                  onClick={() => setRundownOutcome(o)}
                  className={`py-2 text-sm font-medium rounded-md border transition-colors ${
                    rundownOutcome === o
                      ? 'border-brand-500 bg-brand-50 text-brand-800'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >{o === 'out' ? 'Runner out' : 'Runner safe'}</button>
              ))}
            </div>
          </div>
          {rundownOutcome === 'safe' && (
            <BasePicker label="Safe at" value={rundownSafeBase} onChange={setRundownSafeBase} />
          )}
        </>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex items-center gap-3">
        <button type="button" onClick={onCancel} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
        <button type="button" disabled={isPending} onClick={onDelete} className="text-xs text-red-500 hover:text-red-700">Delete</button>
        <div className="ml-auto">
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              if (etype === 'stolen_base') submitSteal('stolen_base');
              else if (etype === 'caught_stealing') submitSteal('caught_stealing');
              else if (etype === 'baserunner_advance') submitAdvance();
              else if (etype === 'baserunner_out') submitBaserunnerOut();
              else if (etype === 'pickoff_attempt') submitPickoff();
              else if (etype === 'rundown') submitRundown();
            }}
            className="px-4 py-1.5 text-sm font-semibold rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40 transition-colors"
          >Save</button>
        </div>
      </div>
    </div>
  );
}

function BasePicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <div className="grid grid-cols-3 gap-2">
        {[1, 2, 3].map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => onChange(b)}
            className={`py-2 text-sm font-medium rounded-md border transition-colors ${
              value === b
                ? 'border-brand-500 bg-brand-50 text-brand-800'
                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            {b === 1 ? '1st' : b === 2 ? '2nd' : '3rd'}
          </button>
        ))}
      </div>
    </div>
  );
}

// Simple delete-only panel for events whose per-event payload is not
// worth surfacing (balk, pitching_change, catcher_interference). The
// coach can still correct these by deleting and re-adding.
function SimpleDeleteForm({
  eventType,
  isPending,
  error,
  onDelete,
  onCancel,
}: {
  eventType: string;
  isPending: boolean;
  error: string | null;
  onDelete: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-2 p-3 bg-white rounded-lg border border-brand-200 shadow-sm space-y-2">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
        {eventType.replace(/_/g, ' ')}
      </p>
      <p className="text-xs text-gray-500">
        This event has no editable fields. Delete it and add a new one to correct.
      </p>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex items-center gap-3">
        <button type="button" onClick={onCancel} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
        <button type="button" disabled={isPending} onClick={onDelete} className="text-xs text-red-500 hover:text-red-700">Delete</button>
      </div>
    </div>
  );
}

function ScoreEventEditForm({
  originalEvent,
  isPending,
  error,
  onSubmit,
  onDelete,
  onCancel,
}: {
  originalEvent: GameEvent;
  isPending: boolean;
  error: string | null;
  onSubmit: (payload: Record<string, unknown>) => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const p = originalEvent.payload as Record<string, unknown>;
  const scoringPlayerId = (p.scoringPlayerId as string | undefined) ?? '';
  const isOpponentScore = p.isOpponentScore === true;
  const [rbis, setRbis] = useState<number>((p.rbis as number | undefined) ?? 0);

  function submit() {
    const payload: Record<string, unknown> = { scoringPlayerId, rbis };
    if (isOpponentScore) payload.isOpponentScore = true;
    onSubmit(payload);
  }

  return (
    <div className="mt-2 p-3 bg-white rounded-lg border border-brand-200 shadow-sm space-y-3">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Edit run scored</p>
      <div>
        <p className="text-xs text-gray-500 mb-1">RBI credit</p>
        <div className="grid grid-cols-5 gap-2">
          {[0, 1, 2, 3, 4].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRbis(n)}
              className={`py-2 text-sm font-medium rounded-md border transition-colors ${
                rbis === n
                  ? 'border-brand-500 bg-brand-50 text-brand-800'
                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >{n}</button>
          ))}
        </div>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex items-center gap-3">
        <button type="button" onClick={onCancel} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
        <button type="button" disabled={isPending} onClick={onDelete} className="text-xs text-red-500 hover:text-red-700">Delete</button>
        <div className="ml-auto">
          <button
            type="button"
            disabled={isPending}
            onClick={submit}
            className="px-4 py-1.5 text-sm font-semibold rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40 transition-colors"
          >Save</button>
        </div>
      </div>
    </div>
  );
}

function SubstitutionEventEditForm({
  originalEvent,
  isPending,
  error,
  onSubmit,
  onDelete,
  onCancel,
}: {
  originalEvent: GameEvent;
  isPending: boolean;
  error: string | null;
  onSubmit: (payload: Record<string, unknown>) => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const p = originalEvent.payload as Record<string, unknown>;
  const inPlayerId = (p.inPlayerId as string | undefined) ?? '';
  const outPlayerId = p.outPlayerId as string | undefined;
  const isOpponentSubstitution = p.isOpponentSubstitution === true;
  const runnerBase = p.runnerBase as 1 | 2 | 3 | undefined;
  const [subType, setSubType] = useState<string>((p.substitutionType as string | undefined) ?? 'pinch_hitter');

  function submit() {
    const payload: Record<string, unknown> = {
      inPlayerId,
      substitutionType: subType,
    };
    if (outPlayerId !== undefined) payload.outPlayerId = outPlayerId;
    if (isOpponentSubstitution) payload.isOpponentSubstitution = true;
    if (runnerBase !== undefined) payload.runnerBase = runnerBase;
    onSubmit(payload);
  }

  return (
    <div className="mt-2 p-3 bg-white rounded-lg border border-brand-200 shadow-sm space-y-3">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Edit substitution</p>
      <div>
        <p className="text-xs text-gray-500 mb-1">Substitution type</p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { value: 'pinch_hitter', label: 'Pinch Hitter' },
            { value: 'pinch_runner', label: 'Pinch Runner' },
            { value: 'defensive', label: 'Defensive' },
            { value: 'position_change', label: 'Position Change' },
          ].map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setSubType(value)}
              className={`py-2 text-sm font-medium rounded-md border transition-colors ${
                subType === value
                  ? 'border-brand-500 bg-brand-50 text-brand-800'
                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >{label}</button>
          ))}
        </div>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex items-center gap-3">
        <button type="button" onClick={onCancel} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
        <button type="button" disabled={isPending} onClick={onDelete} className="text-xs text-red-500 hover:text-red-700">Delete</button>
        <div className="ml-auto">
          <button
            type="button"
            disabled={isPending}
            onClick={submit}
            className="px-4 py-1.5 text-sm font-semibold rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40 transition-colors"
          >Save</button>
        </div>
      </div>
    </div>
  );
}

// ── Edit Event Button ──────────────────────────────────────────────────────

const EDITABLE_EVENT_TYPES = new Set([
  // Pitch + plate-appearance outcomes
  'pitch_thrown',
  'hit', 'out', 'walk', 'hit_by_pitch', 'strikeout',
  'sacrifice_bunt', 'sacrifice_fly', 'field_error',
  'double_play', 'triple_play',
  // Runner + between-pitch events
  'stolen_base', 'caught_stealing', 'baserunner_advance', 'baserunner_out',
  'pickoff_attempt', 'rundown', 'balk', 'score',
  'substitution', 'pitching_change', 'catcher_interference',
]);

// Runner-family events all carry a runnerId that the edit panel keeps
// fixed; the coach can only correct base / reason / outcome, per spec
// docs/superpowers/specs/2026-04-20-editable-runner-events-design.md.
const RUNNER_EVENT_TYPES = new Set([
  'stolen_base', 'caught_stealing', 'baserunner_advance', 'baserunner_out',
  'pickoff_attempt', 'rundown',
]);

const ADVANCE_REASONS = [
  { label: 'Wild Pitch', value: 'wild_pitch' },
  { label: 'Passed Ball', value: 'passed_ball' },
  { label: 'Error', value: 'error' },
  { label: 'Overthrow', value: 'overthrow' },
  { label: 'Balk', value: 'balk' },
  { label: 'Voluntary', value: 'voluntary' },
  { label: 'On Play', value: 'on_play' },
] as const;

function EditEventButton({ event, gameId, children }: { event: GameEvent; gameId: string; children?: React.ReactNode }) {
  if (!EDITABLE_EVENT_TYPES.has(event.eventType)) return <>{children}</>;

  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <>
        {children}
        <ReplaceEventPanel
          originalEvent={event}
          gameId={gameId}
          onDone={() => setEditing(false)}
        />
      </>
    );
  }

  return (
    <>
      {children}
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="shrink-0 p-0.5 text-gray-300 hover:text-brand-600 disabled:opacity-50 transition-colors"
        aria-label="Edit event"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Z" />
        </svg>
      </button>
    </>
  );
}

// ── Add Event Panel ────────────────────────────────────────────────────────

function AddEventPanel({
  gameId,
  inning,
  isTopOfInning,
  teamPlayers,
  opponentPlayers,
  insertAfterSequence,
  onDone,
}: {
  gameId: string;
  inning: number;
  isTopOfInning: boolean;
  teamPlayers: PlayerEntry[];
  opponentPlayers: PlayerEntry[];
  insertAfterSequence?: number;
  onDone: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<'players' | 'type' | 'trajectory' | 'fielding' | 'error-fielder'>('players');
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batterId, setBatterId] = useState('');
  const [pitcherId, setPitcherId] = useState('');
  const [isOpponentBatter, setIsOpponentBatter] = useState(false);
  const [isOpponentPitcher, setIsOpponentPitcher] = useState(false);
  const [pendingResult, setPendingResult] = useState<string | null>(null);
  const [trajectory, setTrajectory] = useState<string | null>(null);
  const [fieldingSeq, setFieldingSeq] = useState<number[]>([]);

  // In top of inning: away team bats, home team pitches
  // isTopOfInning=true means opponent bats if we're tracking from the home team perspective
  // But we don't know for sure — let the coach pick from either roster

  const allBatters = [
    ...teamPlayers.map((p) => ({ ...p, isOpponent: false })),
    ...opponentPlayers.map((p) => ({ ...p, isOpponent: true })),
  ];
  const allPitchers = [
    ...teamPlayers.map((p) => ({ ...p, isOpponent: false })),
    ...opponentPlayers.map((p) => ({ ...p, isOpponent: true })),
  ];

  function buildBatterPitcher(): Record<string, unknown> {
    const ids: Record<string, unknown> = {};
    if (isOpponentBatter) ids.opponentBatterId = batterId;
    else if (batterId) ids.batterId = batterId;
    if (isOpponentPitcher) ids.opponentPitcherId = pitcherId;
    else if (pitcherId) ids.pitcherId = pitcherId;
    return ids;
  }

  async function submitEvent(eventType: string, payload: Record<string, unknown>) {
    if (isPending) return;
    setIsPending(true);
    setError(null);
    try {
      const finalPayload = insertAfterSequence != null
        ? { ...payload, insertAfterSequence }
        : payload;
      const formData = new FormData();
      formData.set('gameId', gameId);
      formData.set('eventType', eventType);
      formData.set('inning', String(inning));
      formData.set('isTopOfInning', String(isTopOfInning));
      formData.set('payload', JSON.stringify(finalPayload));
      const err = await insertCorrectionEventAction(null, formData);
      if (err) { setError(err); return; }
      onDone();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add event.');
    } finally {
      setIsPending(false);
    }
  }

  function handleDirectResult(eventType: string, extra: Record<string, unknown> = {}) {
    submitEvent(eventType, { ...buildBatterPitcher(), ...extra });
  }

  function handleHitResult(hitType: string, selectedTrajectory?: string) {
    submitEvent('hit', { ...buildBatterPitcher(), hitType, trajectory: selectedTrajectory ?? trajectory ?? undefined });
  }

  function handleOutResult(eventType: string) {
    const outType = TRAJECTORY_TO_OUT_TYPE[trajectory ?? ''] ?? 'groundout';
    submitEvent(eventType, {
      ...buildBatterPitcher(),
      outType,
      trajectory: trajectory ?? undefined,
      fieldingSequence: fieldingSeq.length > 0 ? fieldingSeq : undefined,
    });
  }

  function handleErrorWithFielder(errorBy: number) {
    submitEvent('field_error', {
      ...buildBatterPitcher(),
      errorBy,
      trajectory: trajectory ?? undefined,
    });
  }

  // Step 0: Pick batter and pitcher
  if (step === 'players') {
    return (
      <div className="mt-2 p-3 bg-white rounded-lg border border-brand-200 shadow-sm space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Add Play — Select Players</p>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Batter</label>
          <select
            value={batterId}
            onChange={(e) => {
              const id = e.target.value;
              setBatterId(id);
              const entry = allBatters.find((p) => p.id === id);
              setIsOpponentBatter(entry?.isOpponent ?? false);
            }}
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:border-brand-400"
          >
            <option value="">Select batter...</option>
            {teamPlayers.length > 0 && (
              <optgroup label="Our Team">
                {teamPlayers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </optgroup>
            )}
            {opponentPlayers.length > 0 && (
              <optgroup label="Opponent">
                {opponentPlayers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </optgroup>
            )}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Pitcher</label>
          <select
            value={pitcherId}
            onChange={(e) => {
              const id = e.target.value;
              setPitcherId(id);
              const entry = allPitchers.find((p) => p.id === id);
              setIsOpponentPitcher(entry?.isOpponent ?? false);
            }}
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:border-brand-400"
          >
            <option value="">Select pitcher...</option>
            {teamPlayers.length > 0 && (
              <optgroup label="Our Team">
                {teamPlayers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </optgroup>
            )}
            {opponentPlayers.length > 0 && (
              <optgroup label="Opponent">
                {opponentPlayers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </optgroup>
            )}
          </select>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={!batterId || !pitcherId}
            onClick={() => setStep('type')}
            className="px-4 py-1.5 text-sm font-semibold rounded-lg bg-brand-700 text-white hover:bg-brand-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
          <button type="button" onClick={onDone} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  if (step === 'error-fielder') {
    return (
      <div className="mt-2 p-3 bg-white rounded-lg border border-brand-200 shadow-sm space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Who made the error?</p>
        <div className="grid grid-cols-3 gap-2">
          {POSITIONS.map(({ positionNumber, label }) => (
            <button key={positionNumber} type="button" disabled={isPending} onClick={() => handleErrorWithFielder(positionNumber)}
              className="py-2 text-sm font-medium rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-40 transition-colors"
            >{label}</button>
          ))}
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button type="button" onClick={() => setStep('trajectory')} className="text-xs text-gray-400 hover:text-gray-600">← Back</button>
      </div>
    );
  }

  if (step === 'fielding') {
    const eventType = pendingResult === 'double_play' ? 'double_play' : pendingResult === 'triple_play' ? 'triple_play' : 'out';
    const buttonLabel = pendingResult === 'double_play' ? 'DP' : pendingResult === 'triple_play' ? 'TP' : pendingResult === 'field_choice' ? 'FC' : 'Out';
    return (
      <div className="mt-2 p-3 bg-white rounded-lg border border-brand-200 shadow-sm space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Fielding play order</p>
        {fieldingSeq.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-gray-900 tracking-wider">
              {fieldingSeq.map((num) => POSITIONS.find((p) => p.positionNumber === num)?.label ?? String(num)).join('-')}
            </span>
            <button type="button" onClick={() => setFieldingSeq((s) => s.slice(0, -1))} className="text-xs text-gray-400 hover:text-gray-600 underline">Undo</button>
          </div>
        )}
        <div className="grid grid-cols-3 gap-2">
          {POSITIONS.map(({ positionNumber, label }) => (
            <button key={positionNumber} type="button" disabled={fieldingSeq.length >= 8} onClick={() => setFieldingSeq((s) => [...s, positionNumber])}
              className="py-2 text-sm font-medium rounded-lg border border-gray-300 bg-gray-50 hover:bg-gray-100 disabled:opacity-40 transition-colors"
            >{positionNumber} — {label}</button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <button type="button" disabled={isPending} onClick={() => handleOutResult(eventType)}
            className="flex-1 py-2 text-sm font-semibold rounded-lg bg-brand-700 text-white hover:bg-brand-800 disabled:opacity-40 transition-colors"
          >Record {buttonLabel}</button>
          <button type="button" onClick={() => handleOutResult(eventType)} className="text-xs text-gray-400 hover:text-gray-600 underline">Skip</button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button type="button" onClick={() => { setStep('trajectory'); setFieldingSeq([]); }} className="text-xs text-gray-400 hover:text-gray-600">← Back</button>
      </div>
    );
  }

  if (step === 'trajectory' && pendingResult) {
    return (
      <div className="mt-2 p-3 bg-white rounded-lg border border-brand-200 shadow-sm space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">How was it hit?</p>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Ground Ball', value: 'ground_ball' },
            { label: 'Line Drive', value: 'line_drive' },
            { label: 'Fly Ball', value: 'fly_ball' },
          ].map(({ label, value }) => (
            <button key={value} type="button" disabled={isPending}
              onClick={() => {
                setTrajectory(value);
                if (pendingResult === 'error') setStep('error-fielder');
                else if (['out', 'double_play', 'triple_play', 'field_choice'].includes(pendingResult)) setStep('fielding');
                else handleHitResult(pendingResult, value);
              }}
              className="py-2 text-sm font-medium rounded-lg border border-gray-300 bg-gray-50 hover:bg-gray-100 disabled:opacity-40 transition-colors"
            >{label}</button>
          ))}
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button type="button" onClick={() => { setStep('type'); setPendingResult(null); }} className="text-xs text-gray-400 hover:text-gray-600">← Back</button>
      </div>
    );
  }

  // Step 1: Result type picker (same as ReplaceEventPanel)
  return (
    <div className="mt-2 p-3 bg-white rounded-lg border border-brand-200 shadow-sm space-y-3">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">What happened?</p>
      <div className="grid grid-cols-4 gap-2">
        {([
          { label: 'Single', value: 'single' },
          { label: 'Double', value: 'double' },
          { label: 'Triple', value: 'triple' },
          { label: 'HR', value: 'home_run' },
        ] as const).map(({ label, value }) => (
          <button key={value} type="button" disabled={isPending} onClick={() => { setPendingResult(value); setStep('trajectory'); }}
            className="py-2 text-sm font-medium rounded-lg border border-gray-300 bg-gray-50 hover:bg-gray-100 disabled:opacity-40 transition-colors"
          >{label}</button>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-2">
        {([
          { label: 'Out', value: 'out' },
          { label: 'DP', value: 'double_play' },
          { label: 'TP', value: 'triple_play' },
          { label: 'FC', value: 'field_choice' },
        ] as const).map(({ label, value }) => (
          <button key={value} type="button" disabled={isPending} onClick={() => { setPendingResult(value); setStep('trajectory'); }}
            className="py-2 text-sm font-medium rounded-lg border border-gray-300 bg-gray-50 hover:bg-gray-100 disabled:opacity-40 transition-colors"
          >{label}</button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-2">
        <button type="button" disabled={isPending} onClick={() => { setPendingResult('error'); setStep('trajectory'); }}
          className="py-2 text-sm font-medium rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-40 transition-colors"
        >Error</button>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {([
          { label: 'Walk', eventType: 'walk' },
          { label: 'HBP', eventType: 'hit_by_pitch' },
          { label: 'Strikeout', eventType: 'strikeout' },
          { label: 'Sac Fly', eventType: 'sacrifice_fly' },
          { label: 'Sac Bunt', eventType: 'sacrifice_bunt' },
        ] as const).map(({ label, eventType }) => (
          <button key={eventType} type="button" disabled={isPending} onClick={() => handleDirectResult(eventType)}
            className="py-2 text-sm font-medium rounded-lg border border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100 disabled:opacity-40 transition-colors"
          >{label}</button>
        ))}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button type="button" onClick={() => setStep('players')} className="text-xs text-gray-400 hover:text-gray-600">← Back to players</button>
    </div>
  );
}

// ── Add Play Button ────────────────────────────────────────────────────────

function AddPlayButton({
  gameId,
  inning,
  isTopOfInning,
  teamPlayers,
  opponentPlayers,
  insertAfterSequence,
  label,
}: {
  gameId: string;
  inning: number;
  isTopOfInning: boolean;
  teamPlayers: PlayerEntry[];
  opponentPlayers: PlayerEntry[];
  insertAfterSequence?: number;
  label?: string;
}) {
  const [adding, setAdding] = useState(false);

  if (adding) {
    return (
      <AddEventPanel
        gameId={gameId}
        inning={inning}
        isTopOfInning={isTopOfInning}
        teamPlayers={teamPlayers}
        opponentPlayers={opponentPlayers}
        insertAfterSequence={insertAfterSequence}
        onDone={() => setAdding(false)}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setAdding(true)}
      className="mt-1 mb-1 flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-800 font-medium transition-colors"
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
      {label ?? 'Add Play'}
    </button>
  );
}

// ── Add Runner / Between-Pitch Event Panel ─────────────────────────────────
//
// Parallel to AddEventPanel but emits runner and between-pitch events
// (stolen base, pickoff, balk, pitching change, substitution, catcher
// interference, etc.). Rendered via AddRunnerEventButton which gates
// the open/closed state.
function AddRunnerEventPanel({
  gameId,
  inning,
  isTopOfInning,
  teamPlayers,
  opponentPlayers,
  insertAfterSequence,
  onDone,
}: {
  gameId: string;
  inning: number;
  isTopOfInning: boolean;
  teamPlayers: PlayerEntry[];
  opponentPlayers: PlayerEntry[];
  insertAfterSequence?: number;
  onDone: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<'type' | 'runner' | 'reason' | 'error-fielder' | 'in-player' | 'out-player'>('type');
  const [eventType, setEventType] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runnerId, setRunnerId] = useState('');
  const [isOpponentRunner, setIsOpponentRunner] = useState(false);
  const [fromBase, setFromBase] = useState<number>(1);
  const [pickoffOutcome, setPickoffOutcome] = useState<'safe' | 'out'>('out');
  const [advanceReason, setAdvanceReason] = useState<string>('wild_pitch');
  const [errorBy, setErrorBy] = useState<number | null>(null);
  const [scoreRbis, setScoreRbis] = useState<number>(0);
  const [subType, setSubType] = useState<string>('pinch_hitter');
  const [inPlayerId, setInPlayerId] = useState('');
  const [isOpponentInPlayer, setIsOpponentInPlayer] = useState(false);
  const [outPlayerId, setOutPlayerId] = useState('');
  const [isOpponentOutPlayer, setIsOpponentOutPlayer] = useState(false);

  const allPlayers = [
    ...teamPlayers.map((p) => ({ ...p, isOpponent: false })),
    ...opponentPlayers.map((p) => ({ ...p, isOpponent: true })),
  ];

  async function submitEvent(evType: string, payload: Record<string, unknown>) {
    if (isPending) return;
    setIsPending(true);
    setError(null);
    try {
      const finalPayload = insertAfterSequence != null
        ? { ...payload, insertAfterSequence }
        : payload;
      const formData = new FormData();
      formData.set('gameId', gameId);
      formData.set('eventType', evType);
      formData.set('inning', String(inning));
      formData.set('isTopOfInning', String(isTopOfInning));
      formData.set('payload', JSON.stringify(finalPayload));
      const err = await insertCorrectionEventAction(null, formData);
      if (err) { setError(err); return; }
      onDone();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add event.');
    } finally {
      setIsPending(false);
    }
  }

  function buildRunnerIdFields(): Record<string, unknown> {
    const f: Record<string, unknown> = { runnerId };
    if (isOpponentRunner) f.isOpponentRunner = true;
    return f;
  }

  function pickEventType(t: string) {
    setEventType(t);
    setError(null);
    if (t === 'stolen_base' || t === 'caught_stealing' || t === 'baserunner_advance' ||
        t === 'baserunner_out' || t === 'pickoff_attempt') {
      setStep('runner');
    } else if (t === 'substitution') {
      setStep('in-player');
    } else if (t === 'pitching_change') {
      setStep('in-player');
    } else if (t === 'score') {
      setStep('runner');
    } else if (t === 'balk') {
      // Balk has no required inputs beyond inning; emit immediately.
      submitEvent('balk', {});
    } else if (t === 'catcher_interference') {
      setStep('in-player');
    }
  }

  function pickRunner(playerId: string, opponent: boolean) {
    setRunnerId(playerId);
    setIsOpponentRunner(opponent);
    if (eventType === 'baserunner_advance') {
      setStep('reason');
    } else {
      // For steal/CS/pickoff/baserunner_out/score — ready to submit after base pick
      setStep('reason'); // reuses the reason step UI to show the base picker + submit
    }
  }

  function submitRunnerEvent() {
    const t = eventType!;
    const toBase = fromBase + 1;
    if (t === 'stolen_base' || t === 'caught_stealing') {
      submitEvent(t, { ...buildRunnerIdFields(), fromBase, toBase });
    } else if (t === 'baserunner_out') {
      submitEvent(t, { ...buildRunnerIdFields(), fromBase });
    } else if (t === 'pickoff_attempt') {
      submitEvent(t, { ...buildRunnerIdFields(), base: fromBase, outcome: pickoffOutcome });
    } else if (t === 'baserunner_advance') {
      const payload: Record<string, unknown> = { ...buildRunnerIdFields(), fromBase, toBase, reason: advanceReason };
      if ((advanceReason === 'error' || advanceReason === 'overthrow') && errorBy !== null) {
        payload.errorBy = errorBy;
      }
      submitEvent(t, payload);
    } else if (t === 'score') {
      submitEvent(t, {
        scoringPlayerId: runnerId,
        ...(isOpponentRunner ? { isOpponentScore: true } : {}),
        rbis: scoreRbis,
      });
    }
  }

  function submitInOutSubstitution() {
    const t = eventType!;
    if (t === 'pitching_change') {
      submitEvent('pitching_change', {
        newPitcherId: inPlayerId,
        ...(isOpponentInPlayer ? { isOpponentChange: true } : {}),
      });
    } else if (t === 'catcher_interference') {
      // CI is a PA-level event; in-player is the batter, pitcher optional.
      submitEvent('catcher_interference', {
        ...(isOpponentInPlayer ? { opponentBatterId: inPlayerId } : { batterId: inPlayerId }),
      });
    } else if (t === 'substitution') {
      const payload: Record<string, unknown> = {
        inPlayerId,
        substitutionType: subType,
      };
      if (outPlayerId) payload.outPlayerId = outPlayerId;
      if (isOpponentInPlayer || isOpponentOutPlayer) payload.isOpponentSubstitution = true;
      submitEvent('substitution', payload);
    }
  }

  // ── Render ──

  if (step === 'type') {
    return (
      <div className="mt-2 p-3 bg-white rounded-lg border border-brand-200 shadow-sm space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Add runner / between-pitch event</p>
        <div>
          <p className="text-xs text-gray-500 mb-1">Baserunning</p>
          <div className="grid grid-cols-3 gap-2">
            {([
              { label: 'Stolen Base', value: 'stolen_base' },
              { label: 'Caught Stealing', value: 'caught_stealing' },
              { label: 'Advance', value: 'baserunner_advance' },
              { label: 'Pickoff', value: 'pickoff_attempt' },
              { label: 'Runner Out', value: 'baserunner_out' },
              { label: 'Score', value: 'score' },
            ] as const).map(({ label, value }) => (
              <button key={value} type="button" disabled={isPending}
                onClick={() => pickEventType(value)}
                className="py-2 text-sm font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >{label}</button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">Pitcher / battery</p>
          <div className="grid grid-cols-3 gap-2">
            {([
              { label: 'Balk', value: 'balk' },
              { label: 'Pitching Change', value: 'pitching_change' },
              { label: 'Catcher Interf.', value: 'catcher_interference' },
            ] as const).map(({ label, value }) => (
              <button key={value} type="button" disabled={isPending}
                onClick={() => pickEventType(value)}
                className="py-2 text-sm font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >{label}</button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">Lineup</p>
          <div className="grid grid-cols-1 gap-2">
            <button type="button" disabled={isPending}
              onClick={() => pickEventType('substitution')}
              className="py-2 text-sm font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors"
            >Substitution (pinch / defensive)</button>
          </div>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button type="button" onClick={onDone} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
      </div>
    );
  }

  // Shared player picker for runner / score / CI / pitching change / substitution (in & out).
  if (step === 'runner' || step === 'in-player' || step === 'out-player') {
    const who =
      step === 'runner' ? 'runner'
      : step === 'out-player' ? 'player coming out'
      : eventType === 'pitching_change' ? 'incoming pitcher'
      : eventType === 'catcher_interference' ? 'batter'
      : eventType === 'score' ? 'scoring player'
      : 'incoming player';
    const onPick = (pid: string, opp: boolean) => {
      if (step === 'runner') {
        pickRunner(pid, opp);
      } else if (step === 'in-player') {
        setInPlayerId(pid);
        setIsOpponentInPlayer(opp);
        if (eventType === 'substitution') {
          setStep('out-player');
        } else {
          submitEvent(
            eventType === 'pitching_change' ? 'pitching_change' :
            eventType === 'catcher_interference' ? 'catcher_interference' :
            eventType!,
            eventType === 'pitching_change'
              ? { newPitcherId: pid, ...(opp ? { isOpponentChange: true } : {}) }
              : eventType === 'catcher_interference'
                ? { ...(opp ? { opponentBatterId: pid } : { batterId: pid }) }
                : {},
          );
        }
      } else if (step === 'out-player') {
        setOutPlayerId(pid);
        setIsOpponentOutPlayer(opp);
        // Move on to the sub-type picker
        setStep('reason');
      }
    };
    return (
      <div className="mt-2 p-3 bg-white rounded-lg border border-brand-200 shadow-sm space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pick {who}</p>
        <div className="max-h-48 overflow-y-auto space-y-1">
          {allPlayers.map((p) => (
            <button key={`${p.isOpponent ? 'opp' : 'us'}-${p.id}`} type="button"
              onClick={() => onPick(p.id, p.isOpponent)}
              disabled={isPending}
              className="w-full text-left py-1.5 px-2 rounded-md text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors"
            >
              <span className={p.isOpponent ? 'text-orange-600' : 'text-brand-600'}>
                {p.isOpponent ? 'Opp ' : 'Us '}
              </span>
              {p.name}
            </button>
          ))}
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button type="button" onClick={() => setStep('type')} className="text-xs text-gray-400 hover:text-gray-600">← Back</button>
      </div>
    );
  }

  // Step 'reason' is shared between runner-event submit (base + reason/outcome)
  // and the substitution type picker (for substitution flow).
  if (step === 'reason') {
    const isSubFlow = eventType === 'substitution';
    if (isSubFlow) {
      return (
        <div className="mt-2 p-3 bg-white rounded-lg border border-brand-200 shadow-sm space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Substitution type</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: 'pinch_hitter', label: 'Pinch Hitter' },
              { value: 'pinch_runner', label: 'Pinch Runner' },
              { value: 'defensive', label: 'Defensive' },
              { value: 'position_change', label: 'Position Change' },
            ].map(({ value, label }) => (
              <button key={value} type="button" disabled={isPending}
                onClick={() => setSubType(value)}
                className={`py-2 text-sm font-medium rounded-lg border transition-colors ${
                  subType === value
                    ? 'border-brand-500 bg-brand-50 text-brand-800'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >{label}</button>
            ))}
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setStep('out-player')} className="text-xs text-gray-400 hover:text-gray-600">← Back</button>
            <div className="ml-auto">
              <button type="button" disabled={isPending} onClick={submitInOutSubstitution}
                className="px-4 py-1.5 text-sm font-semibold rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40 transition-colors"
              >Save</button>
            </div>
          </div>
        </div>
      );
    }
    // Runner-event: ask for base + any type-specific params
    return (
      <div className="mt-2 p-3 bg-white rounded-lg border border-brand-200 shadow-sm space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          {eventType?.replace(/_/g, ' ')}
        </p>
        {eventType !== 'score' && (
          <BasePicker
            label={
              eventType === 'pickoff_attempt' ? 'Picked off at'
              : eventType === 'baserunner_out' ? 'Out at'
              : 'From base'
            }
            value={fromBase}
            onChange={setFromBase}
          />
        )}

        {eventType === 'baserunner_advance' && (
          <>
            <div>
              <p className="text-xs text-gray-500 mb-1">Reason</p>
              <div className="grid grid-cols-4 gap-1.5">
                {ADVANCE_REASONS.map(({ label, value }) => (
                  <button key={value} type="button" disabled={isPending}
                    onClick={() => setAdvanceReason(value)}
                    className={`py-1.5 text-xs font-medium rounded-md border transition-colors ${
                      advanceReason === value
                        ? 'border-brand-500 bg-brand-50 text-brand-800'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >{label}</button>
                ))}
              </div>
            </div>
            {(advanceReason === 'error' || advanceReason === 'overthrow') && (
              <div>
                <p className="text-xs text-gray-500 mb-1">Charged to fielder</p>
                <div className="grid grid-cols-9 gap-1.5">
                  {POSITIONS.map(({ positionNumber, label }) => (
                    <button key={positionNumber} type="button" disabled={isPending}
                      onClick={() => setErrorBy(positionNumber)}
                      className={`py-1 text-xs font-medium rounded-md border transition-colors ${
                        errorBy === positionNumber
                          ? 'border-red-500 bg-red-50 text-red-800'
                          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >{label}</button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {eventType === 'pickoff_attempt' && (
          <div>
            <p className="text-xs text-gray-500 mb-1">Outcome</p>
            <div className="grid grid-cols-2 gap-2">
              {(['safe', 'out'] as const).map((o) => (
                <button key={o} type="button" disabled={isPending}
                  onClick={() => setPickoffOutcome(o)}
                  className={`py-2 text-sm font-medium rounded-md border transition-colors ${
                    pickoffOutcome === o
                      ? 'border-brand-500 bg-brand-50 text-brand-800'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >{o === 'out' ? 'Out' : 'Safe'}</button>
              ))}
            </div>
          </div>
        )}

        {eventType === 'score' && (
          <div>
            <p className="text-xs text-gray-500 mb-1">RBI credit</p>
            <div className="grid grid-cols-5 gap-2">
              {[0, 1, 2, 3, 4].map((n) => (
                <button key={n} type="button" disabled={isPending}
                  onClick={() => setScoreRbis(n)}
                  className={`py-2 text-sm font-medium rounded-md border transition-colors ${
                    scoreRbis === n
                      ? 'border-brand-500 bg-brand-50 text-brand-800'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >{n}</button>
              ))}
            </div>
          </div>
        )}

        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setStep('runner')} className="text-xs text-gray-400 hover:text-gray-600">← Back</button>
          <div className="ml-auto">
            <button type="button" disabled={isPending} onClick={submitRunnerEvent}
              className="px-4 py-1.5 text-sm font-semibold rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40 transition-colors"
            >Save</button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

function AddRunnerEventButton({
  gameId,
  inning,
  isTopOfInning,
  teamPlayers,
  opponentPlayers,
  insertAfterSequence,
  label,
}: {
  gameId: string;
  inning: number;
  isTopOfInning: boolean;
  teamPlayers: PlayerEntry[];
  opponentPlayers: PlayerEntry[];
  insertAfterSequence?: number;
  label?: string;
}) {
  const [adding, setAdding] = useState(false);
  if (adding) {
    return (
      <AddRunnerEventPanel
        gameId={gameId}
        inning={inning}
        isTopOfInning={isTopOfInning}
        teamPlayers={teamPlayers}
        opponentPlayers={opponentPlayers}
        insertAfterSequence={insertAfterSequence}
        onDone={() => setAdding(false)}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setAdding(true)}
      className="mt-1 mb-1 flex items-center gap-1.5 text-xs text-sky-600 hover:text-sky-800 font-medium transition-colors"
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
      {label ?? 'Add Runner Event'}
    </button>
  );
}

// ── Add Pitch Button (within an at-bat) ───────────────────────────────────

function AddPitchButton({
  gameId,
  inning,
  isTopOfInning,
  insertAfterSequence,
  batterId,
  pitcherId,
  isOpponentBatter,
  isOpponentPitcher,
}: {
  gameId: string;
  inning: number;
  isTopOfInning: boolean;
  insertAfterSequence: number;
  batterId: string;
  pitcherId: string;
  isOpponentBatter: boolean;
  isOpponentPitcher: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState<'closed' | 'pitch' | 'in-play-result' | 'trajectory' | 'fielding' | 'error-fielder'>('closed');
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingResult, setPendingResult] = useState<string | null>(null);
  const [trajectory, setTrajectory] = useState<string | null>(null);
  const [fieldingSeq, setFieldingSeq] = useState<number[]>([]);

  function buildBatterPitcher(): Record<string, unknown> {
    const bp: Record<string, unknown> = {};
    if (isOpponentBatter) bp.opponentBatterId = batterId;
    else if (batterId) bp.batterId = batterId;
    if (isOpponentPitcher) bp.opponentPitcherId = pitcherId;
    else if (pitcherId) bp.pitcherId = pitcherId;
    return bp;
  }

  async function insertPitch(outcome: string) {
    if (isPending) return;
    setIsPending(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = { ...buildBatterPitcher(), outcome, insertAfterSequence };
      const formData = new FormData();
      formData.set('gameId', gameId);
      formData.set('eventType', 'pitch_thrown');
      formData.set('inning', String(inning));
      formData.set('isTopOfInning', String(isTopOfInning));
      formData.set('payload', JSON.stringify(payload));
      const err = await insertCorrectionEventAction(null, formData);
      if (err) { setError(err); return; }
      setStep('closed');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add pitch.');
    } finally {
      setIsPending(false);
    }
  }

  async function insertInPlayResult(eventType: string, resultPayload: Record<string, unknown>) {
    if (isPending) return;
    setIsPending(true);
    setError(null);
    try {
      const bp = buildBatterPitcher();

      // Walk, Strikeout, and Sac Fly/Bunt don't get an in-play pitch — insert the result directly
      const noInPlayPitch = ['walk', 'strikeout', 'sacrifice_fly', 'sacrifice_bunt'].includes(eventType);

      if (noInPlayPitch) {
        const formData = new FormData();
        formData.set('gameId', gameId);
        formData.set('eventType', eventType);
        formData.set('inning', String(inning));
        formData.set('isTopOfInning', String(isTopOfInning));
        formData.set('payload', JSON.stringify({ ...bp, ...resultPayload, insertAfterSequence }));
        const err = await insertCorrectionEventAction(null, formData);
        if (err) { setError(err); return; }
      } else {
        // Atomic batch: insert pitch_thrown (in_play) + result together
        const events = [
          {
            eventType: 'pitch_thrown',
            inning,
            isTopOfInning,
            payload: { ...bp, outcome: 'in_play', insertAfterSequence },
          },
          {
            eventType,
            inning,
            isTopOfInning,
            payload: { ...bp, ...resultPayload, insertAfterSequence },
          },
        ];
        const formData = new FormData();
        formData.set('gameId', gameId);
        formData.set('events', JSON.stringify(events));
        const err = await insertCorrectionEventsBatchAction(null, formData);
        if (err) { setError(err); return; }
      }

      setStep('closed');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add in-play result.');
    } finally {
      setIsPending(false);
    }
  }

  function handleHitResult(hitType: string, selectedTrajectory?: string) {
    insertInPlayResult('hit', { hitType, trajectory: selectedTrajectory ?? trajectory ?? undefined });
  }

  function handleOutResult(eventType: string) {
    const outType = TRAJECTORY_TO_OUT_TYPE[trajectory ?? ''] ?? 'groundout';
    insertInPlayResult(eventType, {
      outType,
      trajectory: trajectory ?? undefined,
      fieldingSequence: fieldingSeq.length > 0 ? fieldingSeq : undefined,
    });
  }

  function handleErrorWithFielder(errorBy: number) {
    insertInPlayResult('field_error', { errorBy, trajectory: trajectory ?? undefined });
  }

  function handleDirectInPlayResult(eventType: string, extra: Record<string, unknown> = {}) {
    insertInPlayResult(eventType, extra);
  }

  if (step === 'closed') {
    return (
      <button
        type="button"
        onClick={() => setStep('pitch')}
        className="group flex items-center gap-1 py-0.5 text-[11px] text-gray-300 hover:text-brand-600 transition-colors"
        aria-label="Insert pitch"
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        <span className="opacity-0 group-hover:opacity-100 transition-opacity">pitch</span>
      </button>
    );
  }

  // ── In Play sub-step: error fielder ──
  if (step === 'error-fielder') {
    return (
      <div className="my-1 p-2 bg-white rounded-lg border border-brand-200 shadow-sm space-y-2">
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Who made the error?</p>
        <div className="grid grid-cols-3 gap-1.5">
          {POSITIONS.map(({ positionNumber, label }) => (
            <button key={positionNumber} type="button" disabled={isPending} onClick={() => handleErrorWithFielder(positionNumber)}
              className="py-1.5 text-xs font-medium rounded-md border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-40 transition-colors"
            >{label}</button>
          ))}
        </div>
        {error && <p className="text-[11px] text-red-600">{error}</p>}
        <button type="button" onClick={() => setStep('trajectory')} className="text-[11px] text-gray-400 hover:text-gray-600">← Back</button>
      </div>
    );
  }

  // ── In Play sub-step: fielding order ──
  if (step === 'fielding') {
    const eventType = pendingResult === 'double_play' ? 'double_play' : pendingResult === 'triple_play' ? 'triple_play' : 'out';
    const buttonLabel = pendingResult === 'double_play' ? 'DP' : pendingResult === 'triple_play' ? 'TP' : pendingResult === 'field_choice' ? 'FC' : 'Out';
    return (
      <div className="my-1 p-2 bg-white rounded-lg border border-brand-200 shadow-sm space-y-2">
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Fielding play order</p>
        {fieldingSeq.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-gray-900 tracking-wider">
              {fieldingSeq.map((num) => POSITIONS.find((p) => p.positionNumber === num)?.label ?? String(num)).join('-')}
            </span>
            <button type="button" onClick={() => setFieldingSeq((s) => s.slice(0, -1))} className="text-[11px] text-gray-400 hover:text-gray-600 underline">Undo</button>
          </div>
        )}
        <div className="grid grid-cols-3 gap-1.5">
          {POSITIONS.map(({ positionNumber, label }) => (
            <button key={positionNumber} type="button" disabled={fieldingSeq.length >= 8} onClick={() => setFieldingSeq((s) => [...s, positionNumber])}
              className="py-1.5 text-xs font-medium rounded-md border border-gray-300 bg-gray-50 hover:bg-gray-100 disabled:opacity-40 transition-colors"
            >{positionNumber} — {label}</button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" disabled={isPending} onClick={() => handleOutResult(eventType)}
            className="flex-1 py-1.5 text-xs font-semibold rounded-md bg-brand-700 text-white hover:bg-brand-800 disabled:opacity-40 transition-colors"
          >Record {buttonLabel}</button>
          <button type="button" onClick={() => handleOutResult(eventType)} className="text-[11px] text-gray-400 hover:text-gray-600 underline">Skip</button>
        </div>
        {error && <p className="text-[11px] text-red-600">{error}</p>}
        <button type="button" onClick={() => { setStep('trajectory'); setFieldingSeq([]); }} className="text-[11px] text-gray-400 hover:text-gray-600">← Back</button>
      </div>
    );
  }

  // ── In Play sub-step: trajectory ──
  if (step === 'trajectory' && pendingResult) {
    return (
      <div className="my-1 p-2 bg-white rounded-lg border border-brand-200 shadow-sm space-y-2">
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">How was it hit?</p>
        <div className="grid grid-cols-3 gap-1.5">
          {[
            { label: 'Ground Ball', value: 'ground_ball' },
            { label: 'Line Drive', value: 'line_drive' },
            { label: 'Fly Ball', value: 'fly_ball' },
          ].map(({ label, value }) => (
            <button key={value} type="button" disabled={isPending}
              onClick={() => {
                setTrajectory(value);
                if (pendingResult === 'error') setStep('error-fielder');
                else if (['out', 'double_play', 'triple_play', 'field_choice'].includes(pendingResult)) setStep('fielding');
                else handleHitResult(pendingResult, value);
              }}
              className="py-1.5 text-xs font-medium rounded-md border border-gray-300 bg-gray-50 hover:bg-gray-100 disabled:opacity-40 transition-colors"
            >{label}</button>
          ))}
        </div>
        {error && <p className="text-[11px] text-red-600">{error}</p>}
        <button type="button" onClick={() => { setStep('in-play-result'); setPendingResult(null); }} className="text-[11px] text-gray-400 hover:text-gray-600">← Back</button>
      </div>
    );
  }

  // ── In Play sub-step: result picker ──
  if (step === 'in-play-result') {
    return (
      <div className="my-1 p-2 bg-white rounded-lg border border-brand-200 shadow-sm space-y-2">
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">In play — what happened?</p>
        <div className="grid grid-cols-4 gap-1.5">
          {([
            { label: 'Single', value: 'single' },
            { label: 'Double', value: 'double' },
            { label: 'Triple', value: 'triple' },
            { label: 'HR', value: 'home_run' },
          ] as const).map(({ label, value }) => (
            <button key={value} type="button" disabled={isPending}
              onClick={() => { setPendingResult(value); setStep('trajectory'); }}
              className="py-1.5 text-xs font-medium rounded-md border border-gray-300 bg-gray-50 hover:bg-gray-100 disabled:opacity-40 transition-colors"
            >{label}</button>
          ))}
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {([
            { label: 'Out', value: 'out' },
            { label: 'DP', value: 'double_play' },
            { label: 'TP', value: 'triple_play' },
            { label: 'FC', value: 'field_choice' },
          ] as const).map(({ label, value }) => (
            <button key={value} type="button" disabled={isPending}
              onClick={() => { setPendingResult(value); setStep('trajectory'); }}
              className="py-1.5 text-xs font-medium rounded-md border border-gray-300 bg-gray-50 hover:bg-gray-100 disabled:opacity-40 transition-colors"
            >{label}</button>
          ))}
        </div>
        <button type="button" disabled={isPending}
          onClick={() => { setPendingResult('error'); setStep('trajectory'); }}
          className="w-full py-1.5 text-xs font-medium rounded-md border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-40 transition-colors"
        >Error</button>
        <div className="grid grid-cols-3 gap-1.5">
          {([
            { label: 'Walk', eventType: 'walk' },
            { label: 'Strikeout', eventType: 'strikeout' },
            { label: 'Sac Fly', eventType: 'sacrifice_fly' },
          ] as const).map(({ label, eventType }) => (
            <button key={eventType} type="button" disabled={isPending}
              onClick={() => handleDirectInPlayResult(eventType)}
              className="py-1.5 text-xs font-medium rounded-md border border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100 disabled:opacity-40 transition-colors"
            >{label}</button>
          ))}
        </div>
        {error && <p className="text-[11px] text-red-600">{error}</p>}
        <button type="button" onClick={() => setStep('pitch')} className="text-[11px] text-gray-400 hover:text-gray-600">← Back to pitch</button>
      </div>
    );
  }

  // ── Main: pitch outcome picker ──
  return (
    <div className="my-1 p-2 bg-white rounded-lg border border-brand-200 shadow-sm space-y-2">
      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Add pitch</p>
      <div className="grid grid-cols-3 gap-1.5">
        {[
          { label: 'Ball', outcome: 'ball' },
          { label: 'Called K', outcome: 'called_strike' },
          { label: 'Swing K', outcome: 'swinging_strike' },
        ].map(({ label, outcome }) => (
          <button key={outcome} type="button" disabled={isPending} onClick={() => insertPitch(outcome)}
            className="py-1.5 text-xs font-medium rounded-md border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >{label}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {[
          { label: 'Foul', outcome: 'foul' },
          { label: 'Foul Tip', outcome: 'foul_tip' },
        ].map(({ label, outcome }) => (
          <button key={outcome} type="button" disabled={isPending} onClick={() => insertPitch(outcome)}
            className="py-1.5 text-xs font-medium rounded-md border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >{label}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <button type="button" disabled={isPending} onClick={() => insertPitch('hit_by_pitch')}
          className="py-1.5 text-xs font-medium rounded-md border border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100 disabled:opacity-40 transition-colors"
        >HBP</button>
        <button type="button" disabled={isPending} onClick={() => setStep('in-play-result')}
          className="py-1.5 text-xs font-medium rounded-md border border-brand-300 bg-brand-50 text-brand-700 hover:bg-brand-100 disabled:opacity-40 transition-colors"
        >In Play →</button>
      </div>
      {error && <p className="text-[11px] text-red-600">{error}</p>}
      <button type="button" onClick={() => setStep('closed')} className="text-[11px] text-gray-400 hover:text-gray-600">Cancel</button>
    </div>
  );
}

/** Get the last sequence number from a half-inning item (at-bat or interstitial). */
function getItemLastSequence(item: AtBatNode | InterstitialNode): number {
  if (item.type === 'interstitial') return item.event.sequenceNumber;
  // For at-bats, find the highest sequence among pitches, mid-at-bat events, and result
  let max = 0;
  for (const p of item.pitches) {
    if (p.event.sequenceNumber > max) max = p.event.sequenceNumber;
  }
  for (const m of item.midAtBatEvents) {
    if (m.event.sequenceNumber > max) max = m.event.sequenceNumber;
  }
  if (item.result && item.result.event.sequenceNumber > max) {
    max = item.result.event.sequenceNumber;
  }
  return max;
}

// ── Interstitial Event Row ──────────────────────────────────────────────────

function InterstitialRow({ node, isCoach, gameId }: { node: InterstitialNode; isCoach?: boolean; gameId?: string }) {
  return (
    <div className="py-1.5 px-3">
      <div className="flex items-center gap-2 text-sm italic">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
          node.category === 'info' ? 'bg-blue-400' : node.category === 'positive' ? 'bg-green-400' : node.category === 'negative' ? 'bg-red-400' : 'bg-gray-400'
        }`} />
        <span className={CATEGORY_TEXT[node.category]}>{node.label}</span>
        {isCoach && gameId && (
          <EditEventButton event={node.event} gameId={gameId} />
        )}
      </div>
    </div>
  );
}

// ── Mid-At-Bat Event Row ────────────────────────────────────────────────────

function MidAtBatRow({ node, isCoach, gameId }: { node: HistoryEventNode; isCoach?: boolean; gameId?: string }) {
  return (
    <div className="py-1">
      <div className="flex items-center gap-2 text-xs italic">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
          node.category === 'positive' ? 'bg-green-400' : node.category === 'negative' ? 'bg-red-400' : node.category === 'info' ? 'bg-blue-400' : 'bg-gray-400'
        }`} />
        <span className={CATEGORY_TEXT[node.category]}>{node.label}</span>
        {isCoach && gameId && (
          <EditEventButton event={node.event} gameId={gameId} />
        )}
      </div>
    </div>
  );
}

// ── Pitch Row ───────────────────────────────────────────────────────────────

function PitchRow({ pitch, isCoach, gameId }: { pitch: PitchNode; isCoach?: boolean; gameId?: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDelete() {
    if (deleting) return;
    if (!confirm('Delete this pitch?')) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const formData = new FormData();
      formData.set('gameId', gameId!);
      formData.set('eventId', pitch.event.id);
      const err = await voidEventAction(null, formData);
      if (err) { setDeleteError(err); return; }
      router.refresh();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Failed to delete pitch.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="py-1">
      <div className="flex items-center gap-2 text-sm text-gray-700">
        <span className="w-1.5 h-1.5 rounded-full bg-gray-300 shrink-0" />
        <span>{pitch.label}</span>
        {isCoach && gameId && (
          <>
            <EditEventButton event={pitch.event} gameId={gameId} />
            <button
              type="button"
              disabled={deleting}
              onClick={handleDelete}
              className="shrink-0 p-0.5 text-gray-300 hover:text-red-500 disabled:opacity-50 transition-colors"
              aria-label="Delete pitch"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </>
        )}
      </div>
      {deleteError && <p className="text-xs text-red-600 ml-4">{deleteError}</p>}
    </div>
  );
}

// ── Replay At-Bat Panel ────────────────────────────────────────────────────

function computeCount(pitches: Array<{ outcome: string }>): { balls: number; strikes: number } {
  let balls = 0;
  let strikes = 0;
  for (const p of pitches) {
    if (p.outcome === 'ball' || p.outcome === 'intentional_ball') {
      balls++;
    } else if (p.outcome === 'called_strike' || p.outcome === 'swinging_strike' || p.outcome === 'foul_tip') {
      if (strikes < 2) strikes++;
    } else if (p.outcome === 'foul') {
      if (strikes < 2) strikes++;
    }
  }
  return { balls, strikes };
}

const REPLAY_PITCH_OUTCOMES = [
  { label: 'Ball', outcome: 'ball', style: 'border-green-300 bg-green-50 text-green-700 hover:bg-green-100' },
  { label: 'Called K', outcome: 'called_strike', style: 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100' },
  { label: 'Swing K', outcome: 'swinging_strike', style: 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100' },
  { label: 'Foul', outcome: 'foul', style: 'border-yellow-300 bg-yellow-50 text-yellow-700 hover:bg-yellow-100' },
  { label: 'Foul Tip', outcome: 'foul_tip', style: 'border-yellow-300 bg-yellow-50 text-yellow-700 hover:bg-yellow-100' },
  { label: 'HBP', outcome: 'hit_by_pitch', style: 'border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100' },
  { label: 'In Play', outcome: 'in_play', style: 'border-brand-300 bg-brand-50 text-brand-700 hover:bg-brand-100' },
];

const PITCH_OUTCOME_LABELS: Record<string, string> = {
  ball: 'Ball', called_strike: 'Called K', swinging_strike: 'Swing K',
  foul: 'Foul', foul_tip: 'Foul Tip', hit_by_pitch: 'HBP', in_play: 'In Play',
};

function ReplayAtBatPanel({
  gameId,
  atBat,
  inning,
  isTopOfInning,
  precedingSequence,
  onDone,
}: {
  gameId: string;
  atBat: AtBatNode;
  inning: number;
  isTopOfInning: boolean;
  precedingSequence: number;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pitches, setPitches] = useState<Array<{ outcome: string }>>([]);
  const [resultStep, setResultStep] = useState<'pitches' | 'type' | 'trajectory' | 'fielding' | 'error-fielder'>('pitches');
  const [pendingResult, setPendingResult] = useState<string | null>(null);
  const [trajectory, setTrajectory] = useState<string | null>(null);
  const [fieldingSeq, setFieldingSeq] = useState<number[]>([]);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Derive opponent flags from at-bat
  const firstPayload = (atBat.pitches[0]?.event.payload ?? atBat.result?.event.payload) as Record<string, unknown> | undefined;
  const isOpponentBatter = !!firstPayload?.opponentBatterId;
  const isOpponentPitcher = !!firstPayload?.opponentPitcherId;

  function buildBatterPitcher(): Record<string, unknown> {
    const ids: Record<string, unknown> = {};
    if (isOpponentBatter) ids.opponentBatterId = atBat.batterId;
    else if (atBat.batterId) ids.batterId = atBat.batterId;
    if (isOpponentPitcher) ids.opponentPitcherId = atBat.pitcherId;
    else if (atBat.pitcherId) ids.pitcherId = atBat.pitcherId;
    return ids;
  }

  // Collect all event IDs from the current at-bat
  function getVoidEventIds(): string[] {
    const ids: string[] = [];
    for (const p of atBat.pitches) ids.push(p.event.id);
    for (const m of atBat.midAtBatEvents) ids.push(m.event.id);
    if (atBat.result) ids.push(atBat.result.event.id);
    return ids;
  }

  async function submitReplay(resultEventType: string, resultPayload: Record<string, unknown>) {
    if (isPending) return;
    setIsPending(true);
    setError(null);
    try {
      const bp = buildBatterPitcher();
      const newEvents = [
        ...pitches.map((p) => ({
          eventType: 'pitch_thrown',
          payload: { ...bp, outcome: p.outcome },
        })),
        { eventType: resultEventType, payload: { ...bp, ...resultPayload } },
      ];

      const formData = new FormData();
      formData.set('gameId', gameId);
      formData.set('voidEventIds', JSON.stringify(getVoidEventIds()));
      formData.set('newEvents', JSON.stringify(newEvents));
      formData.set('inning', String(inning));
      formData.set('isTopOfInning', String(isTopOfInning));
      formData.set('insertAfterSequence', String(precedingSequence));
      const err = await replayAtBatAction(null, formData);
      if (err) { setError(err); return; }
      onDone();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to replay at-bat.');
    } finally {
      setIsPending(false);
    }
  }

  function handleDirectResult(eventType: string, extra: Record<string, unknown> = {}) {
    submitReplay(eventType, extra);
  }

  function handleHitResult(hitType: string, selectedTrajectory?: string) {
    submitReplay('hit', { hitType, trajectory: selectedTrajectory ?? trajectory ?? undefined });
  }

  function handleOutResult(eventType: string) {
    const outType = TRAJECTORY_TO_OUT_TYPE[trajectory ?? ''] ?? 'groundout';
    submitReplay(eventType, {
      outType,
      trajectory: trajectory ?? undefined,
      fieldingSequence: fieldingSeq.length > 0 ? fieldingSeq : undefined,
    });
  }

  function handleErrorWithFielder(errorBy: number) {
    submitReplay('field_error', { errorBy, trajectory: trajectory ?? undefined });
  }

  const { balls, strikes } = computeCount(pitches);

  // ── Sub-step: error fielder ──
  if (resultStep === 'error-fielder') {
    return (
      <div className="mt-2 p-4 bg-white rounded-xl border border-brand-200 shadow-sm space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Who made the error?</p>
        <div className="grid grid-cols-3 gap-2">
          {POSITIONS.map(({ positionNumber, label }) => (
            <button key={positionNumber} type="button" disabled={isPending} onClick={() => handleErrorWithFielder(positionNumber)}
              className="py-2 text-sm font-medium rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-40 transition-colors"
            >{label}</button>
          ))}
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button type="button" onClick={() => setResultStep('trajectory')} className="text-xs text-gray-400 hover:text-gray-600">← Back</button>
      </div>
    );
  }

  // ── Sub-step: fielding order ──
  if (resultStep === 'fielding') {
    const eventType = pendingResult === 'double_play' ? 'double_play' : pendingResult === 'triple_play' ? 'triple_play' : 'out';
    const buttonLabel = pendingResult === 'double_play' ? 'DP' : pendingResult === 'triple_play' ? 'TP' : pendingResult === 'field_choice' ? 'FC' : 'Out';
    return (
      <div className="mt-2 p-4 bg-white rounded-xl border border-brand-200 shadow-sm space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Fielding play order</p>
        {fieldingSeq.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-gray-900 tracking-wider">
              {fieldingSeq.map((num) => POSITIONS.find((p) => p.positionNumber === num)?.label ?? String(num)).join('-')}
            </span>
            <button type="button" onClick={() => setFieldingSeq((s) => s.slice(0, -1))} className="text-xs text-gray-400 hover:text-gray-600 underline">Undo</button>
          </div>
        )}
        <div className="grid grid-cols-3 gap-2">
          {POSITIONS.map(({ positionNumber, label }) => (
            <button key={positionNumber} type="button" disabled={fieldingSeq.length >= 8} onClick={() => setFieldingSeq((s) => [...s, positionNumber])}
              className="py-2 text-sm font-medium rounded-lg border border-gray-300 bg-gray-50 hover:bg-gray-100 disabled:opacity-40 transition-colors"
            >{positionNumber} — {label}</button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <button type="button" disabled={isPending} onClick={() => handleOutResult(eventType)}
            className="flex-1 py-2 text-sm font-semibold rounded-lg bg-brand-700 text-white hover:bg-brand-800 disabled:opacity-40 transition-colors"
          >Save {buttonLabel}</button>
          <button type="button" onClick={() => handleOutResult(eventType)} className="text-xs text-gray-400 hover:text-gray-600 underline">Skip</button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button type="button" onClick={() => { setResultStep('trajectory'); setFieldingSeq([]); }} className="text-xs text-gray-400 hover:text-gray-600">← Back</button>
      </div>
    );
  }

  // ── Sub-step: trajectory ──
  if (resultStep === 'trajectory' && pendingResult) {
    return (
      <div className="mt-2 p-4 bg-white rounded-xl border border-brand-200 shadow-sm space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">How was it hit?</p>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Ground Ball', value: 'ground_ball' },
            { label: 'Line Drive', value: 'line_drive' },
            { label: 'Fly Ball', value: 'fly_ball' },
          ].map(({ label, value }) => (
            <button key={value} type="button" disabled={isPending}
              onClick={() => {
                setTrajectory(value);
                if (pendingResult === 'error') setResultStep('error-fielder');
                else if (['out', 'double_play', 'triple_play', 'field_choice'].includes(pendingResult)) setResultStep('fielding');
                else handleHitResult(pendingResult, value);
              }}
              className="py-2 text-sm font-medium rounded-lg border border-gray-300 bg-gray-50 hover:bg-gray-100 disabled:opacity-40 transition-colors"
            >{label}</button>
          ))}
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button type="button" onClick={() => { setResultStep('type'); setPendingResult(null); }} className="text-xs text-gray-400 hover:text-gray-600">← Back</button>
      </div>
    );
  }

  // ── Sub-step: result type picker ──
  if (resultStep === 'type') {
    return (
      <div className="mt-2 p-4 bg-white rounded-xl border border-brand-200 shadow-sm space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Result — what happened?</p>
        <div className="grid grid-cols-4 gap-2">
          {([
            { label: 'Single', value: 'single' },
            { label: 'Double', value: 'double' },
            { label: 'Triple', value: 'triple' },
            { label: 'HR', value: 'home_run' },
          ] as const).map(({ label, value }) => (
            <button key={value} type="button" disabled={isPending}
              onClick={() => { setPendingResult(value); setResultStep('trajectory'); }}
              className="py-2 text-sm font-medium rounded-lg border border-gray-300 bg-gray-50 hover:bg-gray-100 disabled:opacity-40 transition-colors"
            >{label}</button>
          ))}
        </div>
        <div className="grid grid-cols-4 gap-2">
          {([
            { label: 'Out', value: 'out' },
            { label: 'DP', value: 'double_play' },
            { label: 'TP', value: 'triple_play' },
            { label: 'FC', value: 'field_choice' },
          ] as const).map(({ label, value }) => (
            <button key={value} type="button" disabled={isPending}
              onClick={() => { setPendingResult(value); setResultStep('trajectory'); }}
              className="py-2 text-sm font-medium rounded-lg border border-gray-300 bg-gray-50 hover:bg-gray-100 disabled:opacity-40 transition-colors"
            >{label}</button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-2">
          <button type="button" disabled={isPending}
            onClick={() => { setPendingResult('error'); setResultStep('trajectory'); }}
            className="py-2 text-sm font-medium rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-40 transition-colors"
          >Error</button>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {([
            { label: 'Walk', eventType: 'walk' },
            { label: 'HBP', eventType: 'hit_by_pitch' },
            { label: 'Strikeout', eventType: 'strikeout' },
            { label: 'Sac Fly', eventType: 'sacrifice_fly' },
            { label: 'Sac Bunt', eventType: 'sacrifice_bunt' },
          ] as const).map(({ label, eventType }) => (
            <button key={eventType} type="button" disabled={isPending}
              onClick={() => handleDirectResult(eventType)}
              className="py-2 text-sm font-medium rounded-lg border border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100 disabled:opacity-40 transition-colors"
            >{label}</button>
          ))}
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button type="button" onClick={() => setResultStep('pitches')} className="text-xs text-gray-400 hover:text-gray-600">← Back to pitches</button>
      </div>
    );
  }

  // ── Main view: pitch recording ──
  return (
    <div className="mt-2 p-4 bg-white rounded-xl border border-brand-200 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Replay At-Bat: {atBat.batterName} vs {atBat.pitcherName}
        </p>
        <button type="button" onClick={onDone} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
      </div>

      {/* Count display */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-500 w-4">B</span>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={`w-3 h-3 rounded-full border-2 ${i < balls ? 'bg-green-500 border-green-500' : 'border-green-300'}`} />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-500 w-4">S</span>
          {[0, 1, 2].map((i) => (
            <span key={i} className={`w-3 h-3 rounded-full border-2 ${i < strikes ? 'bg-yellow-500 border-yellow-500' : 'border-yellow-300'}`} />
          ))}
        </div>
        <span className="text-sm font-bold text-gray-700 tabular-nums">{balls}-{strikes}</span>
      </div>

      {/* Recorded pitches */}
      {pitches.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {pitches.map((p, i) => (
            <span key={i} className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-600 rounded-full px-2 py-0.5 border border-gray-200">
              {i + 1}. {PITCH_OUTCOME_LABELS[p.outcome] ?? p.outcome}
              <button type="button" onClick={() => setPitches((prev) => prev.filter((_, j) => j !== i))}
                className="text-gray-400 hover:text-red-500 transition-colors"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Pitch buttons */}
      <div>
        <p className="text-[11px] text-gray-400 mb-1.5">Record pitch</p>
        <div className="flex flex-wrap gap-1.5">
          {REPLAY_PITCH_OUTCOMES.map(({ label, outcome, style }) => (
            <button key={outcome} type="button"
              onClick={() => setPitches((prev) => [...prev, { outcome }])}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border ${style} transition-colors`}
            >{label}</button>
          ))}
        </div>
      </div>

      {/* Result section */}
      <div>
        <button type="button" onClick={() => setResultStep('type')}
          className="px-4 py-2 text-sm font-semibold rounded-lg bg-brand-700 text-white hover:bg-brand-800 transition-colors"
        >
          Record Result →
        </button>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

// ── At-Bat Section ──────────────────────────────────────────────────────────

function AtBatSection({
  atBat,
  nodeKey,
  expanded,
  onToggle,
  isHome,
  isCoach,
  gameId,
  inning,
  isTopOfInning,
  precedingSequence,
  teamPlayers,
  opponentPlayers,
}: {
  atBat: AtBatNode;
  nodeKey: string;
  expanded: boolean;
  onToggle: (key: string) => void;
  isHome: boolean;
  isCoach?: boolean;
  gameId?: string;
  inning?: number;
  isTopOfInning?: boolean;
  precedingSequence?: number;
  teamPlayers?: PlayerEntry[];
  opponentPlayers?: PlayerEntry[];
}) {
  // Interleave pitches and mid-at-bat events by sequence number
  const pitchItems = atBat.pitches.map((p) => ({ type: 'pitch' as const, data: p, seq: p.event.sequenceNumber }));
  const midItems = atBat.midAtBatEvents.map((m) => ({ type: 'mid' as const, data: m, seq: m.event.sequenceNumber }));
  const merged = [...pitchItems, ...midItems].sort((a, b) => a.seq - b.seq);

  // Derive opponent flags from first pitch or result payload
  const firstPayload = (atBat.pitches[0]?.event.payload ?? atBat.result?.event.payload) as Record<string, unknown> | undefined;
  const isOpponentBatter = !!firstPayload?.opponentBatterId;
  const isOpponentPitcher = !!firstPayload?.opponentPitcherId;
  const canAddPitch = isCoach && gameId && inning != null && isTopOfInning != null;
  const [replaying, setReplaying] = useState(false);

  return (
    <div className="py-1">
      <div className="flex items-center gap-1">
        <button
          onClick={() => onToggle(nodeKey)}
          className="flex-1 flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-gray-50 transition-colors text-left"
        >
          <Chevron expanded={expanded} />
          <span className="text-sm font-medium text-gray-800">
            #{atBat.number}: {atBat.batterName}
            <span className="font-normal text-gray-500"> vs </span>
            {atBat.pitcherName}
          </span>
          {atBat.pitches.length > 0 && (
            <span className="text-xs text-gray-400 ml-1">
              ({atBat.pitches.length} {atBat.pitches.length === 1 ? 'pitch' : 'pitches'})
            </span>
          )}
          <span className="ml-auto" />
          {atBat.result && (
            <>
              <ScoreBadge homeScore={atBat.homeScore} awayScore={atBat.awayScore} isHome={isHome} />
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${CATEGORY_PILL[atBat.result.category]}`}>
                {atBat.result.label}
              </span>
            </>
          )}
          {!atBat.result && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
              In Progress
            </span>
          )}
        </button>
        {canAddPitch && !replaying && (
          <button
            type="button"
            onClick={() => setReplaying(true)}
            className="shrink-0 p-1 text-gray-300 hover:text-brand-600 transition-colors"
            aria-label="Replay at-bat"
            title="Replay at-bat"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
            </svg>
          </button>
        )}
      </div>

      {expanded && (
        <div className="ml-6 pl-4 border-l-2 border-gray-200 mt-1 mb-2">
          {merged.map((item, i) => {
            const insertAfter = i === 0 ? (precedingSequence ?? 0) : merged[i - 1].seq;
            return (
              <React.Fragment key={i}>
                {canAddPitch && (
                  <div className="flex items-center gap-3 flex-wrap">
                    <AddPitchButton
                      gameId={gameId}
                      inning={inning}
                      isTopOfInning={isTopOfInning}
                      insertAfterSequence={insertAfter}
                      batterId={atBat.batterId}
                      pitcherId={atBat.pitcherId}
                      isOpponentBatter={isOpponentBatter}
                      isOpponentPitcher={isOpponentPitcher}
                    />
                    {teamPlayers && opponentPlayers && (
                      <AddRunnerEventButton
                        gameId={gameId}
                        inning={inning}
                        isTopOfInning={isTopOfInning}
                        teamPlayers={teamPlayers}
                        opponentPlayers={opponentPlayers}
                        insertAfterSequence={insertAfter}
                      />
                    )}
                  </div>
                )}
                {item.type === 'pitch'
                  ? <PitchRow pitch={item.data as PitchNode} isCoach={isCoach} gameId={gameId} />
                  : <MidAtBatRow node={item.data as HistoryEventNode} isCoach={isCoach} gameId={gameId} />
                }
              </React.Fragment>
            );
          })}
          {canAddPitch && merged.length > 0 && (
            <div className="flex items-center gap-3 flex-wrap">
              <AddPitchButton
                gameId={gameId}
                inning={inning}
                isTopOfInning={isTopOfInning}
                insertAfterSequence={merged[merged.length - 1].seq}
                batterId={atBat.batterId}
                pitcherId={atBat.pitcherId}
                isOpponentBatter={isOpponentBatter}
                isOpponentPitcher={isOpponentPitcher}
              />
              {teamPlayers && opponentPlayers && (
                <AddRunnerEventButton
                  gameId={gameId}
                  inning={inning}
                  isTopOfInning={isTopOfInning}
                  teamPlayers={teamPlayers}
                  opponentPlayers={opponentPlayers}
                  insertAfterSequence={merged[merged.length - 1].seq}
                />
              )}
            </div>
          )}
          {atBat.result && (
            <div className="py-1.5">
              <div className="flex items-center gap-2 text-sm font-medium">
                <span className={`w-2 h-2 rounded-full shrink-0 ${
                  atBat.result.category === 'positive' ? 'bg-green-500' : atBat.result.category === 'negative' ? 'bg-red-500' : 'bg-gray-400'
                }`} />
                <span className={CATEGORY_TEXT[atBat.result.category]}>
                  Result: {atBat.result.label}
                </span>
                {isCoach && gameId && (
                  <EditEventButton event={atBat.result.event} gameId={gameId} />
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {replaying && canAddPitch && (
        <ReplayAtBatPanel
          gameId={gameId}
          atBat={atBat}
          inning={inning}
          isTopOfInning={isTopOfInning}
          precedingSequence={precedingSequence ?? 0}
          onDone={() => setReplaying(false)}
        />
      )}
    </div>
  );
}

// ── Half-Inning Section ─────────────────────────────────────────────────────

function HalfInningSection({
  half,
  inningNumber,
  teamLabel,
  nodeKey,
  expanded,
  expandedNodes,
  onToggle,
  isHome,
  isCoach,
  gameId,
  teamPlayers,
  opponentPlayers,
}: {
  half: HalfInningNode;
  inningNumber: number;
  teamLabel: string;
  nodeKey: string;
  expanded: boolean;
  expandedNodes: Set<string>;
  onToggle: (key: string) => void;
  isHome: boolean;
  isCoach?: boolean;
  gameId?: string;
  teamPlayers?: PlayerEntry[];
  opponentPlayers?: PlayerEntry[];
}) {
  return (
    <div className="py-1">
      <button
        onClick={() => onToggle(nodeKey)}
        className="w-full flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-gray-50 transition-colors text-left"
      >
        <Chevron expanded={expanded} />
        <span className="text-sm font-semibold text-gray-700">
          {half.label}
        </span>
        <span className="text-xs text-gray-400">— {teamLabel}</span>
        <span className="ml-auto" />
        <ScoreBadge homeScore={half.homeScore} awayScore={half.awayScore} isHome={isHome} />
      </button>

      {expanded && (
        <div className="ml-4 mt-1">
          {half.items.map((item, i) => {
            const canInsert = isCoach && gameId && teamPlayers && opponentPlayers;
            const insertAfter = i > 0 ? getItemLastSequence(half.items[i - 1]) : 0;
            const insertButton = canInsert ? (
              <div key={`insert-${i}`} className="flex items-center gap-3 flex-wrap">
                <AddPlayButton
                  gameId={gameId}
                  inning={inningNumber}
                  isTopOfInning={half.isTop}
                  teamPlayers={teamPlayers}
                  opponentPlayers={opponentPlayers}
                  insertAfterSequence={insertAfter}
                  label="Insert Play Here"
                />
                <AddRunnerEventButton
                  gameId={gameId}
                  inning={inningNumber}
                  isTopOfInning={half.isTop}
                  teamPlayers={teamPlayers}
                  opponentPlayers={opponentPlayers}
                  insertAfterSequence={insertAfter}
                  label="Insert Runner Event Here"
                />
              </div>
            ) : null;

            if (item.type === 'at-bat') {
              const abKey = `${nodeKey}-ab-${item.number}`;
              return (
                <React.Fragment key={i}>
                  {insertButton}
                  <AtBatSection
                    atBat={item}
                    nodeKey={abKey}
                    expanded={expandedNodes.has(abKey)}
                    onToggle={onToggle}
                    isHome={isHome}
                    isCoach={isCoach}
                    gameId={gameId}
                    inning={inningNumber}
                    isTopOfInning={half.isTop}
                    precedingSequence={i > 0 ? getItemLastSequence(half.items[i - 1]) : 0}
                    teamPlayers={teamPlayers}
                    opponentPlayers={opponentPlayers}
                  />
                </React.Fragment>
              );
            }
            return (
              <React.Fragment key={i}>
                {insertButton}
                <InterstitialRow node={item} isCoach={isCoach} gameId={gameId} />
              </React.Fragment>
            );
          })}
          {isCoach && gameId && teamPlayers && opponentPlayers && (
            <div className="flex items-center gap-3 flex-wrap">
              <AddPlayButton
                gameId={gameId}
                inning={inningNumber}
                isTopOfInning={half.isTop}
                teamPlayers={teamPlayers}
                opponentPlayers={opponentPlayers}
                insertAfterSequence={half.items.length > 0 ? getItemLastSequence(half.items[half.items.length - 1]) : 0}
                label="Add Play"
              />
              <AddRunnerEventButton
                gameId={gameId}
                inning={inningNumber}
                isTopOfInning={half.isTop}
                teamPlayers={teamPlayers}
                opponentPlayers={opponentPlayers}
                insertAfterSequence={half.items.length > 0 ? getItemLastSequence(half.items[half.items.length - 1]) : 0}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Inning Section ──────────────────────────────────────────────────────────

function InningSection({
  inning,
  nodeKey,
  expanded,
  expandedNodes,
  onToggle,
  homeTeamName,
  awayTeamName,
  isHome,
  isCoach,
  gameId,
  teamPlayers,
  opponentPlayers,
}: {
  inning: InningNode;
  nodeKey: string;
  expanded: boolean;
  expandedNodes: Set<string>;
  onToggle: (key: string) => void;
  homeTeamName: string;
  awayTeamName: string;
  isHome: boolean;
  isCoach?: boolean;
  gameId?: string;
  teamPlayers?: PlayerEntry[];
  opponentPlayers?: PlayerEntry[];
}) {
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={() => onToggle(nodeKey)}
        className="w-full flex items-center gap-2 px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <Chevron expanded={expanded} />
        <span className="text-sm font-bold text-gray-800">
          Inning {inning.number}
        </span>
        <span className="ml-auto" />
        <ScoreBadge homeScore={inning.homeScore} awayScore={inning.awayScore} isHome={isHome} />
      </button>

      {expanded && (
        <div className="px-4 pb-3">
          {inning.top && (
            <HalfInningSection
              half={inning.top}
              inningNumber={inning.number}
              teamLabel={awayTeamName}
              nodeKey={`${nodeKey}-top`}
              expanded={expandedNodes.has(`${nodeKey}-top`)}
              expandedNodes={expandedNodes}
              onToggle={onToggle}
              isHome={isHome}
              isCoach={isCoach}
              gameId={gameId}
              teamPlayers={teamPlayers}
              opponentPlayers={opponentPlayers}
            />
          )}
          {inning.bottom && (
            <HalfInningSection
              half={inning.bottom}
              inningNumber={inning.number}
              teamLabel={homeTeamName}
              nodeKey={`${nodeKey}-bot`}
              expanded={expandedNodes.has(`${nodeKey}-bot`)}
              expandedNodes={expandedNodes}
              onToggle={onToggle}
              isHome={isHome}
              isCoach={isCoach}
              gameId={gameId}
              teamPlayers={teamPlayers}
              opponentPlayers={opponentPlayers}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

function ScoreBadge({ homeScore, awayScore, isHome }: { homeScore: number; awayScore: number; isHome: boolean }) {
  const usScore = isHome ? homeScore : awayScore;
  const themScore = isHome ? awayScore : homeScore;
  return (
    <span className="text-xs font-semibold text-gray-500 tabular-nums">
      {usScore}–{themScore}
    </span>
  );
}

interface GameHistoryTreeProps {
  tree: GameHistoryTreeType;
  teamName: string;
  opponentName: string;
  isHome: boolean;
  isCoach?: boolean;
  gameId?: string;
  teamPlayers?: PlayerEntry[];
  opponentPlayers?: PlayerEntry[];
}

export function GameHistoryTree({ tree, teamName, opponentName, isHome, isCoach, gameId, teamPlayers, opponentPlayers }: GameHistoryTreeProps): React.JSX.Element {
  const homeTeamName = isHome ? teamName : opponentName;
  const awayTeamName = isHome ? opponentName : teamName;

  // Build default expanded set: all innings + half-innings, no at-bats
  const buildDefaultExpanded = useCallback(() => {
    const set = new Set<string>();
    for (const inning of tree.innings) {
      const innKey = `inn-${inning.number}`;
      set.add(innKey);
      if (inning.top) set.add(`${innKey}-top`);
      if (inning.bottom) set.add(`${innKey}-bot`);
    }
    return set;
  }, [tree]);

  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(buildDefaultExpanded);

  const onToggle = useCallback((key: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    const set = new Set<string>();
    for (const inning of tree.innings) {
      const innKey = `inn-${inning.number}`;
      set.add(innKey);
      if (inning.top) {
        set.add(`${innKey}-top`);
        for (const item of inning.top.items) {
          if (item.type === 'at-bat') set.add(`${innKey}-top-ab-${item.number}`);
        }
      }
      if (inning.bottom) {
        set.add(`${innKey}-bot`);
        for (const item of inning.bottom.items) {
          if (item.type === 'at-bat') set.add(`${innKey}-bot-ab-${item.number}`);
        }
      }
    }
    setExpandedNodes(set);
  }, [tree]);

  const collapseAll = useCallback(() => {
    setExpandedNodes(new Set<string>());
  }, []);

  if (tree.innings.length === 0) {
    return (
      <p className="text-gray-500 text-sm">No events recorded yet.</p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={expandAll}
          className="text-xs text-brand-700 hover:underline font-medium"
        >
          Expand All
        </button>
        <span className="text-gray-300">|</span>
        <button
          onClick={collapseAll}
          className="text-xs text-brand-700 hover:underline font-medium"
        >
          Collapse All
        </button>
      </div>

      {/* Innings */}
      {tree.innings.map((inning) => {
        const innKey = `inn-${inning.number}`;
        return (
          <InningSection
            key={inning.number}
            inning={inning}
            nodeKey={innKey}
            expanded={expandedNodes.has(innKey)}
            expandedNodes={expandedNodes}
            onToggle={onToggle}
            homeTeamName={homeTeamName}
            awayTeamName={awayTeamName}
            isHome={isHome}
            isCoach={isCoach}
            gameId={gameId}
            teamPlayers={teamPlayers}
            opponentPlayers={opponentPlayers}
          />
        );
      })}
    </div>
  );
}
