import { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'All Teams — Platform Admin' };

export default async function PlatformAdminTeamsPage(): Promise<JSX.Element | null> {
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

  // Fetch all teams with member count
  const { data: teams } = await db
    .from('teams')
    .select('id, name, organization, state_code, created_at, team_members(count)')
    .order('created_at', { ascending: false });

  type TeamRow = {
    id: string;
    name: string;
    organization: string | null;
    state_code: string | null;
    created_at: string;
    team_members: { count: number }[];
  };

  const rows = (teams as TeamRow[] ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    organization: t.organization,
    stateCode: t.state_code,
    createdAt: t.created_at,
    memberCount: (t.team_members[0] as unknown as { count: number })?.count ?? 0,
  }));

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center gap-3 mb-1">
        <Link href="/admin" className="text-sm text-brand-700 hover:underline">
          ← Admin
        </Link>
      </div>
      <div className="flex items-center justify-between mt-3 mb-8">
        <h1 className="text-2xl font-bold text-gray-900">All Teams</h1>
        <Link
          href="/admin/create-team"
          className="bg-brand-700 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-brand-800 transition-colors"
        >
          + Create team
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="text-gray-400 text-sm">No teams yet.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Team
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Organization
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  State
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Members
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Created
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((team) => (
                <tr key={team.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{team.name}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {team.organization ?? <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {team.stateCode ?? <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">{team.memberCount}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(team.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/teams/${team.id}/roster`}
                      className="text-xs text-brand-700 hover:underline"
                    >
                      View roster →
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
