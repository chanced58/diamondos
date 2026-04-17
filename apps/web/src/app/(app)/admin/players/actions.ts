'use server';

import { revalidatePath } from 'next/cache';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';

type ActionResult = { error: string } | { ok: true };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminCtx = { db: SupabaseClient<any>; user: User };

async function requirePlatformAdmin(): Promise<{ error: string } | AdminCtx> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated.' };

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return { error: 'Server is not configured.' };
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);

  const { data: profile } = await db
    .from('user_profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .single();
  if (!profile?.is_platform_admin) {
    return { error: 'Only platform admins can perform this action.' };
  }

  return { db, user };
}

/** Insert or reactivate a player-entity subscription for this user. */
export async function activatePlayerProAction(userId: string): Promise<ActionResult> {
  const ctx = await requirePlatformAdmin();
  if ('error' in ctx) return ctx;
  const { db } = ctx;

  // Is there an existing non-cancelled row? If so, set status to active.
  const { data: existing } = await db
    .from('subscriptions')
    .select('id, status')
    .eq('entity_type', 'player')
    .eq('user_id', userId)
    .in('status', ['active', 'trial', 'past_due'])
    .limit(1)
    .maybeSingle();

  if (existing) {
    const { error } = await db
      .from('subscriptions')
      .update({
        status: 'active',
        tier: 'pro',
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await db.from('subscriptions').insert({
      entity_type: 'player',
      user_id: userId,
      tier: 'pro',
      status: 'active',
      starts_at: new Date().toISOString(),
    });
    if (error) return { error: error.message };
  }

  revalidatePath('/admin/players');
  revalidatePath('/p/[handle]', 'page');
  revalidatePath('/players/me');
  return { ok: true };
}

export async function deactivatePlayerProAction(userId: string): Promise<ActionResult> {
  const ctx = await requirePlatformAdmin();
  if ('error' in ctx) return ctx;
  const { db } = ctx;

  const { error } = await db
    .from('subscriptions')
    .update({
      status: 'cancelled',
      ends_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('entity_type', 'player')
    .eq('user_id', userId)
    .in('status', ['active', 'trial', 'past_due']);
  if (error) return { error: error.message };

  revalidatePath('/admin/players');
  revalidatePath('/p/[handle]', 'page');
  revalidatePath('/players/me');
  return { ok: true };
}
