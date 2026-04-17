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
    .single();

  if (!profile?.is_platform_admin) redirect('/admin');

  // Fetch subscriptions with entity names
  const { data: subscriptions } = await (db as any)
    .from('subscriptions')
    .select('*, teams(id, name), leagues(id, name)')
    .order('created_at', { ascending: false });

  // Fetch all teams and leagues for the create form dropdowns
  const [teamsResult, leaguesResult] = await Promise.all([
    db.from('teams').select('id, name').order('name'),
    (db as any).from('leagues').select('id, name').order('name'),
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

  return (
    <div className="p-8 max-w-6xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Billing</h1>
      <p className="text-gray-500 mb-8">Manage subscriptions for teams and leagues.</p>

      <BillingClient
        subscriptions={(subscriptions ?? []).map((s: any) => ({
          id: s.id,
          entityType: s.entity_type,
          entityName: s.entity_type === 'team'
            ? (s.teams?.name ?? 'Unknown Team')
            : (s.leagues?.name ?? 'Unknown League'),
          entityId: s.entity_type === 'team' ? s.team_id : s.league_id,
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
          adminSignedIn: s.entity_type === 'league'
            ? (adminStatusMap.get(s.league_id) ?? null)
            : null,
        }))}
        teams={(teamsResult.data ?? []).map((t: any) => ({ id: t.id, name: t.name }))}
        leagues={(leaguesResult.data ?? []).map((l: any) => ({ id: l.id, name: l.name }))}
      />
    </div>
  );
}
