import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getTeamsForUser } from '@baseball/database';
import { CreateChannelForm } from './CreateChannelForm';

export const metadata: Metadata = { title: 'New Channel' };

export default async function NewChannelPage(): Promise<JSX.Element | null> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return null;

  const teams = await getTeamsForUser(auth, user.id);
  const activeTeam = teams?.[0]?.teams as { id: string; name: string } | undefined;
  if (!activeTeam) redirect('/messages');

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: membership } = await db
    .from('team_members')
    .select('role')
    .eq('team_id', activeTeam.id)
    .eq('user_id', user.id)
    .single();

  const isCoach =
    membership?.role === 'head_coach' ||
    membership?.role === 'assistant_coach' ||
    membership?.role === 'athletic_director';

  if (!isCoach) redirect('/messages');

  return (
    <div className="p-8 max-w-lg">
      <Link href="/messages" className="text-sm text-brand-700 hover:underline">
        ← Back to messages
      </Link>

      <div className="mt-4 mb-8">
        <h1 className="text-2xl font-bold text-gray-900">New Channel</h1>
        <p className="text-gray-500 text-sm mt-1">
          All current team members will be added automatically.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <CreateChannelForm teamId={activeTeam.id} />
      </div>
    </div>
  );
}
