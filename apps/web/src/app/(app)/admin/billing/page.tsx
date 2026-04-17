import type { JSX } from 'react';
import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { BillingClient } from './BillingClient';

export const metadata: Metadata = { title: 'Billing — Platform Admin' };

export default async function BillingPage(): Promise<JSX.Element> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) redirect('/login');

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: profile } = await db
    .from('user_profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.is_platform_admin) redirect('/admin');

  // Fetch subscriptions with entity names
  const { data: subscriptions } = await (db as any)
    .from('subscriptions')
    .select('*, teams(id, name), leagues(id, name)')
    .order('created_at', { ascending: false });

  // Fetch teams, leagues, and player profiles for the create form dropdowns.
  // Bound player_profiles — once the base grows, replace the plain <select>
  // with a server-backed typeahead. `hasMorePlayers` surfaces the truncation
  // to the UI so admins know to search more narrowly.
  const PLAYER_DROPDOWN_LIMIT = 500;
  const [teamsResult, leaguesResult, playerProfilesResult] = await Promise.all([
    db.from('teams').select('id, name').order('name'),
    (db as any).from('leagues').select('id, name').order('name'),
    (db as any)
      .from('player_profiles')
      .select('user_id, handle')
      .order('handle')
      .limit(PLAYER_DROPDOWN_LIMIT + 1),
  ]);

  // Resolve league admin sign-in status for league subscriptions
  const leagueIds = (subscriptions ?? [])
    .filter((s: any) => s.entity_type === 'league' && s.league_id)
    .map((s: any) => s.league_id as string);

  const adminStatusMap = new Map<string, boolean>();
  if (leagueIds.length > 0) {
    const { data: staffRows } = await db
      .from('league_staff')
      .select('league_id, user_profiles(has_set_password)')
      .in('league_id', leagueIds)
      .eq('role', 'league_admin')
      .eq('is_active', true);

    for (const row of staffRows ?? []) {
      const p = Array.isArray(row.user_profiles) ? row.user_profiles[0] : row.user_profiles;
      adminStatusMap.set(row.league_id, p?.has_set_password === true);
    }
  }

  // Build a combined set of user_ids from (a) subscriptions that point at
  // players and (b) the dropdown list, so we only issue one user_profiles
  // and one player_profiles lookup to populate display labels. Note the
  // dropdown is already bounded by PLAYER_DROPDOWN_LIMIT.
  const rawPlayerProfiles = (playerProfilesResult.data ?? []) as {
    user_id: string;
    handle: string;
  }[];
  const hasMorePlayers = rawPlayerProfiles.length > PLAYER_DROPDOWN_LIMIT;
  const playerProfilesForDropdown = hasMorePlayers
    ? rawPlayerProfiles.slice(0, PLAYER_DROPDOWN_LIMIT)
    : rawPlayerProfiles;

  const playerProfileByUser = new Map<string, { handle: string }>();
  for (const row of rawPlayerProfiles) {
    playerProfileByUser.set(row.user_id, { handle: row.handle });
  }

  const subscriptionPlayerUserIds = ((subscriptions ?? []) as any[])
    .filter((s) => s.entity_type === 'player' && s.user_id)
    .map((s) => s.user_id as string);

  const allPlayerUserIds = Array.from(
    new Set<string>([
      ...subscriptionPlayerUserIds,
      ...playerProfilesForDropdown.map((p) => p.user_id),
    ]),
  );

  // One lookup covers both subscription enrichment AND the dropdown labels.
  const userProfileByUser = new Map<
    string,
    { firstName: string | null; lastName: string | null; email: string | null }
  >();
  if (allPlayerUserIds.length > 0) {
    // Subscription user_ids may point at users whose player_profiles row was
    // deleted — fetch those too so the handle lookup is complete.
    const missingProfileIds = subscriptionPlayerUserIds.filter(
      (id) => !playerProfileByUser.has(id),
    );
    const [upRes, extraPpRes] = await Promise.all([
      db
        .from('user_profiles')
        .select('id, first_name, last_name, email')
        .in('id', allPlayerUserIds),
      missingProfileIds.length > 0
        ? (db as any)
            .from('player_profiles')
            .select('user_id, handle')
            .in('user_id', missingProfileIds)
        : Promise.resolve({ data: [] as { user_id: string; handle: string }[] }),
    ]);
    for (const row of (upRes.data ?? []) as {
      id: string;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
    }[]) {
      userProfileByUser.set(row.id, {
        firstName: row.first_name,
        lastName: row.last_name,
        email: row.email,
      });
    }
    for (const row of (extraPpRes.data ?? []) as { user_id: string; handle: string }[]) {
      playerProfileByUser.set(row.user_id, { handle: row.handle });
    }
  }

  function playerDisplayName(userId: string): string {
    const up = userProfileByUser.get(userId);
    const pp = playerProfileByUser.get(userId);
    const fullName = [up?.firstName, up?.lastName].filter(Boolean).join(' ').trim();
    if (fullName) return pp?.handle ? `${fullName} (@${pp.handle})` : fullName;
    if (pp?.handle) return `@${pp.handle}`;
    return up?.email ?? 'Unknown Player';
  }

  const playersForDropdown = playerProfilesForDropdown.map((p) => ({
    id: p.user_id,
    name: playerDisplayName(p.user_id),
  }));

  return (
    <div className="p-8 max-w-6xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Billing</h1>
      <p className="text-gray-500 mb-8">Manage subscriptions for teams, leagues, and players.</p>

      <BillingClient
        subscriptions={(subscriptions ?? []).map((s: any) => {
          const entityType = s.entity_type as 'team' | 'league' | 'player';
          const entityName =
            entityType === 'team'
              ? (s.teams?.name ?? 'Unknown Team')
              : entityType === 'league'
                ? (s.leagues?.name ?? 'Unknown League')
                : playerDisplayName(s.user_id);
          const entityId =
            entityType === 'team'
              ? s.team_id
              : entityType === 'league'
                ? s.league_id
                : s.user_id;
          return {
            id: s.id,
            entityType,
            entityName,
            entityId,
            tier: s.tier,
            status: s.status,
            billingContactName: s.billing_contact_name,
            billingContactEmail: s.billing_contact_email,
            trialStartsAt: s.trial_starts_at,
            trialEndsAt: s.trial_ends_at,
            startsAt: s.starts_at,
            endsAt: s.ends_at,
            monthlyPriceCents: s.monthly_price_cents,
            notes: s.notes,
            zohoAccountId: s.zoho_account_id,
            createdAt: s.created_at,
            adminSignedIn:
              entityType === 'league'
                ? (adminStatusMap.get(s.league_id) ?? null)
                : null,
          };
        })}
        teams={(teamsResult.data ?? []).map((t: any) => ({ id: t.id, name: t.name }))}
        leagues={(leaguesResult.data ?? []).map((l: any) => ({ id: l.id, name: l.name }))}
        players={playersForDropdown}
        hasMorePlayers={hasMorePlayers}
      />
    </div>
  );
}
