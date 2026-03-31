import type { JSX } from 'react';
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
    const raw = m.teams as unknown;
    const team = (Array.isArray(raw) ? raw[0] : raw) as { id: string; name: string } | null | undefined;
    return { teamId: m.team_id as string, teamName: team?.name ?? 'Unknown team', role: m.role as string };
  });

  // ── Platform admin view ──────────────────────────────────────────────────
  if (isPlatformAdmin) {
    // Fetch all teams for the environment selector
    const { data: allTeams } = await db
      .from('teams')
      .select('id, name, organization, logo_url, team_members(count)')
      .order('name');

    type AllTeamRow = {
      id: string;
      name: string;
      organization: string | null;
      logo_url: string | null;
      team_members: { count: number }[];
    };

    const teamRows = ((allTeams as unknown as AllTeamRow[]) ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      organization: t.organization,
      logoUrl: t.logo_url,
      memberCount: (t.team_members[0] as unknown as { count: number })?.count ?? 0,
    }));

    return (
      <div className="p-8 max-w-4xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Platform Admin</h1>
        <p className="text-gray-500 mb-8">Full platform administration access.</p>

        {/* Team Environment Selector */}
        <div className="mb-10">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
            Select Team Environment
          </h2>
          {teamRows.length === 0 ? (
            <p className="text-sm text-gray-400">No teams on the platform yet.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {teamRows.map((team) => (
                <a
                  key={team.id}
                  href={`/teams/${team.id}/admin`}
                  className="flex items-center gap-4 bg-white border border-gray-200 rounded-xl px-5 py-4 hover:border-gray-400 hover:shadow-sm transition-all group"
                >
                  <div className="shrink-0 w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-lg font-bold text-gray-400 overflow-hidden">
                    {team.logoUrl ? (
                      <img src={team.logoUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      team.name.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 group-hover:text-gray-700 truncate">{team.name}</p>
                    <p className="text-xs text-gray-500 truncate">
                      {team.organization ?? 'No organization'} &middot; {team.memberCount} member{team.memberCount !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-gray-400 group-hover:text-gray-600 font-medium">
                    Enter &rarr;
                  </span>
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Quick Links */}
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
            Quick Actions
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Link
              href="/admin/branding"
              className="bg-white border border-gray-200 rounded-xl p-5 hover:border-gray-400 hover:shadow-sm transition-all group"
            >
              <div className="text-2xl mb-2">🎨</div>
              <h3 className="font-semibold text-gray-900 group-hover:text-gray-700 transition-colors">
                Site Branding
              </h3>
              <p className="text-sm text-gray-500 mt-1">Logo, colors, and messaging.</p>
            </Link>

            <Link
              href="/admin/teams"
              className="bg-white border border-gray-200 rounded-xl p-5 hover:border-gray-400 hover:shadow-sm transition-all group"
            >
              <div className="text-2xl mb-2">🏟️</div>
              <h3 className="font-semibold text-gray-900 group-hover:text-gray-700 transition-colors">
                All Teams
              </h3>
              <p className="text-sm text-gray-500 mt-1">View and manage every team.</p>
            </Link>

            <Link
              href="/admin/users"
              className="bg-white border border-gray-200 rounded-xl p-5 hover:border-gray-400 hover:shadow-sm transition-all group"
            >
              <div className="text-2xl mb-2">👥</div>
              <h3 className="font-semibold text-gray-900 group-hover:text-gray-700 transition-colors">
                All Users
              </h3>
              <p className="text-sm text-gray-500 mt-1">Browse users and their roles.</p>
            </Link>

            <Link
              href="/admin/leagues"
              className="bg-white border border-gray-200 rounded-xl p-5 hover:border-gray-400 hover:shadow-sm transition-all group"
            >
              <div className="text-2xl mb-2">🏆</div>
              <h3 className="font-semibold text-gray-900 group-hover:text-gray-700 transition-colors">
                All Leagues
              </h3>
              <p className="text-sm text-gray-500 mt-1">View and manage leagues.</p>
            </Link>

            <Link
              href="/admin/create-team"
              className="bg-white border border-gray-200 rounded-xl p-5 hover:border-gray-400 hover:shadow-sm transition-all group"
            >
              <div className="text-2xl mb-2">➕</div>
              <h3 className="font-semibold text-gray-900 group-hover:text-gray-700 transition-colors">
                Create Team
              </h3>
              <p className="text-sm text-gray-500 mt-1">Set up a new team.</p>
            </Link>
          </div>
        </div>
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
            <a
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
            </a>
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
