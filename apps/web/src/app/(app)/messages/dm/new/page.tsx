import type { JSX } from 'react';
import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveTeam } from '@/lib/active-team';
import { startDmAction } from './actions';

export const metadata: Metadata = { title: 'New Direct Message' };

type DmTarget = {
  userId: string;
  firstName: string;
  lastName: string;
  roleLabel: string;
};

const ROLE_LABELS: Record<string, string> = {
  head_coach:        'Head Coach',
  assistant_coach:   'Asst. Coach',
  athletic_director: 'Athletic Director',
  player:            'Player',
  parent:            'Parent',
};

export default async function NewDmPage(): Promise<JSX.Element | null> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return null;

  const activeTeam = await getActiveTeam(auth, user.id);
  if (!activeTeam) redirect('/messages');

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // 1. Team members with accounts (coaches, parents, athletic directors, etc.)
  const { data: teamMembers } = await db
    .from('team_members')
    .select('user_id, role, user_profiles(first_name, last_name)')
    .eq('team_id', activeTeam.id)
    .neq('user_id', user.id);

  // 2. Players who have linked user accounts (user_id IS NOT NULL)
  const { data: playersWithAccounts } = await db
    .from('players')
    .select('user_id, first_name, last_name')
    .eq('team_id', activeTeam.id)
    .eq('is_active', true)
    .not('user_id', 'is', null)
    .neq('user_id', user.id);

  // Merge, deduplicating by userId (a player might also be in team_members)
  const seen = new Set<string>();
  const targets: DmTarget[] = [];

  for (const m of teamMembers ?? []) {
    if (seen.has(m.user_id)) continue;
    seen.add(m.user_id);
    const profile = m.user_profiles as any;
    targets.push({
      userId:    m.user_id,
      firstName: profile?.first_name ?? '',
      lastName:  profile?.last_name  ?? '',
      roleLabel: ROLE_LABELS[m.role] ?? m.role,
    });
  }

  for (const p of playersWithAccounts ?? []) {
    if (!p.user_id || seen.has(p.user_id)) continue;
    seen.add(p.user_id);
    targets.push({
      userId:    p.user_id,
      firstName: p.first_name,
      lastName:  p.last_name,
      roleLabel: 'Player',
    });
  }

  // Sort alphabetically by last name
  targets.sort((a, b) =>
    `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`),
  );

  return (
    <div className="p-8 max-w-lg">
      <Link href="/messages" className="text-sm text-brand-700 hover:underline">
        ← Back to messages
      </Link>

      <div className="mt-4 mb-8">
        <h1 className="text-2xl font-bold text-gray-900">New Direct Message</h1>
        <p className="text-gray-500 text-sm mt-1">Select a teammate to start a conversation.</p>
      </div>

      {targets.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-xl px-5 py-8 text-center text-sm text-gray-400">
          <p>No other team members with accounts found.</p>
          <p className="mt-1 text-xs">
            Team members can message once they&apos;ve signed in to the app.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <ul className="divide-y divide-gray-100">
            {targets.map((t) => {
              const initials =
                `${t.firstName?.[0] ?? ''}${t.lastName?.[0] ?? ''}`.toUpperCase() || '?';

              return (
                <li key={t.userId}>
                  <form action={startDmAction}>
                    <input type="hidden" name="teamId" value={activeTeam.id} />
                    <input type="hidden" name="targetUserId" value={t.userId} />
                    <button
                      type="submit"
                      className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors text-left"
                    >
                      <div className="w-9 h-9 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-sm font-bold shrink-0">
                        {initials}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {t.firstName} {t.lastName}
                        </p>
                        <p className="text-xs text-gray-400">{t.roleLabel}</p>
                      </div>
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
