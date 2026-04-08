'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';

async function getAdminClient() {
  const authClient = createServerClient();
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) throw new Error('Not authenticated');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_platform_admin) throw new Error('Platform admin access required');

  return supabase;
}

const VALID_TIERS = ['free', 'starter', 'pro'] as const;
const VALID_STATUSES = ['active', 'trial', 'past_due', 'cancelled', 'expired'] as const;

function parseCents(value: string | null): number | null {
  if (!value) return null;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export async function createSubscription(formData: FormData) {
  try {
    const supabase = await getAdminClient();

    const entityType = formData.get('entityType') as string;
    const teamId = (formData.get('teamId') as string | null)?.trim() || null;
    const leagueId = (formData.get('leagueId') as string | null)?.trim() || null;
    const tier = formData.get('tier') as string;
    const status = formData.get('status') as string;

    if (entityType !== 'team' && entityType !== 'league') return { error: `Invalid entity type: ${entityType}` };
    if (entityType === 'team' && !teamId) return { error: 'Team is required when entity type is team' };
    if (entityType === 'league' && !leagueId) return { error: 'League is required when entity type is league' };
    if (!VALID_TIERS.includes(tier as any)) return { error: `Invalid tier: ${tier}` };
    if (!VALID_STATUSES.includes(status as any)) return { error: `Invalid status: ${status}` };

    const billingContactName = (formData.get('billingContactName') as string) || null;
    const billingContactEmail = (formData.get('billingContactEmail') as string) || null;
    const trialStartsAt = (formData.get('trialStartsAt') as string) || null;
    const trialEndsAt = (formData.get('trialEndsAt') as string) || null;
    const startsAt = (formData.get('startsAt') as string) || null;
    const endsAt = (formData.get('endsAt') as string) || null;
    const monthlyPriceCents = parseCents(formData.get('monthlyPriceCents') as string | null);
    const notes = (formData.get('notes') as string) || null;

    const { error } = await (supabase as any).from('subscriptions').insert({
      entity_type: entityType,
      team_id: entityType === 'team' ? teamId : null,
      league_id: entityType === 'league' ? leagueId : null,
      tier,
      status,
      billing_contact_name: billingContactName,
      billing_contact_email: billingContactEmail,
      trial_starts_at: trialStartsAt || null,
      trial_ends_at: trialEndsAt || null,
      starts_at: startsAt || null,
      ends_at: endsAt || null,
      monthly_price_cents: monthlyPriceCents,
      notes,
    });

    if (error) return { error: error.message };

    revalidatePath('/admin/billing');
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function updateSubscription(formData: FormData) {
  try {
    const supabase = await getAdminClient();

    const id = ((formData.get('id') as string) || '').trim();
    if (!id) return { error: 'Missing or invalid subscription id' };

    const tier = formData.get('tier') as string;
    const status = formData.get('status') as string;

    if (!VALID_TIERS.includes(tier as any)) return { error: `Invalid tier: ${tier}` };
    if (!VALID_STATUSES.includes(status as any)) return { error: `Invalid status: ${status}` };

    const billingContactName = (formData.get('billingContactName') as string) || null;
    const billingContactEmail = (formData.get('billingContactEmail') as string) || null;
    const trialStartsAt = (formData.get('trialStartsAt') as string) || null;
    const trialEndsAt = (formData.get('trialEndsAt') as string) || null;
    const startsAt = (formData.get('startsAt') as string) || null;
    const endsAt = (formData.get('endsAt') as string) || null;
    const monthlyPriceCents = parseCents(formData.get('monthlyPriceCents') as string | null);
    const notes = (formData.get('notes') as string) || null;

    const { data, error } = await (supabase as any)
      .from('subscriptions')
      .update({
        tier,
        status,
        billing_contact_name: billingContactName,
        billing_contact_email: billingContactEmail,
        trial_starts_at: trialStartsAt || null,
        trial_ends_at: trialEndsAt || null,
        starts_at: startsAt || null,
        ends_at: endsAt || null,
        monthly_price_cents: monthlyPriceCents,
        notes,
      })
      .eq('id', id)
      .select();

    if (error) return { error: error.message };
    if (!data || data.length === 0) return { error: 'Subscription not found' };

    revalidatePath('/admin/billing');
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
