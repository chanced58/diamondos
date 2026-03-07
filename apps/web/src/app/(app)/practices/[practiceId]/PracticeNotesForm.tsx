'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { savePracticeNotesAction } from './actions';

const CATEGORIES = [
  { key: 'pitching', label: 'Pitching/Throwing' },
  { key: 'hitting', label: 'Hitting' },
  { key: 'fielding_catching', label: 'Fielding / Catching' },
  { key: 'baserunning', label: 'Baserunning' },
  { key: 'athleticism', label: 'Athleticism' },
  { key: 'attitude', label: 'Attitude' },
] as const;

type Player = {
  id: string;
  first_name: string;
  last_name: string;
  jersey_number: number | null;
};

type PlayerNotes = {
  player_id: string;
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
  teamId: string;
  overallNotes: string;
  coachNotes: string;
  players: Player[];
  playerNotesMap: Record<string, PlayerNotes>;
};

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-brand-700 text-white font-semibold px-6 py-2.5 rounded-lg hover:bg-brand-800 disabled:opacity-50 transition-colors"
    >
      {pending ? 'Saving...' : 'Save all notes'}
    </button>
  );
}

const textareaClass =
  'w-full border border-gray-200 rounded-lg px-3 py-2.5 text-gray-900 text-sm placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-y min-h-[80px]';

const readonlyClass =
  'w-full border border-gray-100 rounded-lg px-3 py-2.5 text-gray-600 text-sm bg-gray-50 resize-y min-h-[80px]';

export function PracticeNotesForm({
  practiceId,
  teamId,
  overallNotes,
  coachNotes,
  players,
  playerNotesMap,
}: Props) {
  const [state, formAction] = useFormState(savePracticeNotesAction, null);

  const saved = state === 'saved';
  const error = state && state !== 'saved' ? state : null;

  return (
    <form action={formAction} className="space-y-8">
      <input type="hidden" name="practiceId" value={practiceId} />
      <input type="hidden" name="teamId" value={teamId} />

      {saved && (
        <div className="bg-green-50 border border-green-200 text-green-800 text-sm px-4 py-3 rounded-lg">
          Notes saved successfully.
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* ── Overall Notes ─────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-base font-semibold text-gray-900">Overall Notes</h2>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
            Visible to all team members
          </span>
        </div>
        <textarea
          name="overall_notes"
          defaultValue={overallNotes}
          placeholder="General practice summary, focus areas, weather conditions..."
          className={textareaClass}
        />
      </section>

      {/* ── Coach's Notes ─────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-base font-semibold text-gray-900">Coach's Notes</h2>
          <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
            Coaches only
          </span>
        </div>
        <textarea
          name="coach_notes"
          defaultValue={coachNotes}
          placeholder="Internal observations, strategy notes, follow-up items..."
          className={textareaClass}
        />
      </section>

      {/* ── Player Notes ──────────────────────────────────────────────── */}
      {players.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-gray-900 mb-4">
            Player Notes
            <span className="ml-2 text-sm font-normal text-gray-400">({players.length} players)</span>
          </h2>

          <div className="space-y-3">
            {players.map((player) => {
              const notes = playerNotesMap[player.id];
              const playerName = `${player.last_name}, ${player.first_name}`;
              const jerseyLabel = player.jersey_number != null ? ` #${player.jersey_number}` : '';
              const hasPlayerSelfNotes = !!(notes?.player_notes);

              return (
                <details key={player.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden group">
                  <summary className="flex items-center justify-between px-5 py-4 cursor-pointer select-none hover:bg-gray-50 transition-colors">
                    <span className="font-medium text-gray-900">
                      {playerName}
                      <span className="ml-1.5 font-mono text-gray-400 text-sm">{jerseyLabel}</span>
                    </span>
                    <div className="flex items-center gap-3">
                      {hasPlayerSelfNotes && (
                        <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                          Player notes added
                        </span>
                      )}
                      <span className="text-gray-400 text-sm group-open:hidden">Expand</span>
                      <span className="text-gray-400 text-sm hidden group-open:inline">Collapse</span>
                    </div>
                  </summary>

                  <div className="border-t border-gray-100 px-5 py-4 space-y-5">
                    {/* Coach categorical notes */}
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                        Coach's Assessment
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {CATEGORIES.map(({ key, label }) => (
                          <div key={key}>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                              {label}
                            </label>
                            <textarea
                              name={`player_${player.id}_${key}`}
                              defaultValue={notes?.[key] ?? ''}
                              placeholder={`${label} notes...`}
                              className={textareaClass}
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Player's own self-reflection notes (read-only for coaches) */}
                    <div className="border-t border-gray-100 pt-4">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                        Player's Self-Reflection
                        <span className="ml-2 font-normal text-gray-300 normal-case">(written by player — read only)</span>
                      </p>
                      {hasPlayerSelfNotes ? (
                        <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5">
                          {notes.player_notes}
                        </p>
                      ) : (
                        <p className="text-sm text-gray-300 italic">No self-reflection notes yet.</p>
                      )}
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
        </section>
      )}

      {players.length === 0 && (
        <p className="text-sm text-gray-400">
          No players on the roster yet.{' '}
          <a href="/teams" className="text-brand-700 hover:underline">Add players</a> to include per-player notes.
        </p>
      )}

      <div className="flex justify-end pt-2">
        <SaveButton />
      </div>
    </form>
  );
}
