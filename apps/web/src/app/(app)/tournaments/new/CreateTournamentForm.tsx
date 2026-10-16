'use client';

import type { JSX } from 'react';
import Link from 'next/link';
import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import type { TournamentTeamOption } from '@baseball/database';
import { getTournamentReview } from '@/lib/tournament-form';
import { createTournamentAction } from '../actions';

function CreateButton(): JSX.Element {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rounded-lg bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:cursor-wait disabled:opacity-60">
      {pending ? 'Creating tournament…' : 'Create Tournament'}
    </button>
  );
}

export function CreateTournamentForm({ teams, requestId }: { teams: TournamentTeamOption[]; requestId: string }): JSX.Element {
  const [error, action] = useFormState(createTournamentAction, null);
  const [teamType, setTeamType] = useState<'existing' | 'new'>(teams.length ? 'existing' : 'new');
  const [allowExpanded, setAllowExpanded] = useState(false);
  const [review, setReview] = useState({
    team: teams[0]?.name ?? 'Enter a team name (new tournament team)',
    battingOrder: 'Up to 9 batters',
    midGameChanges: 'Not allowed',
  });

  return (
    <form action={action} onChange={(event) => setReview(getTournamentReview(new FormData(event.currentTarget), teams))} className="space-y-6">
      <input type="hidden" name="requestId" value={requestId} />

      <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-gray-950">Tournament details</h2>
          <p className="mt-1 text-sm text-gray-600">Set a name and the event dates.</p>
        </div>
        <label className="block text-sm font-medium text-gray-700">
          Tournament name
          <input name="name" required maxLength={100} className="mt-1.5 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-950 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100" />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-gray-700">
            Start date
            <input name="startDate" type="date" required className="mt-1.5 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-950 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100" />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            End date
            <input name="endDate" type="date" required className="mt-1.5 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-950 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100" />
          </label>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-gray-950">Tournament team</h2>
          <p className="mt-1 text-sm text-gray-600">Enter your existing team, or create a separate tournament team that is kept completely apart from it.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={`cursor-pointer rounded-lg border p-4 ${teamType === 'existing' ? 'border-brand-500 bg-brand-50' : 'border-gray-200'}`}>
            <input type="radio" name="teamType" value="existing" checked={teamType === 'existing'} onChange={() => setTeamType('existing')} disabled={!teams.length} className="mr-2 accent-brand-700" />
            <span className="font-medium text-gray-900">Use my existing team</span>
            <span className="mt-1 block pl-6 text-xs text-gray-600">
              {teams.length
                ? 'Your current roster plays the tournament. Games get their own tournament season, so regular-season stats stay separate.'
                : 'Only available for teams where you are head coach or athletic director.'}
            </span>
          </label>
          <label className={`cursor-pointer rounded-lg border p-4 ${teamType === 'new' ? 'border-brand-500 bg-brand-50' : 'border-gray-200'}`}>
            <input type="radio" name="teamType" value="new" checked={teamType === 'new'} onChange={() => setTeamType('new')} className="mr-2 accent-brand-700" />
            <span className="font-medium text-gray-900">Create Tournament Team</span>
            <span className="mt-1 block pl-6 text-xs text-gray-600">A separate tournament with its own roster, schedule and stats. Nothing is shared with your current team.</span>
          </label>
        </div>

        {teamType === 'existing' ? (
          <label className="block text-sm font-medium text-gray-700">
            Team
            <select name="teamId" required className="mt-1.5 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-950 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100">
              {teams.map((team) => <option key={team.id} value={team.id}>{team.name}{team.organization ? ` · ${team.organization}` : ''}</option>)}
            </select>
          </label>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-gray-700 sm:col-span-2">
              Team name
              <input name="teamName" required maxLength={100} className="mt-1.5 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-950 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100" />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Organization <span className="font-normal text-gray-400">(optional)</span>
              <input name="organization" maxLength={100} className="mt-1.5 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-950 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100" />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              State <span className="font-normal text-gray-400">(optional)</span>
              <input name="stateCode" minLength={2} maxLength={2} className="mt-1.5 block w-full rounded-lg border border-gray-300 px-3 py-2 uppercase text-gray-950 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100" />
            </label>
          </div>
        )}
      </section>

      <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-gray-950">Lineup rules</h2>
          <p className="mt-1 text-sm text-gray-600">Both options start disabled for a new tournament.</p>
        </div>
        <label className="flex items-start gap-3 rounded-lg border border-gray-200 p-4">
          <input type="checkbox" name="allowExpanded" checked={allowExpanded} onChange={(event) => setAllowExpanded(event.target.checked)} className="mt-1 accent-brand-700" />
          <span>
            <span className="block font-medium text-gray-900">Allow more than 9 batters</span>
            <span className="mt-1 block text-sm text-gray-600">Use an expanded batting order up to the tournament cap.</span>
          </span>
        </label>
        {allowExpanded && (
          <label className="block text-sm font-medium text-gray-700">
            Maximum batters
            <select name="maxBatters" required defaultValue="12" className="mt-1.5 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-950 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100">
              {Array.from({ length: 21 }, (_, index) => index + 10).map((value) => <option key={value} value={value}>{value} batters</option>)}
            </select>
          </label>
        )}
        <label className="flex items-start gap-3 rounded-lg border border-gray-200 p-4">
          <input type="checkbox" name="allowMidGameChanges" className="mt-1 accent-brand-700" />
          <span>
            <span className="block font-medium text-gray-900">Allow lineup expansion or contraction mid-game</span>
            <span className="mt-1 block text-sm text-gray-600">Coaches may add or remove a batting slot during a game, within the maximum above.</span>
          </span>
        </label>
      </section>

      <section className="rounded-xl border border-brand-100 bg-brand-50/60 p-5">
        <h2 className="font-semibold text-gray-900">Review before creating</h2>
        <dl aria-live="polite" className="mt-3 space-y-2 text-sm text-gray-900">
          <div><dt className="font-medium">Team</dt><dd>{review.team}</dd></div>
          <div><dt className="font-medium">Batting order</dt><dd>{review.battingOrder}</dd></div>
          <div><dt className="font-medium">Mid-game lineup changes</dt><dd>{review.midGameChanges}</dd></div>
        </dl>
        <p className="mt-1 text-sm text-gray-700">The tournament gets its own season and scoring rules. Creating it will not change your current team season or league settings.</p>
      </section>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="flex items-center justify-between gap-4">
        <Link href="/tournaments" className="text-sm font-medium text-gray-600 hover:text-gray-900">Cancel</Link>
        <CreateButton />
      </div>
    </form>
  );
}
