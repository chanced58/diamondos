import type { JSX } from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getUserAccess } from '@/lib/user-access';
import { SeasonManager } from './SeasonManager';

export const metadata: Metadata = { title: 'Seasons' };

export default async function SeasonsPage({
  params,
}: {
  params: { teamId: string };
}): Promise<JSX.Element | null> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) redirect('/login');

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { isCoach, isPlatformAdmin } = await getUserAccess(params.teamId, user.id);
  if (!isCoach && !isPlatformAdmin) {
    redirect(`/teams/${params.teamId}/roster`);
  }

  const { data: seasons } = await db
    .from('seasons')
    .select('id, name, start_date, end_date, is_active')
    .eq('team_id', params.teamId)
    .order('start_date', { ascending: false });

  return (
    <div className="p-8 max-w-2xl">
      <Link
        href={`/teams/${params.teamId}/admin`}
        className="text-sm text-brand-700 hover:underline"
      >
        ← Back to admin
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mt-4 mb-6">Seasons</h1>

      <SeasonManager teamId={params.teamId} seasons={seasons ?? []} />
    </div>
  );
}
