import type { JSX } from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveTeam } from '@/lib/active-team';
import { getUserAccess } from '@/lib/user-access';
import { CreateOpponentForm } from './CreateOpponentForm';

export const metadata: Metadata = { title: 'New Opponent Team' };

export default async function NewOpponentPage(): Promise<JSX.Element | null> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) redirect('/login');

  const activeTeam = await getActiveTeam(auth, user.id);
  if (!activeTeam) redirect('/dashboard');

  const { isCoach } = await getUserAccess(activeTeam.id, user.id);
  if (!isCoach) redirect('/games/opponents');

  return (
    <div className="p-8 max-w-lg">
      <div className="mb-6">
        <Link href="/games/opponents" className="text-sm text-brand-700 hover:underline">
          &larr; Back to opponent teams
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">New Opponent Team</h1>
        <p className="text-gray-500 text-sm">{activeTeam.name}</p>
      </div>
      <CreateOpponentForm teamId={activeTeam.id} />
    </div>
  );
}
