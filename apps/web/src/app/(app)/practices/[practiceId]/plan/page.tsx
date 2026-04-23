import type { JSX } from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { isHeadCoachOrAdRole } from '@baseball/shared';
import { createServerClient } from '@/lib/supabase/server';
import { getUserAccess } from '@/lib/user-access';
import {
  getPracticeWithBlocks,
  listDrills,
  listPitchersWithUsage,
  listTeamCoaches,
  listTemplates,
} from '@baseball/database';
import { createPracticeServiceClient } from '@/lib/practices/authz';
import { PlanEditorV2 } from './PlanEditorV2';

export const metadata: Metadata = { title: 'Practice plan' };

interface Props {
  params: Promise<{ practiceId: string }>;
}

export default async function PracticePlanPage({ params }: Props): Promise<JSX.Element> {
  const { practiceId } = await params;
  const auth = createServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) redirect('/sign-in');

  const supabase = createPracticeServiceClient();
  const practice = await getPracticeWithBlocks(supabase, practiceId);
  if (!practice) notFound();

  const { isCoach, isPlatformAdmin, role } = await getUserAccess(
    practice.teamId,
    user.id,
  );
  if (!isCoach) redirect(`/practices/${practiceId}`);

  const practiceDate = new Date(practice.scheduledAt);
  const [drills, templates, coaches, bullpenCandidates] = await Promise.all([
    listDrills(supabase, practice.teamId),
    listTemplates(supabase, practice.teamId),
    listTeamCoaches(supabase, practice.teamId),
    listPitchersWithUsage(supabase, practice.teamId, practiceDate),
  ]);

  // Platform admins get full-structure privileges without needing a
  // team_members row; otherwise check the user's team role via the shared
  // helper so this stays in lockstep with the DB `is_head_coach_or_ad`.
  const canChangeStructure = isPlatformAdmin ? true : isHeadCoachOrAdRole(role);

  return (
    <div className="p-8">
      <div className="max-w-6xl">
        <Link
          href={`/practices/${practiceId}`}
          className="text-sm text-brand-700 hover:underline"
        >
          ← Back to practice
        </Link>
        <div className="flex items-center justify-between mt-2 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Practice plan</h1>
            <p className="text-gray-500 text-sm">
              {new Date(practice.scheduledAt).toLocaleString(undefined, {
                dateStyle: 'full',
                timeStyle: 'short',
              })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/practices/${practiceId}/run`}
              className="bg-emerald-600 text-white font-semibold px-4 py-2 rounded-lg hover:bg-emerald-700 text-sm"
            >
              ▶ Run practice
            </Link>
            <Link
              href={`/practices/${practiceId}/print`}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-white border border-gray-300 font-semibold px-4 py-2 rounded-lg hover:bg-gray-50 text-sm"
            >
              🖨 Print card
            </Link>
          </div>
        </div>

        <PlanEditorV2
          practice={practice}
          drills={drills}
          templates={templates}
          coaches={coaches}
          bullpenCandidates={bullpenCandidates.pitchers}
          currentUserId={user.id}
          canChangeStructure={canChangeStructure}
        />
      </div>
    </div>
  );
}
