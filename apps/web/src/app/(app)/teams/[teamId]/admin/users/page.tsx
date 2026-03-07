import type { JSX } from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { UsersPageClient } from './UsersPageClient';

export const metadata: Metadata = { title: 'Users & Invitations' };

const ROLE_LABELS: Record<string, string> = {
  head_coach: 'Head Coach',
  assistant_coach: 'Assistant Coach',
  athletic_director: 'Athletic Director',
  scorekeeper: 'Scorekeeper',
  staff: 'Staff',
  player: 'Player',
  parent: 'Parent',
};

export default async function TeamUsersPage({
  params,
}: {
  params: { teamId: string };
}): Promise<JSX.Element | null> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) redirect('/login');

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Verify the requesting user has roster-admin access
  const [membershipResult, profileResult] = await Promise.all([
    db
      .from('team_members')
      .select('role')
      .eq('team_id', params.teamId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle(),
    db.from('user_profiles').select('is_platform_admin').eq('id', user.id).single(),
  ]);

  const myMembership = membershipResult.data;
  const isPlatformAdmin = profileResult.data?.is_platform_admin === true;
  const ROSTER_ADMIN_ROLES = ['head_coach', 'assistant_coach', 'athletic_director'];

  if (!isPlatformAdmin && !ROSTER_ADMIN_ROLES.includes(myMembership?.role ?? '')) {
    redirect(`/teams/${params.teamId}/roster`);
  }

  const [staffMembersResult, parentMembersResult, playersResult, invitationsResult] = await Promise.all([
    // Coaching staff (WITHOUT user_profiles join — fetched separately)
    db
      .from('team_members')
      .select('id, role, user_id')
      .eq('team_id', params.teamId)
      .eq('is_active', true)
      .in('role', ['head_coach', 'assistant_coach', 'athletic_director', 'scorekeeper', 'staff']),

    // Parents (WITHOUT user_profiles join)
    db
      .from('team_members')
      .select('id, role, user_id')
      .eq('team_id', params.teamId)
      .eq('is_active', true)
      .eq('role', 'parent'),

    // Players on the roster
    db
      .from('players')
      .select('id, first_name, last_name, jersey_number, primary_position, email, phone, user_id')
      .eq('team_id', params.teamId)
      .eq('is_active', true)
      .order('last_name'),

    // Pending invitations
    db
      .from('team_invitations')
      .select('id, email, first_name, last_name, phone, role, invited_at, status')
      .eq('team_id', params.teamId)
      .eq('status', 'pending')
      .order('invited_at', { ascending: false }),
  ]);

  // Fetch user profiles separately to avoid PostgREST join issues
  const allMemberRows = [...(staffMembersResult.data ?? []), ...(parentMembersResult.data ?? [])];
  const memberUserIds = allMemberRows.map((m) => m.user_id);
  const profileMap = new Map<string, { first_name: string; last_name: string; email: string | null; phone: string | null }>();

  if (memberUserIds.length > 0) {
    const { data: profiles } = await db
      .from('user_profiles')
      .select('id, first_name, last_name, email, phone')
      .in('id', memberUserIds);
    for (const p of profiles ?? []) {
      profileMap.set(p.id, p);
    }
  }

  const members = (staffMembersResult.data ?? []).map((m: any) => {
    const profile = profileMap.get(m.user_id);
    return {
      id: m.id as string,
      userId: m.user_id as string,
      role: m.role as string,
      firstName: profile?.first_name || null,
      lastName: profile?.last_name || null,
      email: profile?.email ?? null,
      phone: profile?.phone ?? null,
    };
  });

  const players = (playersResult.data ?? []).map((p) => ({
    id: p.id as string,
    firstName: p.first_name as string,
    lastName: p.last_name as string,
    jerseyNumber: p.jersey_number as number | null,
    primaryPosition: p.primary_position as string | null,
    email: p.email as string | null,
    phone: p.phone as string | null,
    hasAccount: !!p.user_id,
  }));

  const pendingInvitations = (invitationsResult.data ?? []).map((inv) => ({
    id: inv.id as string,
    email: inv.email as string,
    firstName: inv.first_name as string | null,
    lastName: inv.last_name as string | null,
    phone: inv.phone as string | null,
    role: inv.role as string,
    invitedAt: inv.invited_at as string,
  }));

  const parentRows = (parentMembersResult.data ?? []).map((m: any) => {
    const profile = profileMap.get(m.user_id);
    return {
      id: m.id as string,
      userId: m.user_id as string,
      firstName: profile?.first_name || null,
      lastName: profile?.last_name || null,
      email: profile?.email ?? null,
      phone: profile?.phone ?? null,
    };
  });

  // Fetch parent→player links
  let parentLinks: { parentUserId: string; playerId: string; playerName: string }[] = [];
  if (parentRows.length > 0) {
    const { data: links } = await db
      .from('parent_player_links')
      .select('parent_user_id, player_id, players(first_name, last_name)')
      .in('parent_user_id', parentRows.map((p) => p.userId));
    parentLinks = (links ?? []).map((l: any) => ({
      parentUserId: l.parent_user_id as string,
      playerId: l.player_id as string,
      playerName: l.players
        ? `${(l.players as any).last_name}, ${(l.players as any).first_name}`
        : 'Unknown',
    }));
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center gap-3 mb-1">
        <Link
          href={`/teams/${params.teamId}/admin`}
          className="text-sm text-brand-700 hover:underline"
        >
          ← Team Admin
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mt-3 mb-8">Users & Invitations</h1>

      <UsersPageClient
        teamId={params.teamId}
        members={members}
        players={players}
        pendingInvitations={pendingInvitations}
        parents={parentRows}
        parentLinks={parentLinks}
        roleLabels={ROLE_LABELS}
        currentUserId={user.id}
      />
    </div>
  );
}
