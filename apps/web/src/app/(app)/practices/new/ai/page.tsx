import type { JSX } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveTeam } from '@/lib/active-team';
import { getUserAccess } from '@/lib/user-access';
import { NLPracticeForm } from './NLPracticeForm';

export const metadata: Metadata = { title: 'Generate practice with AI' };

export default async function AiPracticeNewPage(): Promise<JSX.Element | null> {
  const auth = createServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return null;

  const activeTeam = await getActiveTeam(auth, user.id);
  if (!activeTeam) {
    return (
      <div className="p-8">
        <p className="text-gray-500">
          No team found.{' '}
          <Link href="/admin/create-team" className="text-brand-700 hover:underline">
            Create a team
          </Link>{' '}
          first.
        </p>
      </div>
    );
  }

  const { isCoach } = await getUserAccess(activeTeam.id, user.id);
  if (!isCoach) {
    return (
      <div className="p-8 text-gray-500">
        Only coaches can generate AI practices.
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-6">
        <Link href="/practices" className="text-sm text-brand-700 hover:underline">
          ← Back to practices
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">
          Generate a practice with AI
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Describe what you want to work on. Claude drafts a plan from your
          team&apos;s drill library — you can review and save it as a draft
          practice.
        </p>
      </div>

      <NLPracticeForm teamId={activeTeam.id} />
    </div>
  );
}
