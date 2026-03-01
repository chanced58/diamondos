import { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { InviteParentForm } from './InviteParentForm';

export const metadata: Metadata = { title: 'Add Parent' };

export default async function InviteParentPage({ params }: { params: { teamId: string } }) {
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

  // Fetch active players for the linked-players checkbox list
  const { data: playersData } = await db
    .from('players')
    .select('id, first_name, last_name, jersey_number')
    .eq('team_id', params.teamId)
    .eq('is_active', true)
    .order('last_name');

  const players = (playersData ?? []).map((p) => ({
    id: p.id,
    firstName: p.first_name,
    lastName: p.last_name,
    jerseyNumber: p.jersey_number,
  }));

  return (
    <div className="p-8 max-w-lg">
      <Link
        href={`/teams/${params.teamId}/roster`}
        className="text-sm text-brand-700 hover:underline"
      >
        ← Back to roster
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mt-4 mb-1">Add Parent</h1>
      <p className="text-gray-500 text-sm mb-6">
        Add a parent or guardian to this team. If you provide their email, they will receive an
        invite to create an account and view their player&apos;s practice notes.
      </p>

      <InviteParentForm teamId={params.teamId} players={players} />
    </div>
  );
}
