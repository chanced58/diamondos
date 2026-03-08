import type { JSX } from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { AllUsersTable } from './AllUsersClient';

export const metadata: Metadata = { title: 'All Users — Platform Admin' };

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

  // Fetch profiles and team memberships separately to avoid PostgREST join issues
  // (no direct FK between user_profiles and team_members — both reference auth.users)
  const [profilesResult, membershipsResult] = await Promise.all([
    db
      .from('user_profiles')
      .select('id, first_name, last_name, email, phone, is_platform_admin')
      .order('last_name', { ascending: true }),
    db
      .from('team_members')
      .select('user_id, role, is_active, teams(id, name)')
      .eq('is_active', true),
  ]);

  // Build a map of user_id -> team roles
  type MemberRow = {
    user_id: string;
    role: string;
    is_active: boolean;
    teams: { id: string; name: string } | { id: string; name: string }[] | null;
  };

  const teamRolesMap = new Map<string, { teamId: string; teamName: string; role: string }[]>();
  for (const m of (membershipsResult.data as unknown as MemberRow[]) ?? []) {
    if (!m.teams) continue;
    const team = Array.isArray(m.teams) ? m.teams[0] : m.teams;
    if (!team) continue;
    const entry = { teamId: team.id, teamName: team.name, role: m.role };
    const existing = teamRolesMap.get(m.user_id);
    if (existing) existing.push(entry);
    else teamRolesMap.set(m.user_id, [entry]);
  }

  const rows = (profilesResult.data ?? []).map((p: any) => ({
    id: p.id as string,
    firstName: p.first_name as string | null,
    lastName: p.last_name as string | null,
    email: p.email as string | null,
    phone: p.phone as string | null,
    isPlatformAdmin: p.is_platform_admin === true,
    teamRoles: teamRolesMap.get(p.id) ?? [],
  }));

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center gap-3 mb-1">
        <Link href="/admin" className="text-sm text-brand-700 hover:underline">
          &larr; Admin
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mt-3 mb-8">
        All Users
        <span className="ml-2 text-base font-normal text-gray-400">{rows.length}</span>
      </h1>

      {rows.length === 0 ? (
        <p className="text-gray-400 text-sm">No users yet.</p>
      ) : (
        <AllUsersTable users={rows} currentUserId={user.id} />
      )}
    </div>
  );
}
