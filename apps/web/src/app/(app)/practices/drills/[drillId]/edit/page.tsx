import type { JSX } from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getDrillById } from '@baseball/database';
import { PracticeDrillVisibility } from '@baseball/shared';
import { DrillForm } from '../../new/DrillForm';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveTeam } from '@/lib/active-team';
import { getUserAccess } from '@/lib/user-access';
import { createPracticeServiceClient } from '@/lib/practices/authz';

export const metadata: Metadata = { title: 'Edit drill' };

interface Props {
  params: Promise<{ drillId: string }>;
}

export default async function EditDrillPage({ params }: Props): Promise<JSX.Element> {
  const { drillId } = await params;
  const auth = createServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) redirect('/sign-in');
  const activeTeam = await getActiveTeam(auth, user.id);
  if (!activeTeam) notFound();
  const { isCoach } = await getUserAccess(activeTeam.id, user.id);
  if (!isCoach) redirect(`/practices/drills/${drillId}`);

  const supabase = createPracticeServiceClient();
  const drill = await getDrillById(supabase, drillId);
  if (!drill) notFound();
  if (drill.visibility === PracticeDrillVisibility.SYSTEM) {
    redirect(`/practices/drills/${drillId}`);
  }
  if (drill.teamId !== activeTeam.id) notFound();

  return (
    <div className="p-8 max-w-3xl">
      <Link
        href={`/practices/drills/${drillId}`}
        className="text-sm text-brand-700 hover:underline"
      >
        ← Back to drill
      </Link>
      <h1 className="text-2xl font-bold text-gray-900 mt-2 mb-6">Edit drill</h1>
      <DrillForm teamId={activeTeam.id} mode="edit" drill={drill} />
    </div>
  );
}
