import type { JSX } from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveTeam } from '@/lib/active-team';
import { getUserAccess } from '@/lib/user-access';
import { DrillForm } from './DrillForm';

export const metadata: Metadata = { title: 'New drill' };

export default async function NewDrillPage(): Promise<JSX.Element> {
  const auth = createServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) redirect('/sign-in');

  const activeTeam = await getActiveTeam(auth, user.id);
  if (!activeTeam) redirect('/practices/drills');
  const { isCoach } = await getUserAccess(activeTeam.id, user.id);
  if (!isCoach) redirect('/practices/drills');

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-6">
        <Link
          href="/practices/drills"
          className="text-sm text-brand-700 hover:underline"
        >
          ← Back to drill library
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">New drill</h1>
        <p className="text-gray-500 text-sm">
          Save a drill to your team&apos;s library. System drills are read-only.
        </p>
      </div>

      <DrillForm teamId={activeTeam.id} mode="create" />
    </div>
  );
}
