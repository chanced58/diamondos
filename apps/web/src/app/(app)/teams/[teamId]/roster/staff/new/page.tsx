import type { JSX } from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { InviteStaffForm } from './InviteStaffForm';

export const metadata: Metadata = { title: 'Add Coach / Staff' };

export default async function InviteStaffPage({ params }: { params: { teamId: string } }): Promise<JSX.Element | null> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) redirect('/login');

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Only head coaches and athletic directors can access this page
  const { data: membership } = await db
    .from('team_members')
    .select('role')
    .eq('team_id', params.teamId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();

  const canInvite =
    membership?.role === 'head_coach' || membership?.role === 'athletic_director';

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
