'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';

const COACH_ROLES = ['head_coach', 'assistant_coach', 'athletic_director'];

/**
 * Bump `team_integrations.config.ics_token_version`, invalidating the
 * previous ICS feed URL. Any calendar client subscribed to the old URL will
 * get 401 from the edge function until the user re-subscribes with the new
 * URL from the integrations page.
 */
export async function regenerateIcsToken(
  teamId: string,
): Promise<{ ok: true; version: number } | { ok: false; error: string }> {
  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated.' };

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: membership } = await db
    .from('team_members')
    .select('role')
    .eq('team_id', teamId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();

  if (!membership || !COACH_ROLES.includes(membership.role)) {
    return { ok: false, error: 'Only coaches can regenerate the calendar URL.' };
  }

  const { data: existing } = await db
    .from('team_integrations')
    .select('id, config')
    .eq('team_id', teamId)
    .eq('service', 'calendar_ics')
    .maybeSingle();

  const prevVersion = Number((existing?.config as Record<string, unknown> | null)?.ics_token_version ?? 0);
  const nextVersion = prevVersion + 1;

  const nextConfig = {
    ...(existing?.config as Record<string, unknown> | null ?? {}),
    ics_token_version: nextVersion,
    ics_token_rotated_at: new Date().toISOString(),
  };

  const { error } = await db
    .from('team_integrations')
    .upsert(
      {
        team_id: teamId,
        service: 'calendar_ics',
        config: nextConfig,
        is_active: true,
        connected_by: user.id,
      },
      { onConflict: 'team_id,service' },
    );

  if (error) {
    return { ok: false, error: `Failed to rotate token: ${error.message}` };
  }

  revalidatePath(`/teams/${teamId}/admin/integrations`);
  return { ok: true, version: nextVersion };
}
