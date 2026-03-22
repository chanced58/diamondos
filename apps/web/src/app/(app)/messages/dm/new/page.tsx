import type { JSX } from 'react';
import { Metadata } from 'next';
import { redirect } from 'next/navigation';
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
  //    Two-step query: PostgREST can't resolve the indirect FK path
  //    (team_members.user_id → auth.users → user_profiles.id)
  const { data: teamMembers, error: tmError } = await db
    .from('team_members')
    .select('user_id, role')
    .eq('team_id', activeTeam.id)
    .neq('user_id', user.id);

  if (tmError) {
    console.error('Failed to fetch team_members:', tmError.message);
    return (
      <div className="flex-1 min-h-0 p-8">
        <p className="text-sm text-red-600">Failed to load team members. Please try again.</p>
      </div>
    );
  }

  // Fetch profiles separately and build a lookup map
  const memberUserIds = (teamMembers ?? []).map((m) => m.user_id);
  const profileMap = new Map<string, { first_name: string; last_name: string }>();

  if (memberUserIds.length > 0) {
    const { data: profiles, error: profError } = await db
      .from('user_profiles')
      .select('id, first_name, last_name')
      .in('id', memberUserIds);

    if (profError) {
      console.error('Failed to fetch user_profiles:', profError.message);
      return (
        <div className="flex-1 min-h-0 p-8">
          <p className="text-sm text-red-600">Failed to load user profiles. Please try again.</p>
        </div>
      );
    }

    for (const p of profiles ?? []) {
      profileMap.set(p.id, { first_name: p.first_name, last_name: p.last_name });
    }
  }

  // 2. Players who have linked user accounts (user_id IS NOT NULL)
  const { data: playersWithAccounts } = await db
    .from('players')
    .select('user_id, first_name, last_name')
    .eq('team_id', activeTeam.id)
    .eq('is_active', true)
    .not('user_id', 'is', null)
    .neq('user_id', user.id);

  // Merge, deduplicating by userId (a player might also be in team_members)
  // Skip team members whose profile could not be resolved
  const seen = new Set<string>();
  const targets: DmTarget[] = [];

  for (const m of teamMembers ?? []) {
    if (seen.has(m.user_id)) continue;
    seen.add(m.user_id);
    const profile = profileMap.get(m.user_id);
    if (!profile) continue;
    targets.push({
      userId:    m.user_id,
      firstName: profile.first_name,
      lastName:  profile.last_name,
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
    <div className="flex-1 min-h-0 p-8 max-w-lg overflow-y-auto">
      <div className="mb-8">
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
