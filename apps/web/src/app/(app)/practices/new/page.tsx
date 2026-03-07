import { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getTeamsForUser } from '@baseball/database';
import { CreatePracticeForm } from './CreatePracticeForm';

export const metadata: Metadata = { title: 'Log Practice' };

export default async function NewPracticePage(): Promise<JSX.Element | null> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return null;

  const teams = await getTeamsForUser(auth, user.id);
  const activeTeam = teams?.[0]?.teams as { id: string; name: string } | undefined;

  if (!activeTeam) {
    return (
      <div className="p-8">
        <p className="text-gray-500">No team found. <Link href="/admin/create-team" className="text-brand-700 hover:underline">Create a team</Link> first.</p>
      </div>
    );
  }

  // Verify coach role
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

  if (!isCoach) {
    return (
      <div className="p-8">
        <p className="text-gray-500">Only coaches can log practices.</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-lg">
      <div className="mb-6">
        <Link href="/practices" className="text-sm text-brand-700 hover:underline">
          ← Back to practices
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">Log a Practice</h1>
        <p className="text-gray-500 text-sm">{activeTeam.name}</p>
      </div>
      <CreatePracticeForm teamId={activeTeam.id} />
    </div>
  );
}
