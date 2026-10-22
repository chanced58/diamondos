import type { JSX } from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveTeam } from '@/lib/active-team';
import { getActiveLeague } from '@/lib/active-league';
import type { Database } from '@baseball/database';
import { loadTeamComparison, winPct } from '@/lib/stats/team-comparison';

export const metadata: Metadata = { title: 'Team Comparison' };

export default async function TeamComparisonPage(): Promise<JSX.Element | null> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) redirect('/login');

  const activeTeam = await getActiveTeam(auth, user.id);
  if (!activeTeam) redirect('/dashboard');

  const league = await getActiveLeague(activeTeam.id);
  if (!league) redirect('/compliance');

  const db = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const rows = await loadTeamComparison(db, league.id);
  if (rows.length === 0) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-gray-900">Team Comparison</h1>
        <p className="text-gray-500 mt-2">No teams in this league yet.</p>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Team Comparison</h1>
          <Link
            href="/compliance/league"
            className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg hover:bg-amber-100 transition-colors"
          >
            Player Stats
          </Link>
          <Link
            href="/compliance"
            className="text-xs font-medium text-gray-600 bg-gray-100 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Team Stats
          </Link>
        </div>
        <p className="text-gray-500 text-sm mt-2">{league.name}</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <th className="px-6 py-3 sticky left-0 bg-white">Team</th>
                <th className="px-4 py-3 text-center">GP</th>
                <th className="px-4 py-3 text-center">W</th>
                <th className="px-4 py-3 text-center">L</th>
                <th className="px-4 py-3 text-center">T</th>
                <th className="px-4 py-3 text-center">PCT</th>
                <th className="px-4 py-3 text-center">RS</th>
                <th className="px-4 py-3 text-center">RA</th>
                <th className="px-4 py-3 text-center">AVG</th>
                <th className="px-4 py-3 text-center">ERA</th>
                <th className="px-4 py-3 text-center">H</th>
                <th className="px-4 py-3 text-center">K</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => {
                const pct = winPct(r);
                const isMyTeam = r.teamId === activeTeam.id;
                return (
                  <tr key={r.teamId} className={isMyTeam ? 'bg-brand-50' : ''}>
                    <td className={`px-6 py-3 font-medium text-gray-900 sticky left-0 ${isMyTeam ? 'bg-brand-50' : 'bg-white'}`}>
                      {r.teamName}
                      {r.isOpponentTeam && (
                        <span className="ml-2 text-xs font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">Opponent</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center tabular-nums">{r.gamesPlayed}</td>
                    <td className="px-4 py-3 text-center tabular-nums">{r.wins}</td>
                    <td className="px-4 py-3 text-center tabular-nums">{r.losses}</td>
                    <td className="px-4 py-3 text-center tabular-nums">{r.ties}</td>
                    <td className="px-4 py-3 text-center tabular-nums font-mono">
                      {pct.toFixed(3).replace(/^0/, '')}
                    </td>
                    <td className="px-4 py-3 text-center tabular-nums">{r.runsScored}</td>
                    <td className="px-4 py-3 text-center tabular-nums">{r.runsAllowed}</td>
                    <td className="px-4 py-3 text-center tabular-nums font-mono">
                      {r.teamAvg.toFixed(3).replace(/^0/, '')}
                    </td>
                    <td className="px-4 py-3 text-center tabular-nums font-mono">
                      {r.teamEra.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-center tabular-nums">{r.totalHits}</td>
                    <td className="px-4 py-3 text-center tabular-nums">{r.totalStrikeouts}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
