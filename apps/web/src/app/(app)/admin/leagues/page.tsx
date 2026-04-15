import type { JSX } from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getAllLeagues } from '@baseball/database';
import { InviteLeagueAdminForm } from './invite-league-admin-form';

export const metadata: Metadata = { title: 'All Leagues — Platform Admin' };

export default async function PlatformAdminLeaguesPage(): Promise<JSX.Element | null> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) redirect('/login');

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Gate: platform admin only
  const { data: profile } = await db
    .from('user_profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_platform_admin) redirect('/admin');

  const leagues = await getAllLeagues(db);

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center gap-3 mb-1">
        <Link href="/admin" className="text-sm text-brand-700 hover:underline">
          &larr; Admin
        </Link>
      </div>
      <div className="flex items-center justify-between mt-3 mb-8">
        <h1 className="text-2xl font-bold text-gray-900">All Leagues</h1>
        <Link
          href="/admin/leagues/create"
          className="bg-brand-700 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-brand-800 transition-colors"
        >
          + Create league
        </Link>
      </div>

      <InviteLeagueAdminForm />

      {leagues.length === 0 ? (
        <p className="text-gray-400 text-sm">No leagues yet.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  League
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  State
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Teams
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Staff
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Created
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {leagues.map((league) => (
                <tr key={league.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <span className="font-medium text-gray-900">{league.name}</span>
                    {league.description && (
                      <span className="ml-2 text-xs text-gray-400 truncate">{league.description}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {league.state_code ?? <span className="text-gray-300">&mdash;</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">{league.team_count}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{league.staff_count}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(league.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/leagues/${league.id}`}
                      className="text-xs text-brand-700 hover:underline"
                    >
                      Manage &rarr;
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
