import { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Admin' };

export default async function AdminPage(): Promise<JSX.Element | null> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();

  if (!user) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Admin</h1>
        <p className="text-gray-500">Please log in to access the admin panel.</p>
      </div>
    );
  }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Fetch user profile (platform admin flag) and team memberships
  const [profileResult, membershipsResult] = await Promise.all([
    db.from('user_profiles').select('is_platform_admin').eq('id', user.id).single(),
    db
      .from('team_members')
      .select('team_id, role, teams(id, name)')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .in('role', ['head_coach', 'assistant_coach', 'athletic_director']),
  ]);

  const isPlatformAdmin = profileResult.data?.is_platform_admin === true;
  const coachTeams = (membershipsResult.data ?? []).map((m) => {
    const team = m.teams as { id: string; name: string } | null;
    return { teamId: m.team_id as string, teamName: team?.name ?? 'Unknown team', role: m.role as string };
  });

  // ── Platform admin view ──────────────────────────────────────────────────
  if (isPlatformAdmin) {
    return (
      <div className="p-8 max-w-2xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Platform Admin</h1>
        <p className="text-gray-500 mb-8">Full platform administration access.</p>

        <div className="grid grid-cols-2 gap-4 mb-8">
          <Link
            href="/admin/teams"
            className="bg-white border border-gray-200 rounded-xl p-5 hover:border-brand-300 hover:shadow-sm transition-all group"
          >
            <div className="text-2xl mb-2">🏟️</div>
            <h2 className="font-semibold text-gray-900 group-hover:text-brand-700 transition-colors">
              All Teams
            </h2>
            <p className="text-sm text-gray-500 mt-1">View and manage every team on the platform.</p>
          </Link>

          <Link
            href="/admin/users"
            className="bg-white border border-gray-200 rounded-xl p-5 hover:border-brand-300 hover:shadow-sm transition-all group"
          >
            <div className="text-2xl mb-2">👥</div>
            <h2 className="font-semibold text-gray-900 group-hover:text-brand-700 transition-colors">
              All Users
            </h2>
            <p className="text-sm text-gray-500 mt-1">Browse all registered users and their team roles.</p>
          </Link>

          <Link
            href="/admin/create-team"
            className="bg-white border border-gray-200 rounded-xl p-5 hover:border-brand-300 hover:shadow-sm transition-all group"
          >
            <div className="text-2xl mb-2">➕</div>
            <h2 className="font-semibold text-gray-900 group-hover:text-brand-700 transition-colors">
              Create Team
            </h2>
            <p className="text-sm text-gray-500 mt-1">Set up a new team on the platform.</p>
          </Link>
        </div>

        {coachTeams.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Your Teams
            </h2>
            <div className="space-y-2">
              {coachTeams.map((t) => (
                <Link
                  key={t.teamId}
                  href={`/teams/${t.teamId}/admin`}
                  className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-3 hover:border-brand-300 transition-colors"
                >
                  <span className="font-medium text-gray-900">{t.teamName}</span>
                  <span className="text-xs text-gray-400 capitalize">{t.role.replace(/_/g, ' ')}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Team coach view ──────────────────────────────────────────────────────
  if (coachTeams.length > 0) {
    return (
      <div className="p-8 max-w-2xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Admin</h1>
        <p className="text-gray-500 mb-6">Team administration.</p>

        <div className="space-y-2">
          {coachTeams.map((t) => (
            <Link
              key={t.teamId}
              href={`/teams/${t.teamId}/admin`}
              className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-5 py-4 hover:border-brand-300 hover:shadow-sm transition-all"
            >
              <div>
                <p className="font-semibold text-gray-900">{t.teamName}</p>
                <p className="text-sm text-gray-500 capitalize mt-0.5">
                  {t.role.replace(/_/g, ' ')}
                </p>
              </div>
              <span className="text-brand-700 text-sm">Manage →</span>
            </Link>
          ))}
        </div>

        <div className="mt-8">
          <Link
            href="/admin/create-team"
            className="inline-block bg-brand-700 text-white font-semibold px-5 py-2.5 rounded-lg hover:bg-brand-800 transition-colors"
          >
            Create another team
          </Link>
        </div>
      </div>
    );
  }

  // ── Default: no admin role ──────────────────────────────────────────────
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Admin</h1>
      <p className="text-gray-500 mb-6">Team administration and settings.</p>
      <Link
        href="/admin/create-team"
        className="inline-block bg-brand-700 text-white font-semibold px-5 py-2.5 rounded-lg hover:bg-brand-800 transition-colors"
      >
        Create a team
      </Link>
    </div>
  );
}
