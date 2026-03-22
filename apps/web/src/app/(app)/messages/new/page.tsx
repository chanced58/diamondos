import type { JSX } from 'react';
import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveTeam } from '@/lib/active-team';
import { getUserAccess } from '@/lib/user-access';
import { CreateChannelForm } from './CreateChannelForm';

export const metadata: Metadata = { title: 'New Channel' };

export default async function NewChannelPage(): Promise<JSX.Element | null> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return null;

  const activeTeam = await getActiveTeam(auth, user.id);
  if (!activeTeam) redirect('/messages');

  const { isCoach } = await getUserAccess(activeTeam.id, user.id);

  if (!isCoach) redirect('/messages');

  return (
    <div className="flex-1 min-h-0 p-8 max-w-lg overflow-y-auto">
      <div className="mb-8">
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
