import type { JSX } from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { getUserAccess } from '@/lib/user-access';
import { getPracticeWithBlocks } from '@baseball/database';
import { createPracticeServiceClient } from '@/lib/practices/authz';
import { PracticeRunner } from './PracticeRunner';

export const metadata: Metadata = { title: 'Run practice' };

interface Props {
  params: Promise<{ practiceId: string }>;
}

export default async function RunPracticePage({ params }: Props): Promise<JSX.Element> {
  const { practiceId } = await params;
  const auth = createServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) redirect('/sign-in');

  const supabase = createPracticeServiceClient();
  const practice = await getPracticeWithBlocks(supabase, practiceId);
  if (!practice) notFound();

  const { isCoach } = await getUserAccess(practice.teamId, user.id);
  if (!isCoach) redirect(`/practices/${practiceId}`);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <Link
          href={`/practices/${practiceId}/plan`}
          className="text-sm text-brand-700 hover:underline"
        >
          ← Back to plan
        </Link>
        <h1 className="font-semibold text-gray-900">Practice runner</h1>
        <Link
          href={`/practices/${practiceId}/print`}
          className="text-sm text-brand-700 hover:underline"
          target="_blank"
        >
          Print card →
        </Link>
      </header>

      <PracticeRunner practice={practice} />
    </div>
  );
}
