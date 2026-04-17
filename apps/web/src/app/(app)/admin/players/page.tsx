import type { JSX } from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { PlayerAdminRow, type PlayerAdminRowData } from './PlayerAdminRow';

export const metadata: Metadata = { title: 'Player Pro — Platform Admin' };

export default async function AdminPlayersPage(): Promise<JSX.Element> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) redirect('/login');

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: myProfile } = await db
    .from('user_profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .single();
  if (!myProfile?.is_platform_admin) redirect('/admin');

  const [profilesResult, subsResult, userProfilesResult] = await Promise.all([
    db
      .from('player_profiles')
      .select('user_id, handle, is_public, created_at')
      .order('created_at', { ascending: false }),
    db
      .from('subscriptions')
      .select('user_id, status')
      .eq('entity_type', 'player')
      .in('status', ['active', 'trial']),
    db.from('user_profiles').select('id, first_name, last_name, email'),
  ]);

  type ProfileRow = {
    user_id: string;
    handle: string;
    is_public: boolean;
    created_at: string;
  };
  const profiles = (profilesResult.data ?? []) as ProfileRow[];

  type SubRow = { user_id: string; status: string };
  const proUserIds = new Set(
    ((subsResult.data ?? []) as SubRow[]).map((s) => s.user_id),
  );

  type UserProfileRow = {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  };
  const userProfileMap = new Map<string, UserProfileRow>();
  for (const up of (userProfilesResult.data ?? []) as UserProfileRow[]) {
    userProfileMap.set(up.id, up);
  }

  const rows: PlayerAdminRowData[] = profiles.map((p) => {
    const up = userProfileMap.get(p.user_id);
    return {
      userId: p.user_id,
      handle: p.handle,
      firstName: up?.first_name ?? null,
      lastName: up?.last_name ?? null,
      email: up?.email ?? null,
      isPublic: p.is_public,
      isPro: proUserIds.has(p.user_id),
      createdAt: p.created_at,
    };
  });

  return (
    <div className="p-8 max-w-6xl">
      <Link href="/admin" className="text-sm text-brand-700 hover:underline">
        ← Admin
      </Link>
      <h1 className="text-2xl font-bold text-gray-900 mt-3 mb-2">
        Player Pro
        <span className="ml-2 text-base font-normal text-gray-400">{rows.length}</span>
      </h1>
      <p className="text-sm text-gray-500 mb-8">
        Activate Pro to unlock public profiles, highlight videos, and gallery uploads.
      </p>

      {rows.length === 0 ? (
        <p className="text-gray-400 text-sm">No player profiles yet.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="min-w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-3">Player</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-3">Handle</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-3">Visibility</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-3">Tier</th>
                <th className="text-right text-xs font-semibold text-gray-500 uppercase px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <PlayerAdminRow key={r.userId} row={r} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
