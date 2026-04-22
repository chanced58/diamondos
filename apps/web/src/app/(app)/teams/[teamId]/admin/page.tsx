import type { JSX } from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getUserAccess } from '@/lib/user-access';
import { TeamBrandingForm } from './TeamBrandingForm';
import { MyProfileForm } from './MyProfileForm';
import { getTeamTier } from '@/lib/team-tier';
import { hasFeature, Feature } from '@baseball/shared';

export const metadata: Metadata = { title: 'Team Admin' };

export default async function TeamAdminPage({
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

  const [membershipResult, teamResult, profileResult, subscriptionTier] = await Promise.all([
    db
      .from('team_members')
      .select('role')
      .eq('team_id', params.teamId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle(),
    db.from('teams').select('name, logo_url, primary_color, secondary_color, created_by').eq('id', params.teamId).single(),
    db.from('user_profiles').select('first_name, last_name, phone').eq('id', user.id).maybeSingle(),
    getTeamTier(params.teamId),
  ]);

  let role = membershipResult.data?.role;
  const team = teamResult.data;

  // Self-healing: if user is the team creator but has no membership, auto-create it
  if (!role && team?.created_by === user.id) {
    await db.from('team_members').upsert(
      { team_id: params.teamId, user_id: user.id, role: 'head_coach', is_active: true },
      { onConflict: 'team_id,user_id' },
    );
    // Also backfill email on profile
    await db
      .from('user_profiles')
      .update({ email: user.email })
      .eq('id', user.id)
      .is('email', null);
    role = 'head_coach';
  }

  const { isPlatformAdmin } = await getUserAccess(params.teamId, user.id);
  const BRANDING_ROLES = ['head_coach', 'assistant_coach', 'athletic_director'];
  if (!isPlatformAdmin && (!role || !BRANDING_ROLES.includes(role))) {
    redirect(`/teams/${params.teamId}/roster`);
  }

  const teamName = team?.name ?? 'Your Team';
  const profile = profileResult.data;

  const cards = [
    {
      href: `/teams/${params.teamId}/admin/users`,
      title: 'Users & Invitations',
      description: 'Manage players, staff, and pending invitations.',
      icon: '👥',
    },
    {
      href: `/teams/${params.teamId}/roster/new`,
      title: 'Add Player',
      description: 'Add a new player to the roster.',
      icon: '⚾',
    },
    {
      href: `/teams/${params.teamId}/roster/staff/new`,
      title: 'Invite Staff',
      description: 'Invite a coach, scorekeeper, or staff member.',
      icon: '📋',
    },
    {
      href: `/teams/${params.teamId}/roster`,
      title: 'Roster',
      description: 'View and manage the full team roster.',
      icon: '📑',
    },
    {
      href: `/teams/${params.teamId}/admin/seasons`,
      title: 'Seasons',
      description: 'Create and manage seasons (Spring, Summer, Fall).',
      icon: '📅',
    },
    {
      href: `/teams/${params.teamId}/admin/integrations`,
      title: 'Integrations',
      description: 'Calendar subscription URL and external-service links.',
      icon: '🔗',
    },
  ];

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Team Admin</h1>
      <p className="text-gray-500 mb-8">{teamName}</p>

      <div className="grid grid-cols-2 gap-4 mb-10">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="bg-white border border-gray-200 rounded-xl p-5 hover:border-brand-300 hover:shadow-sm transition-all group"
          >
            <div className="text-2xl mb-2">{card.icon}</div>
            <h2 className="font-semibold text-gray-900 group-hover:text-brand-700 transition-colors">
              {card.title}
            </h2>
            <p className="text-sm text-gray-500 mt-1">{card.description}</p>
          </Link>
        ))}
      </div>

      {/* My Profile */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">My Profile</h2>
        <p className="text-sm text-gray-500 mb-4">
          Your name and contact info as it appears to the team.
        </p>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <MyProfileForm
            currentFirstName={profile?.first_name ?? ''}
            currentLastName={profile?.last_name ?? ''}
            currentPhone={profile?.phone ?? null}
            email={user.email ?? ''}
          />
        </div>
      </section>

      {/* Team Branding — Pro tier only */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Team Branding</h2>
        {hasFeature(subscriptionTier, Feature.CUSTOM_BRANDING) ? (
          <TeamBrandingForm
            teamId={params.teamId}
            currentLogoUrl={team?.logo_url ?? null}
            currentPrimaryColor={team?.primary_color ?? null}
            currentSecondaryColor={team?.secondary_color ?? null}
          />
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl px-5 py-8 text-center">
            <p className="text-gray-500 text-sm">Custom team branding is available on the Pro plan.</p>
            <p className="text-xs text-gray-400 mt-1">Contact your platform admin to upgrade.</p>
          </div>
        )}
      </section>
    </div>
  );
}
