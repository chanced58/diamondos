import type { SupabaseClient } from '@supabase/supabase-js';

export interface PushInput {
  userIds: string[];
  title: string;
  body: string;
  /** Deep-link data; the mobile app routes taps on `data.kind`. */
  data?: Record<string, unknown>;
}

/**
 * Send a push notification through the `push-notifications` edge function.
 * Best-effort: a failure is logged and never thrown, so a notification can't
 * break the write that triggered it.
 */
export async function sendPush(db: SupabaseClient, input: PushInput): Promise<void> {
  if (input.userIds.length === 0) return;
  try {
    const { error } = await db.functions.invoke('push-notifications', { body: input });
    if (error) {
      console.error(`[sendPush] push-notifications failed title="${input.title}" users=${input.userIds.length}:`, error);
    }
  } catch (error) {
    console.error(`[sendPush] push-notifications threw title="${input.title}" users=${input.userIds.length}:`, error);
  }
}
