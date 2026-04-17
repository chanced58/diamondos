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

  // Fetch teams, leagues, and player profiles for the create form dropdowns
  const [teamsResult, leaguesResult, playerProfilesResult] = await Promise.all([
    db.from('teams').select('id, name').order('name'),
    (db as any).from('leagues').select('id, name').order('name'),
    (db as any)
      .from('player_profiles')
      .select('user_id, handle')
      .order('handle'),
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

  // Resolve display info for player subscriptions (subscriptions has no FK to
  // user_profiles/player_profiles, so fetch separately and build lookup maps).
  const playerUserIds = Array.from(new Set(
    ((subscriptions ?? []) as any[])
      .filter((s) => s.entity_type === 'player' && s.user_id)
      .map((s) => s.user_id as string),
  ));

  const playerProfileByUser = new Map<string, { handle: string }>();
  const userProfileByUser = new Map<
    string,
    { firstName: string | null; lastName: string | null; email: string | null }
  >();
  if (playerUserIds.length > 0) {
    const [ppRes, upRes] = await Promise.all([
      (db as any)
        .from('player_profiles')
        .select('user_id, handle')
        .in('user_id', playerUserIds),
      db
        .from('user_profiles')
        .select('id, first_name, last_name, email')
        .in('id', playerUserIds),
    ]);
    for (const row of (ppRes.data ?? []) as { user_id: string; handle: string }[]) {
      playerProfileByUser.set(row.user_id, { handle: row.handle });
    }
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
  }

  function playerDisplayName(userId: string): string {
    const up = userProfileByUser.get(userId);
    const pp = playerProfileByUser.get(userId);
    const fullName = [up?.firstName, up?.lastName].filter(Boolean).join(' ').trim();
    if (fullName) return pp?.handle ? `${fullName} (@${pp.handle})` : fullName;
    if (pp?.handle) return `@${pp.handle}`;
    return up?.email ?? 'Unknown Player';
  }

  // Build the dropdown list: every player profile, enriched with user name/email
  const playerProfiles = (playerProfilesResult.data ?? []) as { user_id: string; handle: string }[];
  const dropdownPlayerUserIds = playerProfiles.map((p) => p.user_id);
  const dropdownUserProfileMap = new Map<
    string,
    { firstName: string | null; lastName: string | null; email: string | null }
  >();
  if (dropdownPlayerUserIds.length > 0) {
    const { data: dropdownUps } = await db
      .from('user_profiles')
      .select('id, first_name, last_name, email')
      .in('id', dropdownPlayerUserIds);
    for (const row of (dropdownUps ?? []) as {
      id: string;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
    }[]) {
      dropdownUserProfileMap.set(row.id, {
        firstName: row.first_name,
        lastName: row.last_name,
        email: row.email,
      });
    }
  }
  const playersForDropdown = playerProfiles.map((p) => {
    const up = dropdownUserProfileMap.get(p.user_id);
    const name = [up?.firstName, up?.lastName].filter(Boolean).join(' ').trim();
    const label = name ? `${name} (@${p.handle})` : `@${p.handle}`;
    return { id: p.user_id, name: label };
  });

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
            playerHandle:
              entityType === 'player'
                ? (playerProfileByUser.get(s.user_id)?.handle ?? null)
                : null,
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
      />
    </div>
  );
}
