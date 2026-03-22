'use client';

import type { JSX } from 'react';
import { useFormState } from 'react-dom';
import { createSeasonAction, setActiveSeasonAction, deactivateSeasonAction } from './actions';

type Season = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function CreateForm({ teamId }: { teamId: string }) {
  const [error, formAction] = useFormState(createSeasonAction, null);
  const currentYear = new Date().getFullYear();

  return (
    <form action={formAction} className="flex items-end gap-3 flex-wrap">
      <input type="hidden" name="teamId" value={teamId} />
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Season</label>
        <select
          name="seasonName"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
        >
          <option value="Spring">Spring</option>
          <option value="Summer">Summer</option>
          <option value="Fall">Fall</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Year</label>
        <select
          name="year"
          defaultValue={currentYear}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
        >
          {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        className="px-4 py-2 bg-brand-700 text-white text-sm font-medium rounded-lg hover:bg-brand-800 transition-colors"
      >
        Create Season
      </button>
      {error && <p className="text-red-600 text-sm w-full">{error}</p>}
    </form>
  );
}

function SeasonRow({ season, teamId }: { season: Season; teamId: string }) {
  const [activateError, activateAction] = useFormState(setActiveSeasonAction, null);
  const [deactivateError, deactivateAction] = useFormState(deactivateSeasonAction, null);

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3 font-medium text-gray-900">{season.name}</td>
      <td className="px-4 py-3 text-gray-600 text-sm">
        {formatDate(season.start_date)} – {formatDate(season.end_date)}
      </td>
      <td className="px-4 py-3">
        {season.is_active ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            Active
          </span>
        ) : (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
            Inactive
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        {season.is_active ? (
          <form action={deactivateAction} className="inline">
            <input type="hidden" name="teamId" value={teamId} />
            <input type="hidden" name="seasonId" value={season.id} />
            <button
              type="submit"
              className="text-xs text-gray-500 hover:text-red-600 font-medium transition-colors"
            >
              Deactivate
            </button>
          </form>
        ) : (
          <form action={activateAction} className="inline">
            <input type="hidden" name="teamId" value={teamId} />
            <input type="hidden" name="seasonId" value={season.id} />
            <button
              type="submit"
              className="text-xs text-brand-700 hover:text-brand-800 font-medium transition-colors"
            >
              Set Active
            </button>
          </form>
        )}
        {(activateError || deactivateError) && (
          <p className="text-red-600 text-xs mt-1">{activateError || deactivateError}</p>
        )}
      </td>
    </tr>
  );
}

export function SeasonManager({
  teamId,
  seasons,
}: {
  teamId: string;
  seasons: Season[];
}): JSX.Element {
  return (
    <div className="space-y-8">
      {/* Create form */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Create Season</h2>
        <CreateForm teamId={teamId} />
      </div>

      {/* Season list */}
      {seasons.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Name</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Dates</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Status</th>
                <th className="text-right px-4 py-3 text-gray-500 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {seasons.map((season) => (
                <SeasonRow key={season.id} season={season} teamId={teamId} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {seasons.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-8">
          No seasons created yet. Create one above to get started.
        </p>
      )}
    </div>
  );
}
