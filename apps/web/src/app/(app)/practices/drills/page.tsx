import type { JSX } from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveTeam } from '@/lib/active-team';
import { getUserAccess } from '@/lib/user-access';
import { getTeamTier } from '@/lib/team-tier';
import {
  Feature,
  hasFeature,
  PracticeDrill,
  PracticeDrillVisibility,
} from '@baseball/shared';
import { createPracticeServiceClient } from '@/lib/practices/authz';
import { listDrills } from '@baseball/database';
import { DrillLibraryClient } from './DrillLibraryClient';

export const metadata: Metadata = { title: 'Drill library' };

export default async function DrillsPage(): Promise<JSX.Element | null> {
  const auth = createServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return null;

  const activeTeam = await getActiveTeam(auth, user.id);
  if (!activeTeam) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Drill library</h1>
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

  const [{ isCoach }, subscriptionTier] = await Promise.all([
    getUserAccess(activeTeam.id, user.id),
    getTeamTier(activeTeam.id),
  ]);
  const canAccess = subscriptionTier
    ? hasFeature(subscriptionTier, Feature.PRACTICE_PLANNING)
    : false;

  if (!canAccess) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Drill library</h1>
        <div className="bg-white rounded-xl border border-gray-200 px-6 py-12 text-center">
          <p className="text-gray-500 mb-2">
            The drill library is available on the Starter plan and above.
          </p>
          <p className="text-sm text-gray-400">
            Contact your platform admin to upgrade your team subscription.
          </p>
        </div>
      </div>
    );
  }

  const supabase = createPracticeServiceClient();
  const drills: PracticeDrill[] = await listDrills(supabase, activeTeam.id);

  const systemCount = drills.filter(
    (d) => d.visibility === PracticeDrillVisibility.SYSTEM,
  ).length;
  const teamCount = drills.length - systemCount;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Drill library</h1>
          <p className="text-gray-500 text-sm">
            {drills.length} drill{drills.length === 1 ? '' : 's'}
            {' · '}
            {systemCount} curated
            {' · '}
            {teamCount} team-added
          </p>
        </div>
        {isCoach && (
          <Link
            href="/practices/drills/new"
            className="bg-brand-700 text-white font-semibold px-4 py-2 rounded-lg hover:bg-brand-800 transition-colors text-sm"
          >
            + New drill
          </Link>
        )}
      </div>

      <DrillLibraryClient drills={drills} canEdit={isCoach} teamId={activeTeam.id} />
    </div>
  );
}
