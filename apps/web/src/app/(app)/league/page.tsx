import type { JSX } from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveTeam } from '@/lib/active-team';
import { loadLeaguePage } from '@/lib/services/league/load-league-page';
import { StandingsBoard } from './StandingsBoard';

export const metadata: Metadata = { title: 'League' };

export default async function LeaguePage(): Promise<JSX.Element | null> {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const activeTeam = await getActiveTeam(supabase, user.id);
  if (!activeTeam) redirect('/dashboard');

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  // The same loader the mobile League screen reads through /api/m/v1.
  const result = await loadLeaguePage(db, user.id, { teamId: activeTeam.id });
  if (!result.ok && result.code !== 'not_found') throw new Error(result.error);
  if (!result.ok) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">League</h1>
        <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-xl p-6 max-w-md">
          <h2 className="text-lg font-semibold text-yellow-900 mb-2">No league</h2>
          <p className="text-yellow-700">
            Your team is not currently part of a league. Contact your league administrator to be added.
          </p>
        </div>
      </div>
    );
  }

  const { league, counters, divisions, staff, isLeagueAdmin, colorScheme } = result.data;
  // Counters strip: Teams · Divisions · Games Played · Your Rank (overall, by win%).
  const counterTiles: Array<{ label: string; value: string }> = [
    { label: 'Teams', value: String(counters.teams) },
    { label: 'Divisions', value: String(counters.divisions) },
    { label: 'Games Played', value: String(counters.gamesPlayed) },
    { label: 'Your Rank', value: counters.yourRank ? `#${counters.yourRank}` : '—' },
  ];

  return (
    // The admin-selected color scheme themes this dashboard's accents to match the
    // public league page (visitor light/dark base is unchanged).
    <div className={`league-scheme-${colorScheme} p-8`}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{league.name}</h1>
          {league.description && (
            <p className="text-gray-500 mt-1">{league.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {league.slug && (
            <Link
              href={`/l/${league.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
            >
              View public home page
            </Link>
          )}
          {isLeagueAdmin && (
            <Link
              href="/league/admin"
              className="text-sm font-medium bg-brand-700 text-white px-4 py-2 rounded-lg hover:bg-brand-800 transition-colors"
            >
              Manage League
            </Link>
          )}
        </div>
      </div>

      {/* Counters strip */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {counterTiles.map((c) => (
          <div key={c.label} className="rounded-xl border border-app-border bg-app-surface px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-wide text-app-fg-muted">{c.label}</div>
            <div className="mono mt-1 text-2xl font-bold text-app-fg">{c.value}</div>
          </div>
        ))}
      </div>

      {/* Standings by division — sortable, with last-5, streak, and expandable detail */}
      <StandingsBoard divisions={divisions} />

      {/* League Staff */}
      {staff.length > 0 && (
        <div className="mt-6 bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">League Staff</h2>
          </div>
          <ul className="divide-y divide-gray-100">
            {staff.map((s) => (
              <li key={s.id} className="px-6 py-3 flex items-center justify-between">
                <span className="text-sm text-gray-900">{s.name}</span>
                <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                  {s.role === 'league_admin' ? 'Admin' : 'Manager'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
