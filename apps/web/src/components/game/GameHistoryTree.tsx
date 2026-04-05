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
import { replaceEventAction, insertCorrectionEventAction, voidEventAction, replayAtBatAction } from '@/app/(app)/games/[gameId]/actions';
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

// ── Edit Event Button ──────────────────────────────────────────────────────

const EDITABLE_EVENT_TYPES = new Set([
  'pitch_thrown',
  'hit', 'out', 'walk', 'hit_by_pitch', 'strikeout',
  'sacrifice_bunt', 'sacrifice_fly', 'field_error',
  'double_play', 'triple_play',
]);

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
      // First insert the pitch_thrown with outcome: in_play
      const pitchPayload: Record<string, unknown> = { ...buildBatterPitcher(), outcome: 'in_play', insertAfterSequence };
      const pitchForm = new FormData();
      pitchForm.set('gameId', gameId);
      pitchForm.set('eventType', 'pitch_thrown');
      pitchForm.set('inning', String(inning));
      pitchForm.set('isTopOfInning', String(isTopOfInning));
      pitchForm.set('payload', JSON.stringify(pitchPayload));
      const pitchErr = await insertCorrectionEventAction(null, pitchForm);
      if (pitchErr) { setError(pitchErr); return; }

      // Then insert the result event after the same position
      // (higher sequence number means it sorts after the pitch)
      const resultForm = new FormData();
      resultForm.set('gameId', gameId);
      resultForm.set('eventType', eventType);
      resultForm.set('inning', String(inning));
      resultForm.set('isTopOfInning', String(isTopOfInning));
      resultForm.set('payload', JSON.stringify({ ...buildBatterPitcher(), ...resultPayload, insertAfterSequence }));
      const resultErr = await insertCorrectionEventAction(null, resultForm);
      if (resultErr) { setError(resultErr); return; }

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

  async function handleDelete() {
    if (deleting) return;
    if (!confirm('Delete this pitch?')) return;
    setDeleting(true);
    try {
      const formData = new FormData();
      formData.set('gameId', gameId!);
      formData.set('eventId', pitch.event.id);
      await voidEventAction(null, formData);
      router.refresh();
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
          {merged.map((item, i) => (
            <React.Fragment key={i}>
              {canAddPitch && (
                <AddPitchButton
                  gameId={gameId}
                  inning={inning}
                  isTopOfInning={isTopOfInning}
                  insertAfterSequence={i === 0 ? (precedingSequence ?? 0) : merged[i - 1].seq}
                  batterId={atBat.batterId}
                  pitcherId={atBat.pitcherId}
                  isOpponentBatter={isOpponentBatter}
                  isOpponentPitcher={isOpponentPitcher}
                />
              )}
              {item.type === 'pitch'
                ? <PitchRow pitch={item.data as PitchNode} isCoach={isCoach} gameId={gameId} />
                : <MidAtBatRow node={item.data as HistoryEventNode} isCoach={isCoach} gameId={gameId} />
              }
            </React.Fragment>
          ))}
          {canAddPitch && merged.length > 0 && (
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
            const insertButton = canInsert ? (
              <AddPlayButton
                key={`insert-${i}`}
                gameId={gameId}
                inning={inningNumber}
                isTopOfInning={half.isTop}
                teamPlayers={teamPlayers}
                opponentPlayers={opponentPlayers}
                insertAfterSequence={i > 0 ? getItemLastSequence(half.items[i - 1]) : 0}
                label="Insert Play Here"
              />
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
            <AddPlayButton
              gameId={gameId}
              inning={inningNumber}
              isTopOfInning={half.isTop}
              teamPlayers={teamPlayers}
              opponentPlayers={opponentPlayers}
              insertAfterSequence={half.items.length > 0 ? getItemLastSequence(half.items[half.items.length - 1]) : 0}
              label="Add Play"
            />
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
