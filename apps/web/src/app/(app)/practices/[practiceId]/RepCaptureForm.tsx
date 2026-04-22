'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  PRACTICE_REP_OUTCOMES,
  PRACTICE_REP_OUTCOME_DEFAULT_CATEGORY,
  PracticeRepCoachTag,
  type PracticeRepInput,
  type PracticeRepOutcome,
} from '@baseball/shared';
import { logRepAction } from './rep-actions';

interface PlayerOption {
  id: string;
  firstName: string;
  lastName: string;
  jerseyNumber?: number | null;
}

interface Props {
  practiceId: string;
  players: PlayerOption[];
}

const OUTCOME_LABELS: Record<PracticeRepOutcome, string> = {
  hit_hard: 'Hit hard',
  line_drive: 'Line drive',
  weak_contact: 'Weak contact',
  swing_miss: 'Swing & miss',
  take: 'Take',
  ground_out: 'Ground out',
  fly_out: 'Fly out',
  walk: 'Walk',
  foul: 'Foul',
};

export function RepCaptureForm({ practiceId, players }: Props): JSX.Element | null {
  const router = useRouter();
  const [playerId, setPlayerId] = useState<string>(players[0]?.id ?? '');
  const [outcome, setOutcome] = useState<PracticeRepOutcome>('line_drive');
  const [coachTag, setCoachTag] = useState<PracticeRepCoachTag | ''>('');
  const [note, setNote] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (players.length === 0) return null;

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!playerId) return;
    const input: PracticeRepInput = {
      practiceId,
      playerId,
      outcome,
      outcomeCategory: PRACTICE_REP_OUTCOME_DEFAULT_CATEGORY[outcome],
      coachTag: coachTag || undefined,
    };
    setNote(null);
    startTransition(() => {
      void (async () => {
        const result = await logRepAction(input);
        if (typeof result === 'string') setNote(result);
        else {
          setNote('Logged.');
          router.refresh();
        }
      })();
    });
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">Log a rep</h3>
      <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        <label className="text-sm">
          <span className="block text-xs font-medium text-gray-600 mb-1">Hitter</span>
          <select
            value={playerId}
            onChange={(e) => setPlayerId(e.target.value)}
            className="block w-full rounded-md border-gray-300 shadow-sm text-sm"
            required
          >
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.lastName}, {p.firstName}
                {p.jerseyNumber != null ? ` #${p.jerseyNumber}` : ''}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="block text-xs font-medium text-gray-600 mb-1">Outcome</span>
          <select
            value={outcome}
            onChange={(e) => setOutcome(e.target.value as PracticeRepOutcome)}
            className="block w-full rounded-md border-gray-300 shadow-sm text-sm"
          >
            {PRACTICE_REP_OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {OUTCOME_LABELS[o]}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="block text-xs font-medium text-gray-600 mb-1">Coach tag (optional)</span>
          <select
            value={coachTag}
            onChange={(e) => setCoachTag(e.target.value as PracticeRepCoachTag | '')}
            className="block w-full rounded-md border-gray-300 shadow-sm text-sm"
          >
            <option value="">—</option>
            <option value={PracticeRepCoachTag.HOT}>🔥 Hot</option>
            <option value={PracticeRepCoachTag.COLD}>🧊 Cold</option>
            <option value={PracticeRepCoachTag.IMPROVED}>📈 Improved</option>
            <option value={PracticeRepCoachTag.FORM_BREAK}>⚠️ Form break</option>
          </select>
        </label>

        <div className="sm:col-span-3 flex items-center gap-3">
          <button
            type="submit"
            disabled={isPending}
            className="bg-brand-700 text-white font-semibold px-4 py-2 rounded-lg hover:bg-brand-800 disabled:opacity-50 text-sm"
          >
            {isPending ? 'Logging…' : 'Log rep'}
          </button>
          {note && <span className="text-xs text-gray-600">{note}</span>}
        </div>
      </form>
    </div>
  );
}
