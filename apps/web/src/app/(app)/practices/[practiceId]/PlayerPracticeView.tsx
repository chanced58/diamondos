'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { savePlayerSelfNotesAction } from './actions';

const CATEGORIES = [
  { key: 'pitching', label: 'Pitching' },
  { key: 'hitting', label: 'Hitting' },
  { key: 'fielding_catching', label: 'Fielding / Catching' },
  { key: 'baserunning', label: 'Baserunning' },
  { key: 'athleticism', label: 'Athleticism' },
  { key: 'attitude', label: 'Attitude' },
] as const;

type CoachNotes = {
  pitching: string | null;
  hitting: string | null;
  fielding_catching: string | null;
  baserunning: string | null;
  athleticism: string | null;
  attitude: string | null;
  player_notes: string | null;
};

type Props = {
  practiceId: string;
  playerId: string;
  playerName?: string;   // shown in headings when viewing as a parent
  overallNotes: string;
  coachNotes: CoachNotes | null;
  readOnly?: boolean;    // true for parents — hides the editable notes form
};

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-brand-700 text-white font-semibold px-6 py-2.5 rounded-lg hover:bg-brand-800 disabled:opacity-50 transition-colors"
    >
      {pending ? 'Saving...' : 'Save my notes'}
    </button>
  );
}

const textareaClass =
  'w-full border border-gray-200 rounded-lg px-3 py-2.5 text-gray-900 text-sm placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-y min-h-[100px]';

function EditableNotesForm({
  practiceId,
  playerId,
  existingNotes,
}: {
  practiceId: string;
  playerId: string;
  existingNotes: string;
}) {
  const [state, formAction] = useFormState(savePlayerSelfNotesAction, null);
  const saved = state === 'saved';
  const error = state && state !== 'saved' ? state : null;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="practiceId" value={practiceId} />
      <input type="hidden" name="playerId" value={playerId} />

      {saved && (
        <div className="bg-green-50 border border-green-200 text-green-800 text-sm px-4 py-3 rounded-lg">
          Notes saved.
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <textarea
        name="player_notes"
        defaultValue={existingNotes}
        placeholder="How did practice go? What felt good? What do you want to work on?"
        className={textareaClass}
      />

      <div className="flex justify-end">
        <SaveButton />
      </div>
    </form>
  );
}

export function PlayerPracticeView({
  practiceId,
  playerId,
  playerName,
  overallNotes,
  coachNotes,
  readOnly = false,
}: Props) {
  const hasAnyCoachNotes = coachNotes && CATEGORIES.some(({ key }) => coachNotes[key]);
  const selfNotes = coachNotes?.player_notes ?? '';

  // When a parent views multiple children, wrap each in a named section
  const wrapperClass = playerName ? 'space-y-6 bg-gray-50 border border-gray-200 rounded-2xl p-6' : 'space-y-8';

  return (
    <div className={wrapperClass}>
      {playerName && (
        <h3 className="text-base font-semibold text-gray-900 border-b border-gray-200 pb-3">
          {playerName}
        </h3>
      )}

      {/* ── Overall Notes (read-only) ──────────────────────────────────── */}
      {!playerName && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-base font-semibold text-gray-900">Overall Notes</h2>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
              From your coach
            </span>
          </div>
          {overallNotes ? (
            <p className="text-sm text-gray-700 whitespace-pre-wrap bg-white border border-gray-200 rounded-xl px-4 py-3">
              {overallNotes}
            </p>
          ) : (
            <p className="text-sm text-gray-400 italic bg-white border border-gray-100 rounded-xl px-4 py-3">
              No overall notes posted yet.
            </p>
          )}
        </section>
      )}

      {/* ── Coach's Assessment ────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-900">
            {playerName ? `Coach's Assessment` : `Coach's Assessment`}
          </h2>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
            {playerName ? `${playerName.split(' ')[0]}'s feedback` : 'Your feedback'}
          </span>
        </div>

        {hasAnyCoachNotes ? (
          <div className="bg-white border border-gray-200 rounded-xl px-5 py-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            {CATEGORIES.map(({ key, label }) => {
              const value = coachNotes?.[key];
              if (!value) return null;
              return (
                <div key={key}>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    {label}
                  </p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{value}</p>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-gray-400 italic bg-white border border-gray-100 rounded-xl px-4 py-3">
            {playerName
              ? `No coach assessment for ${playerName.split(' ')[0]} yet.`
              : "Your coach hasn't added notes for you yet."}
          </p>
        )}
      </section>

      {/* ── Player's Own Notes ─────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-base font-semibold text-gray-900">
            {playerName ? `${playerName.split(' ')[0]}'s Notes` : 'My Notes'}
          </h2>
          <span className="text-xs text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
            {readOnly ? 'Visible to player and coaches' : 'Only you and your coaches can see this'}
          </span>
        </div>

        {readOnly ? (
          // Parent view — display only, no editing
          selfNotes ? (
            <p className="text-sm text-gray-700 whitespace-pre-wrap bg-white border border-gray-200 rounded-xl px-4 py-3">
              {selfNotes}
            </p>
          ) : (
            <p className="text-sm text-gray-400 italic bg-white border border-gray-100 rounded-xl px-4 py-3">
              {playerName
                ? `${playerName.split(' ')[0]} hasn't added any notes yet.`
                : 'No notes added yet.'}
            </p>
          )
        ) : (
          // Player view — editable form
          <EditableNotesForm
            practiceId={practiceId}
            playerId={playerId}
            existingNotes={selfNotes}
          />
        )}
      </section>
    </div>
  );
}
