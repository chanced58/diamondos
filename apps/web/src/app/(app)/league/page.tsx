import type { JSX } from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveTeam } from '@/lib/active-team';
import { getActiveLeague } from '@/lib/active-league';
import { getLeagueAccess } from '@/lib/league-access';
import { getLeagueTeams, getLeagueDivisions, getLeagueStaff } from '@baseball/database';

export const metadata: Metadata = { title: 'League' };

export default async function LeaguePage(): Promise<JSX.Element | null> {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const activeTeam = await getActiveTeam(supabase, user.id);
  if (!activeTeam) redirect('/dashboard');

  const league = await getActiveLeague(activeTeam.id);
  if (!league) {
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

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const [teams, divisions, staff, access] = await Promise.all([
    getLeagueTeams(db, league.id),
    getLeagueDivisions(db, league.id),
    getLeagueStaff(db, league.id),
    getLeagueAccess(league.id, user.id),
  ]);

  // Build standings from completed games
  const teamIds = teams.map((t) => t.team_id);
  const { data: completedGames } = await db
    .from('games')
    .select('team_id, home_score, away_score, location_type, neutral_home_team, status')
    .in('team_id', teamIds)
    .eq('status', 'completed');

  type TeamRecord = { wins: number; losses: number; ties: number };
  const records = new Map<string, TeamRecord>();
  for (const tid of teamIds) {
    records.set(tid, { wins: 0, losses: 0, ties: 0 });
  }
  for (const g of completedGames ?? []) {
    const rec = records.get(g.team_id);
    if (!rec) continue;
    const isHome = g.location_type === 'home' || (g.location_type === 'neutral' && g.neutral_home_team === null);
    const our = isHome ? g.home_score : g.away_score;
    const their = isHome ? g.away_score : g.home_score;
    if (our > their) rec.wins++;
    else if (our < their) rec.losses++;
    else rec.ties++;
  }

  // Group teams by division
  const divisionMap = new Map<string | null, typeof teams>();
  for (const t of teams) {
    const divId = t.division_id;
    if (!divisionMap.has(divId)) divisionMap.set(divId, []);
    divisionMap.get(divId)!.push(t);
  }

  const divisionNames = new Map(divisions.map((d) => [d.id, d.name]));

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{league.name}</h1>
          {league.description && (
            <p className="text-gray-500 mt-1">{league.description}</p>
          )}
        </div>
        {access.isLeagueStaff && (
          <Link
            href="/league/admin"
            className="text-sm font-medium bg-brand-700 text-white px-4 py-2 rounded-lg hover:bg-brand-800 transition-colors"
          >
            Manage League
          </Link>
        )}
      </div>

      {/* Standings by division */}
      <div className="space-y-6">
        {[...divisionMap.entries()]
          .sort(([a], [b]) => {
            if (a === null) return 1;
            if (b === null) return -1;
            return (divisionNames.get(a) ?? '').localeCompare(divisionNames.get(b) ?? '');
          })
          .map(([divId, divTeams]) => (
            <div key={divId ?? 'none'} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900">
                  {divId ? divisionNames.get(divId) ?? 'Division' : divisions.length > 0 ? 'Unassigned' : 'Teams'}
                </h2>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <th className="px-6 py-3">Team</th>
                    <th className="px-4 py-3 text-center">W</th>
                    <th className="px-4 py-3 text-center">L</th>
                    <th className="px-4 py-3 text-center">T</th>
                    <th className="px-4 py-3 text-center">PCT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {divTeams
                    .map((t) => {
                      const rec = records.get(t.team_id) ?? { wins: 0, losses: 0, ties: 0 };
                      const total = rec.wins + rec.losses + rec.ties;
                      const pct = total > 0 ? rec.wins / total : 0;
                      return { ...t, rec, pct };
                    })
                    .sort((a, b) => b.pct - a.pct)
                    .map((t) => (
                      <tr key={t.team_id} className={t.team_id === activeTeam.id ? 'bg-brand-50' : ''}>
                        <td className="px-6 py-3 font-medium text-gray-900">
                          {t.teams.name}
                          {t.teams.organization && (
                            <span className="ml-2 text-xs text-gray-400">{t.teams.organization}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center tabular-nums">{t.rec.wins}</td>
                        <td className="px-4 py-3 text-center tabular-nums">{t.rec.losses}</td>
                        <td className="px-4 py-3 text-center tabular-nums">{t.rec.ties}</td>
                        <td className="px-4 py-3 text-center tabular-nums font-mono">
                          {t.pct.toFixed(3).replace(/^0/, '')}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ))}
      </div>

      {/* League Staff */}
      {staff.length > 0 && (
        <div className="mt-6 bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">League Staff</h2>
          </div>
          <ul className="divide-y divide-gray-100">
            {staff.map((s) => {
              const profile = Array.isArray(s.user_profiles) ? s.user_profiles[0] : s.user_profiles;
              const name = profile
                ? `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || profile.email
                : 'Unknown';
              return (
                <li key={s.id} className="px-6 py-3 flex items-center justify-between">
                  <span className="text-sm text-gray-900">{name}</span>
                  <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                    {s.role === 'league_admin' ? 'Admin' : 'Manager'}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
