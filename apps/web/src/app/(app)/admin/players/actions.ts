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

  // Reactivate an existing non-cancelled row if one exists; otherwise insert.
  // The partial unique index idx_subscriptions_user_unique_active races two
  // concurrent admins, so fall back to the update path on 23505.
  const { data: existing } = await db
    .from('subscriptions')
    .select('id')
    .eq('entity_type', 'player')
    .eq('user_id', userId)
    .in('status', ['active', 'trial', 'past_due'])
    .limit(1)
    .maybeSingle();

  if (existing) {
    const { error } = await db
      .from('subscriptions')
      .update({ status: 'active', tier: 'pro' })
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
    if (error) {
      // 23505 = unique_violation — another admin's insert won the race. Update
      // the row they just created instead.
      if (error.code === '23505') {
        const { error: updateErr } = await db
          .from('subscriptions')
          .update({ status: 'active', tier: 'pro' })
          .eq('entity_type', 'player')
          .eq('user_id', userId)
          .not('status', 'in', '(cancelled,expired)');
        if (updateErr) return { error: updateErr.message };
      } else {
        return { error: error.message };
      }
    }
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

  // updated_at is maintained by the set_subscriptions_updated_at trigger.
  const { error } = await db
    .from('subscriptions')
    .update({ status: 'cancelled', ends_at: new Date().toISOString() })
    .eq('entity_type', 'player')
    .eq('user_id', userId)
    .in('status', ['active', 'trial', 'past_due']);
  if (error) return { error: error.message };

  revalidatePath('/admin/players');
  revalidatePath('/p/[handle]', 'page');
  revalidatePath('/players/me');
  return { ok: true };
}
