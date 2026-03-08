import type { JSX } from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveTeam } from '@/lib/active-team';
import { getUserAccess } from '@/lib/user-access';
import { formatDate, formatTime } from '@baseball/shared';

export const metadata: Metadata = { title: 'Practices' };

export default async function PracticesPage(): Promise<JSX.Element | null> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return null;

  const activeTeam = await getActiveTeam(auth, user.id);

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Check if user is a coach on this team
  const { isCoach } = activeTeam
    ? await getUserAccess(activeTeam.id, user.id)
    : { isCoach: false };

  const { data: practices } = activeTeam
    ? await db
        .from('practices')
        .select('id, scheduled_at, duration_minutes, location')
        .eq('team_id', activeTeam.id)
        .neq('status', 'cancelled')
        .order('scheduled_at', { ascending: false })
    : { data: [] };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Practices</h1>
          {activeTeam && <p className="text-gray-500 text-sm">{activeTeam.name}</p>}
        </div>
        {isCoach && (
          <div className="flex items-center gap-2">
            <Link
              href="/practices/plan"
              className="bg-brand-700 text-white font-semibold px-4 py-2 rounded-lg hover:bg-brand-800 transition-colors text-sm"
            >
              Plan practice
            </Link>
            <Link
              href="/practices/new"
              className="bg-white text-gray-700 font-semibold px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors text-sm"
            >
              + Log practice
            </Link>
          </div>
        )}
      </div>

      {!activeTeam && (
        <div className="text-center py-16 text-gray-400">
          <p>No team found. <Link href="/admin/create-team" className="text-brand-700 hover:underline">Create a team</Link> first.</p>
        </div>
      )}

      {activeTeam && (!practices || practices.length === 0) && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg mb-1">No practices logged yet.</p>
          {isCoach && (
            <div className="flex items-center justify-center gap-4 mt-2">
              <Link href="/practices/plan" className="text-sm text-brand-700 hover:underline">
                Plan a practice →
              </Link>
              <span className="text-gray-300">|</span>
              <Link href="/practices/new" className="text-sm text-gray-500 hover:underline">
                Log a past practice
              </Link>
            </div>
          )}
        </div>
      )}

      {practices && practices.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <ul className="divide-y divide-gray-100">
            {practices.map((practice) => (
              <li key={practice.id}>
                <Link
                  href={`/practices/${practice.id}`}
                  className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
                >
                  <div>
                    <p className="font-medium text-gray-900">{formatDate(practice.scheduled_at)}</p>
                    <p className="text-sm text-gray-500">
                      {formatTime(practice.scheduled_at)}
                      {practice.duration_minutes && ` · ${practice.duration_minutes} min`}
                      {practice.location && ` · ${practice.location}`}
                    </p>
                  </div>
                  <span className="text-gray-400 text-sm">View notes →</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
