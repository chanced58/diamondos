import type { JSX } from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { getUserAccess } from '@/lib/user-access';
import { InviteStaffForm } from './InviteStaffForm';

export const metadata: Metadata = { title: 'Add Coach / Staff' };

export default async function InviteStaffPage({ params }: { params: { teamId: string } }): Promise<JSX.Element | null> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) redirect('/login');

  // Only head coaches, athletic directors, and platform admins can access this page
  const { isPlatformAdmin, role } = await getUserAccess(params.teamId, user.id);

  const canInvite =
    isPlatformAdmin || role === 'head_coach' || role === 'athletic_director';

  if (!canInvite) redirect(`/teams/${params.teamId}/roster`);

  return (
    <div className="p-8 max-w-lg">
      <Link
        href={`/teams/${params.teamId}/roster`}
        className="text-sm text-brand-700 hover:underline"
      >
        ← Back to roster
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mt-4 mb-1">Add Coach / Staff</h1>
      <p className="text-gray-500 text-sm mb-6">
        Invite a coach, athletic director, scorekeeper, or staff member to join this team. They will
        have access to the roster and schedule but not player or parent accounts.
      </p>

      <InviteStaffForm teamId={params.teamId} />
    </div>
  );
}
