import type { JSX } from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveTeam } from '@/lib/active-team';
import { getUserAccess } from '@/lib/user-access';

export const metadata: Metadata = { title: 'Opponent Teams' };

export default async function OpponentsPage(): Promise<JSX.Element | null> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return null;

  const activeTeam = await getActiveTeam(auth, user.id);
  if (!activeTeam) {
    return (
      <div className="p-8">
        <p className="text-gray-500">
          No team found.{' '}
          <Link href="/admin/create-team" className="text-brand-700 hover:underline">
            Create a team
          </Link>{' '}
          first.
        </p>
      </div>
    );
  }

  const { isCoach } = await getUserAccess(activeTeam.id, user.id);
  if (!isCoach) {
    return (
      <div className="p-8">
        <p className="text-gray-500">Only coaches can manage opponent teams.</p>
      </div>
    );
  }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Fetch opponent teams owned by this team
  const { data: opponentTeams } = await db
    .from('opponent_teams')
    .select('id, name, abbreviation, city, state_code')
    .eq('team_id', activeTeam.id)
    .order('name');

  // Get player counts per team
  const teamIds = (opponentTeams ?? []).map((t) => t.id);
  let playerCounts: Record<string, number> = {};
  if (teamIds.length > 0) {
    const { data: counts } = await db
      .from('opponent_players')
      .select('opponent_team_id')
      .in('opponent_team_id', teamIds)
      .eq('is_active', true);
    for (const row of counts ?? []) {
      playerCounts[row.opponent_team_id] = (playerCounts[row.opponent_team_id] ?? 0) + 1;
    }
  }

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <Link href="/games" className="text-sm text-brand-700 hover:underline">
            &larr; Back to schedule
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-2">Opponent Teams</h1>
          <p className="text-gray-500 text-sm">{activeTeam.name}</p>
        </div>
        <Link
          href="/games/opponents/new"
          className="bg-brand-700 text-white font-semibold px-4 py-2 rounded-lg hover:bg-brand-800 transition-colors text-sm"
        >
          + New Opponent
        </Link>
      </div>

      {(opponentTeams ?? []).length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
          <p className="text-gray-500 mb-2">No opponent teams yet.</p>
          <p className="text-sm text-gray-400">
            Create opponent teams to pre-build rosters before games.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-100">
                <th className="px-5 py-3">Team</th>
                <th className="px-5 py-3 w-24">Players</th>
                <th className="px-5 py-3 w-20" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(opponentTeams ?? []).map((t) => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-5 py-4">
                    <Link
                      href={`/games/opponents/${t.id}`}
                      className="font-medium text-gray-900 hover:text-brand-700"
                    >
                      {t.name}
                    </Link>
                    {t.abbreviation && (
                      <span className="ml-2 text-xs text-gray-400">({t.abbreviation})</span>
                    )}
                    {t.city && (
                      <span className="ml-2 text-xs text-gray-400">
                        {t.city}{t.state_code ? `, ${t.state_code}` : ''}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-gray-500">
                    {playerCounts[t.id] ?? 0}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Link
                      href={`/games/opponents/${t.id}`}
                      className="text-xs text-brand-700 hover:underline font-medium"
                    >
                      Manage
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
