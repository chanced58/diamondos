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

export async function createSubscription(formData: FormData) {
  const supabase = await getAdminClient();

  const entityType = formData.get('entityType') as string;
  const teamId = formData.get('teamId') as string | null;
  const leagueId = formData.get('leagueId') as string | null;
  const tier = formData.get('tier') as string;
  const status = formData.get('status') as string;
  const billingContactName = (formData.get('billingContactName') as string) || null;
  const billingContactEmail = (formData.get('billingContactEmail') as string) || null;
  const trialStartsAt = (formData.get('trialStartsAt') as string) || null;
  const trialEndsAt = (formData.get('trialEndsAt') as string) || null;
  const startsAt = (formData.get('startsAt') as string) || null;
  const endsAt = (formData.get('endsAt') as string) || null;
  const monthlyPriceCents = formData.get('monthlyPriceCents')
    ? parseInt(formData.get('monthlyPriceCents') as string, 10)
    : null;
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
}

export async function updateSubscription(formData: FormData) {
  const supabase = await getAdminClient();

  const id = formData.get('id') as string;
  const tier = formData.get('tier') as string;
  const status = formData.get('status') as string;
  const billingContactName = (formData.get('billingContactName') as string) || null;
  const billingContactEmail = (formData.get('billingContactEmail') as string) || null;
  const trialStartsAt = (formData.get('trialStartsAt') as string) || null;
  const trialEndsAt = (formData.get('trialEndsAt') as string) || null;
  const startsAt = (formData.get('startsAt') as string) || null;
  const endsAt = (formData.get('endsAt') as string) || null;
  const monthlyPriceCents = formData.get('monthlyPriceCents')
    ? parseInt(formData.get('monthlyPriceCents') as string, 10)
    : null;
  const notes = (formData.get('notes') as string) || null;

  const { error } = await (supabase as any)
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
    .eq('id', id);

  if (error) return { error: error.message };

  revalidatePath('/admin/billing');
  return { success: true };
}
