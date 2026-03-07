import { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'All Users — Platform Admin' };

const ROLE_LABELS: Record<string, string> = {
  head_coach: 'Head Coach',
  assistant_coach: 'Asst. Coach',
  athletic_director: 'AD',
  scorekeeper: 'Scorekeeper',
  staff: 'Staff',
  player: 'Player',
};

const ROLE_COLORS: Record<string, string> = {
  head_coach: 'bg-brand-50 text-brand-700 border-brand-200',
  assistant_coach: 'bg-blue-50 text-blue-700 border-blue-200',
  athletic_director: 'bg-purple-50 text-purple-700 border-purple-200',
  scorekeeper: 'bg-gray-100 text-gray-600 border-gray-200',
  staff: 'bg-gray-100 text-gray-600 border-gray-200',
  player: 'bg-green-50 text-green-700 border-green-200',
};

export default async function PlatformAdminUsersPage(): Promise<JSX.Element | null> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) redirect('/login');

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Gate: platform admin only
  const { data: myProfile } = await db
    .from('user_profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .single();

  if (!myProfile?.is_platform_admin) redirect('/admin');

  // Fetch all user profiles with their team memberships and team names
  const { data: profiles } = await db
    .from('user_profiles')
    .select(`
      id,
      first_name,
      last_name,
      email,
      phone,
      is_platform_admin,
      team_members(role, is_active, teams(id, name))
    `)
    .order('last_name', { ascending: true });

  type TeamMemberRow = {
    role: string;
    is_active: boolean;
    teams: { id: string; name: string } | null;
  };

  type ProfileRow = {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    is_platform_admin: boolean;
    team_members: TeamMemberRow[];
  };

  const rows = (profiles as ProfileRow[] ?? []).map((p) => ({
    id: p.id,
    firstName: p.first_name,
    lastName: p.last_name,
    email: p.email,
    phone: p.phone,
    isPlatformAdmin: p.is_platform_admin,
    teamRoles: (p.team_members ?? [])
      .filter((m) => m.is_active && m.teams)
      .map((m) => ({
        teamId: m.teams!.id,
        teamName: m.teams!.name,
        role: m.role,
      })),
  }));

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center gap-3 mb-1">
        <Link href="/admin" className="text-sm text-brand-700 hover:underline">
          ← Admin
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mt-3 mb-8">
        All Users
        <span className="ml-2 text-base font-normal text-gray-400">{rows.length}</span>
      </h1>

      {rows.length === 0 ? (
        <p className="text-gray-400 text-sm">No users yet.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Name
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Email
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Teams & Roles
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Access
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50 transition-colors align-top">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {u.firstName || u.lastName
                      ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim()
                      : <span className="text-gray-400 italic">No name</span>}
                    {u.phone && (
                      <div className="text-xs text-gray-400">{u.phone}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {u.email ?? <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {u.teamRoles.length === 0 ? (
                      <span className="text-gray-300 text-xs">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {u.teamRoles.map((tr) => (
                          <Link
                            key={tr.teamId}
                            href={`/teams/${tr.teamId}/roster`}
                            className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border hover:opacity-80 transition-opacity ${
                              ROLE_COLORS[tr.role] ?? 'bg-gray-100 text-gray-600 border-gray-200'
                            }`}
                          >
                            {tr.teamName}
                            <span className="opacity-70">·</span>
                            {ROLE_LABELS[tr.role] ?? tr.role}
                          </Link>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {u.isPlatformAdmin && (
                      <span className="text-xs bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded-full">
                        Platform Admin
                      </span>
                    )}
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
