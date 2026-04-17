import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { getProfileByUserId } from '@baseball/database';
import type { PlayerProfile } from '@baseball/shared';

export const PLAYER_MEDIA_BUCKET = 'player-media';

export interface PlayerProStatus {
  isPro: boolean;
  profile: PlayerProfile | null;
}

/**
 * Resolves Player Pro status and profile for a user using the service role key.
 *
 * Pro = an active/trial subscription with entity_type='player' for this user.
 */
export async function getPlayerPro(userId: string): Promise<PlayerProStatus> {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return { isPro: false, profile: null };

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey);

  try {
    const [{ data: sub }, profile] = await Promise.all([
      db
        .from('subscriptions')
        .select('id, status')
        .eq('entity_type', 'player')
        .eq('user_id', userId)
        .in('status', ['active', 'trial'])
        .limit(1)
        .maybeSingle(),
      getProfileByUserId(db, userId),
    ]);

    return { isPro: !!sub, profile };
  } catch (err) {
    console.error(`[player-pro] Failed to resolve Pro status for user ${userId}:`, err);
    return { isPro: false, profile: null };
  }
}
